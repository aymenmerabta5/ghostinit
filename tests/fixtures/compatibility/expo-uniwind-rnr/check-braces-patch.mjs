import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const root = process.cwd();
const installedRoot = realpathSync(join(root, "node_modules", "braces"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-braces-security-"));
const GUARD_MESSAGE = "Braces pattern exceeds maximum nesting depth (100)";
const DEEP_BRACE = "{".repeat(2000) + "}".repeat(2000);
const DEEP_PAREN = "(".repeat(2000) + ")".repeat(2000);

function safeCleanup(path) {
  const temporaryDirectory = resolve(tmpdir());
  const resolvedPath = resolve(path);
  const descendant = relative(temporaryDirectory, resolvedPath);
  if (
    descendant.length === 0 ||
    descendant === ".." ||
    descendant.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(descendant)
  ) {
    throw new Error(`Refusing to remove unsafe fixture path: ${resolvedPath}`);
  }
  rmSync(resolvedPath, { recursive: true, force: true });
}

function bracesProbe(packageRoot, mode, pattern, timeout) {
  const source = `
const braces = require(${JSON.stringify(packageRoot.replaceAll("\\", "/"))});
try {
  const result = braces[${JSON.stringify(mode)}](${JSON.stringify(pattern)});
  console.log("COMPLETED len=" + String(result).length);
} catch (error) {
  console.log("THREW " + error.constructor.name + ": " + (error.message || ""));
}
`;
  return spawnSync(process.execPath, ["-e", source], {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
}

function expectGuard(packageRoot, mode, pattern, label) {
  const result = bracesProbe(packageRoot, mode, pattern, 10_000);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} did not settle: ${result.error?.message ?? result.stderr}`);
  }
  if (!result.stdout.includes(GUARD_MESSAGE)) {
    throw new Error(`${label} did not raise the nesting guard:\n${result.stdout}\n${result.stderr}`);
  }
  if (result.stdout.includes("Maximum call stack size exceeded")) {
    throw new Error(`${label} exhausted the call stack instead of raising the guard`);
  }
}

function expectNoGuard(packageRoot, mode, pattern, label) {
  const result = bracesProbe(packageRoot, mode, pattern, 10_000);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} did not settle: ${result.error?.message ?? result.stderr}`);
  }
  if (result.stdout.includes(GUARD_MESSAGE)) {
    throw new Error(`${label} unexpectedly raised the nesting guard`);
  }
}

function expectLegit(packageRoot) {
  const source = `
const braces = require(${JSON.stringify(packageRoot.replaceAll("\\", "/"))});
const assert = require("node:assert");
assert.strictEqual(braces.compile("a/{b,c}/d"), "a/(b|c)/d");
assert.deepStrictEqual(braces.expand("user-{1..3}/project-{a,b}"), [
  "user-1/project-a", "user-1/project-b",
  "user-2/project-a", "user-2/project-b",
  "user-3/project-a", "user-3/project-b",
]);
assert.strictEqual(braces.compile("src/**/*.@(js|ts)"), "src/**/*.@(js|ts)");
assert.strictEqual(braces.compile("{a,{b,{c,{d,{e,f}}}}}"), "(a|(b|(c|(d|(e|f)))))");
console.log("LEGIT-OK");
`;
  const result = spawnSync(process.execPath, ["-e", source], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !result.stdout.includes("LEGIT-OK")) {
    throw new Error(`Legitimate patterns regressed:\n${result.stdout}\n${result.stderr}`);
  }
}

function reverseReviewedPatch(packageRoot) {
  for (const file of ["lib/compile.js", "lib/expand.js", "lib/stringify.js"]) {
    const target = join(packageRoot, file);
    const before = readFileSync(target, "utf8");
    const reversed = before
      .replace(
        /  const walk = \(node, parent = \{\}, depth = 0\) => \{\n    \/\/ GHSA-vfj7-8cjw-p6xm: the recursive AST walkers lacked depth guards, so\n    \/\/ deeply nested brace patterns under the character limit exhausted the\n    \/\/ call stack and terminated the process\. Supported tooling never nests\n    \/\/ patterns anywhere near this limit; reject deeper input with a catchable\n    \/\/ error instead of crashing\.\n    if \(depth > 100\) \{\n      throw new RangeError\('Braces pattern exceeds maximum nesting depth \(100\)'\);\n    \}\n/,
        "  const walk = (node, parent = {}) => {\n",
      )
      .replace(
        /  const stringify = \(node, parent = \{\}, depth = 0\) => \{\n    \/\/ GHSA-vfj7-8cjw-p6xm: the recursive AST walkers lacked depth guards, so\n    \/\/ deeply nested brace patterns under the character limit exhausted the\n    \/\/ call stack and terminated the process\. Supported tooling never nests\n    \/\/ patterns anywhere near this limit; reject deeper input with a catchable\n    \/\/ error instead of crashing\.\n    if \(depth > 100\) \{\n      throw new RangeError\('Braces pattern exceeds maximum nesting depth \(100\)'\);\n    \}\n/,
        "  const stringify = (node, parent = {}) => {\n",
      )
      .replaceAll("walk(child, node, depth + 1)", "walk(child, node)")
      .replaceAll("stringify(child, undefined, depth + 1)", "stringify(child)");
    if (reversed === before || reversed.includes("maximum nesting depth")) {
      throw new Error(`Could not reconstruct the reviewed vulnerable braces source: ${file}`);
    }
    writeFileSync(target, reversed);
  }
}

function runAudit(projectRoot) {
  return spawnSync(process.execPath, ["run", "audit:dependencies"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
}

function expectAuditSuccess(projectRoot, label) {
  const result = runAudit(projectRoot);
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label} audit did not pass: ${result.error?.message ?? `${result.stdout}\n${result.stderr}`}`,
    );
  }
}

function expectAuditFailure(projectRoot, label, expectedMessage) {
  const result = runAudit(projectRoot);
  if (result.error) throw new Error(`${label} audit could not run: ${result.error.message}`);
  if (result.status === 0) throw new Error(`${label} unexpectedly passed the audit`);
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(`${label} failed for the wrong reason:\n${output}`);
  }
}

try {
  expectLegit(installedRoot);
  expectGuard(installedRoot, "compile", DEEP_BRACE, "Patched deep braces");
  expectGuard(installedRoot, "expand", DEEP_BRACE, "Patched deep expansion");
  expectGuard(installedRoot, "compile", DEEP_PAREN, "Patched deep parens");

  const vulnerableRoot = join(temporaryRoot, "vulnerable-braces");
  cpSync(installedRoot, vulnerableRoot, { recursive: true });
  reverseReviewedPatch(vulnerableRoot);
  expectLegit(vulnerableRoot);
  // The unpatched walkers recurse per nesting level with no guard. On a
  // constrained stack this ends in "Maximum call stack size exceeded"; on a
  // generous stack it still completes. Either way the guard must be absent.
  expectNoGuard(vulnerableRoot, "compile", DEEP_BRACE, "Unpatched deep braces");

  const auditRoot = join(temporaryRoot, "audit-project");
  mkdirSync(join(auditRoot, "scripts"), { recursive: true });
  mkdirSync(join(auditRoot, "patches"), { recursive: true });
  mkdirSync(join(auditRoot, "node_modules"), { recursive: true });
  for (const path of [
    "package.json",
    "bun.lock",
    "bunfig.toml",
    "dependency-lock-evidence.json",
  ]) {
    cpSync(join(root, path), join(auditRoot, path));
  }
  cpSync(join(root, "scripts", "audit-dependencies.ts"), join(auditRoot, "scripts", "audit-dependencies.ts"));
  for (const patch of [
    "image-size@1.2.1.patch",
    "braces@3.0.3.patch",
    "node-forge@1.4.0.patch",
  ]) {
    cpSync(join(root, "patches", patch), join(auditRoot, "patches", patch));
  }
  cpSync(installedRoot, join(auditRoot, "node_modules", "braces"), { recursive: true });
  cpSync(join(root, "node_modules", "image-size"), join(auditRoot, "node_modules", "image-size"), {
    recursive: true,
  });
  cpSync(join(root, "node_modules", "node-forge"), join(auditRoot, "node_modules", "node-forge"), {
    recursive: true,
  });

  expectAuditSuccess(auditRoot, "Reviewed braces patch");

  const patchPath = join(auditRoot, "patches", "braces@3.0.3.patch");
  const reviewedPatch = readFileSync(patchPath, "utf8");

  safeCleanup(patchPath);
  expectAuditFailure(auditRoot, "Missing patch", "reviewed braces patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch + "\n# tampered\n");
  expectAuditFailure(auditRoot, "Tampered patch", "reviewed braces patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch.replace(/\r?\n/g, "\r\n"));
  expectAuditFailure(auditRoot, "CRLF-normalized patch", "SHA-256 changed");
  writeFileSync(patchPath, reviewedPatch);

  const auditInstall = join(auditRoot, "node_modules", "braces");
  safeCleanup(auditInstall);
  expectAuditFailure(auditRoot, "Missing install", "braces@3.0.3 is not installed");
  cpSync(installedRoot, auditInstall, { recursive: true });

  const compilePath = join(auditInstall, "lib", "compile.js");
  const reviewedCompile = readFileSync(compilePath, "utf8");
  writeFileSync(compilePath, `${reviewedCompile}\n// tampered\n`);
  expectAuditFailure(auditRoot, "Tampered install", "installed braces patch was not applied exactly");
  writeFileSync(compilePath, reviewedCompile);

  const aliasInstall = join(auditRoot, "node_modules", "braces-alias");
  cpSync(installedRoot, aliasInstall, { recursive: true });
  reverseReviewedPatch(aliasInstall);
  expectAuditFailure(
    auditRoot,
    "Aliased install with an unpatched copy",
    "installed braces patch was not applied exactly",
  );
  safeCleanup(aliasInstall);

  console.log(
    "braces advisory patch: legit behavior, nesting guard, exploit delta, digest, CRLF, alias, and tamper checks passed",
  );
} finally {
  safeCleanup(temporaryRoot);
}
