import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const root = process.cwd();
const installedRoot = realpathSync(join(root, "node_modules", "image-size"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-image-size-security-"));

function makeDirectoryLink(target, link) {
  symlinkSync(resolve(target), link, process.platform === "win32" ? "junction" : "dir");
}

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

function parserProbe(packageRoot, kind, timeout) {
  const source = `
const root = ${JSON.stringify(packageRoot.replaceAll("\\", "/"))};
const kind = ${JSON.stringify(kind)};
const buffer = Buffer.alloc(kind === "jxl" ? 20 : 16);
if (kind === "icns") {
  buffer.write("icns", 0, "ascii");
  buffer.writeUInt32BE(16, 4);
  buffer.write("ic07", 8, "ascii");
  buffer.writeUInt32BE(0, 12);
  try { require(root + "/dist/types/icns.js").ICNS.calculate(buffer); } catch {}
} else if (kind === "jxl") {
  buffer.writeUInt32BE(12, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("jxl ", 8, "ascii");
  buffer.writeUInt32BE(0, 12);
  buffer.write("jxlp", 16, "ascii");
  try { require(root + "/dist/types/jxl.js").JXL.calculate(buffer); } catch {}
} else {
  buffer.writeUInt32BE(0, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("heic", 8, "ascii");
  require(root + "/dist/types/heif.js").HEIF.validate(buffer);
}
`;
  return spawnSync(process.execPath, ["-e", source], {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
}

function expectPrompt(packageRoot, kind) {
  const result = parserProbe(packageRoot, kind, 5_000);
  if (result.error || result.status !== 0) {
    throw new Error(`Patched ${kind} parser did not settle promptly: ${result.error?.message ?? result.stderr}`);
  }
}

function expectHang(packageRoot, kind) {
  const result = parserProbe(packageRoot, kind, 750);
  if (result.error?.code !== "ETIMEDOUT") {
    throw new Error(`Unpatched ${kind} parser unexpectedly settled; exploit regression was not reproduced`);
  }
}

function reverseReviewedPatch(packageRoot) {
  const icnsPath = join(packageRoot, "dist", "types", "icns.js");
  const utilsPath = join(packageRoot, "dist", "types", "utils.js");
  const icns = readFileSync(icnsPath, "utf8")
    .replace(
      /function nextImageOffset\(imageOffset, imageLength\) \{[\s\S]*?\n\}\nexports\.ICNS = \{/,
      "exports.ICNS = {",
    )
    .replaceAll(
      "imageOffset = nextImageOffset(imageOffset, imageHeader[1]);",
      "imageOffset += imageHeader[1];",
    );
  const utils = readFileSync(utilsPath, "utf8").replace(
    "if (boxSize < 8 || input.length - offset < boxSize)",
    "if (input.length - offset < boxSize)",
  );
  if (icns.includes("nextImageOffset") || !utils.includes("if (input.length - offset < boxSize)")) {
    throw new Error("Could not reconstruct the reviewed vulnerable image-size source");
  }
  writeFileSync(icnsPath, icns);
  writeFileSync(utilsPath, utils);
}

function runAudit(projectRoot) {
  return spawnSync(process.execPath, ["run", "audit:dependencies"], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
}

function attestCurrentLock(projectRoot) {
  const lockPath = join(projectRoot, "bun.lock");
  const evidencePath = join(projectRoot, "dependency-lock-evidence.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  evidence.lockSha256 = createHash("sha256").update(readFileSync(lockPath)).digest("hex");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
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
  for (const kind of ["icns", "jxl", "heif"]) expectPrompt(installedRoot, kind);

  const vulnerableRoot = join(temporaryRoot, "vulnerable-image-size");
  cpSync(installedRoot, vulnerableRoot, { recursive: true });
  reverseReviewedPatch(vulnerableRoot);
  // image-size 1.2.1 has the vulnerable JXL loop. Its HEIF implementation does
  // not yet contain the later looping traversal covered by the same advisory;
  // the shared readBox hardening still rejects its undersized boxes.
  for (const kind of ["icns", "jxl"]) expectHang(vulnerableRoot, kind);
  expectPrompt(vulnerableRoot, "heif");

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
  cpSync(
    join(root, "patches", "image-size@1.2.1.patch"),
    join(auditRoot, "patches", "image-size@1.2.1.patch"),
  );
  cpSync(installedRoot, join(auditRoot, "node_modules", "image-size"), { recursive: true });

  expectAuditSuccess(auditRoot, "Reviewed Bun 1.4 fixture lock v1");

  const manifestPath = join(auditRoot, "package.json");
  const lockPath = join(auditRoot, "bun.lock");
  const patchPath = join(auditRoot, "patches", "image-size@1.2.1.patch");
  const reviewedManifest = readFileSync(manifestPath, "utf8");
  const reviewedLock = readFileSync(lockPath, "utf8");
  const reviewedPatch = readFileSync(patchPath, "utf8");
  const lockVersionOne = '"lockfileVersion": 1';
  if (!reviewedLock.includes(lockVersionOne)) {
    throw new Error("The committed Expo fixture no longer exercises Bun text lock v1");
  }
  const freshMobileLock = reviewedLock.replace(lockVersionOne, '"lockfileVersion": 2');
  writeFileSync(lockPath, freshMobileLock);
  attestCurrentLock(auditRoot);
  expectAuditSuccess(auditRoot, "Fresh Bun 1.4 generated mobile lock v2");
  const unsupportedLock = reviewedLock.replace(lockVersionOne, '"lockfileVersion": 3');
  writeFileSync(lockPath, unsupportedLock);
  expectAuditFailure(auditRoot, "Unsupported future lock version", "unsupported lockfile version");
  writeFileSync(lockPath, reviewedLock);
  attestCurrentLock(auditRoot);

  safeCleanup(patchPath);
  expectAuditFailure(auditRoot, "Missing patch", "reviewed image-size patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch + "\n# tampered\n");
  expectAuditFailure(auditRoot, "Tampered patch", "reviewed image-size patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch.replace(/\r?\n/g, "\r\n"));
  expectAuditFailure(auditRoot, "CRLF-normalized patch", "SHA-256 changed");
  writeFileSync(patchPath, reviewedPatch);

  const auditInstall = join(auditRoot, "node_modules", "image-size");
  safeCleanup(auditInstall);
  expectAuditFailure(auditRoot, "Missing install", "image-size@1.2.1 is not installed");
  cpSync(installedRoot, auditInstall, { recursive: true });

  const utilsPath = join(auditInstall, "dist", "types", "utils.js");
  const reviewedUtils = readFileSync(utilsPath, "utf8");
  writeFileSync(utilsPath, readFileSync(utilsPath, "utf8") + "\n// tampered\n");
  expectAuditFailure(auditRoot, "Tampered install", "installed image-size patch was not applied exactly");
  writeFileSync(utilsPath, reviewedUtils);

  const aliasInstall = join(auditRoot, "node_modules", "image-size-alias");
  cpSync(installedRoot, aliasInstall, { recursive: true });
  reverseReviewedPatch(aliasInstall);
  expectAuditFailure(
    auditRoot,
    "Aliased install with an unpatched copy",
    "installed image-size patch was not applied exactly",
  );
  safeCleanup(aliasInstall);

  const selfNestedInstall = join(auditInstall, "node_modules", "image-size");
  mkdirSync(join(selfNestedInstall, ".."), { recursive: true });
  cpSync(installedRoot, selfNestedInstall, { recursive: true });
  reverseReviewedPatch(selfNestedInstall);
  expectAuditFailure(
    auditRoot,
    "Nested install below image-size with an unpatched copy",
    "installed image-size patch was not applied exactly",
  );
  safeCleanup(selfNestedInstall);

  const duplicateInstall = join(
    auditRoot,
    "node_modules",
    "unpatched-consumer",
    "node_modules",
    "image-size",
  );
  mkdirSync(join(duplicateInstall, ".."), { recursive: true });
  writeFileSync(
    join(auditRoot, "node_modules", "unpatched-consumer", "package.json"),
    '{"name":"unpatched-consumer","version":"1.0.0"}\n',
  );
  cpSync(installedRoot, duplicateInstall, { recursive: true });
  reverseReviewedPatch(duplicateInstall);
  expectAuditFailure(
    auditRoot,
    "Multiple installs with an unpatched copy",
    "installed image-size patch was not applied exactly",
  );
  safeCleanup(join(auditRoot, "node_modules", "unpatched-consumer"));

  const patchBinding = '    "image-size@1.2.1": "patches/image-size@1.2.1.patch",';
  const duplicateBindingLock = reviewedLock.replace(
    patchBinding,
    `${patchBinding}\n${patchBinding}`,
  );
  if (duplicateBindingLock === reviewedLock) throw new Error("Could not duplicate the lock patch binding");
  writeFileSync(lockPath, duplicateBindingLock);
  expectAuditFailure(auditRoot, "Duplicate lock binding", "duplicate object key");
  writeFileSync(lockPath, reviewedLock);

  const lockWithoutBinding = reviewedLock.replace(`${patchBinding}\n`, "");
  if (lockWithoutBinding === reviewedLock) throw new Error("Could not remove the lock patch binding");
  writeFileSync(lockPath, `// ${patchBinding.trim()}\n${lockWithoutBinding}`);
  expectAuditFailure(auditRoot, "Comment-decoy lock binding", "bun.lock does not bind");
  writeFileSync(lockPath, reviewedLock);

  const resolutionPrefix = '    "image-size": ["image-size@1.2.1",';
  const multilineUnreviewedLock = reviewedLock.replace(
    resolutionPrefix,
    '    "image-size": [\n      "image-size@2.0.2",',
  );
  if (multilineUnreviewedLock === reviewedLock) {
    throw new Error("Could not rewrite the lock resolution across lines");
  }
  writeFileSync(lockPath, `// "decoy": ["image-size@1.2.1"]\n${multilineUnreviewedLock}`);
  expectAuditFailure(
    auditRoot,
    "Multiline lock resolution with a one-line decoy",
    "unreviewed or missing image-size resolution",
  );
  writeFileSync(lockPath, reviewedLock);

  const escapedWorkspace = join(temporaryRoot, "escaped-workspace");
  mkdirSync(join(escapedWorkspace, "node_modules"), { recursive: true });
  cpSync(installedRoot, join(escapedWorkspace, "node_modules", "image-size"), { recursive: true });
  const packagesRoot = join(auditRoot, "packages");
  const workspaceLink = join(packagesRoot, "escaped");
  mkdirSync(packagesRoot, { recursive: true });
  makeDirectoryLink(escapedWorkspace, workspaceLink);
  const manifestWithWorkspace = JSON.parse(reviewedManifest);
  manifestWithWorkspace.workspaces = ["packages/*"];
  writeFileSync(manifestPath, `${JSON.stringify(manifestWithWorkspace, null, 2)}\n`);
  expectAuditFailure(auditRoot, "Escaped workspace symlink", "escapes the project root");
  writeFileSync(manifestPath, reviewedManifest);
  unlinkSync(workspaceLink);
  safeCleanup(packagesRoot);

  const outsidePatches = join(temporaryRoot, "outside-patches");
  mkdirSync(outsidePatches, { recursive: true });
  writeFileSync(join(outsidePatches, "image-size@1.2.1.patch"), reviewedPatch);
  const patchesDirectory = join(auditRoot, "patches");
  safeCleanup(patchesDirectory);
  makeDirectoryLink(outsidePatches, patchesDirectory);
  expectAuditFailure(auditRoot, "Escaped patch directory symlink", "escapes the project root");
  unlinkSync(patchesDirectory);
  mkdirSync(patchesDirectory, { recursive: true });
  writeFileSync(patchPath, reviewedPatch);

  console.log(
    "image-size advisory patch: Bun v1/v2 locks, exploit, digest, CRLF, alias, nesting, symlink, lock-decoy, duplicate, and tamper checks passed",
  );
} finally {
  safeCleanup(temporaryRoot);
}
