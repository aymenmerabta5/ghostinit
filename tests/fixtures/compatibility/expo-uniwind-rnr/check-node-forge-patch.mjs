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
const installedRoot = realpathSync(join(root, "node_modules", "node-forge"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-forge-security-"));

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

function forgeProbe(packageRoot, tampered, timeout) {
  const source = `
const forge = require(${JSON.stringify(packageRoot.replaceAll("\\", "/"))});
const asn1 = forge.asn1;
const pki = forge.pki;
const keys = pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
const md = forge.md.sha256.create();
md.update("ghostinit-forge-patch-proof", "utf8");
const digest = md.digest().getBytes();
const good = keys.privateKey.sign(md, "RSASSA-PKCS1-V1_5");
if (keys.publicKey.verify(digest, good) !== true) {
  console.log("POSITIVE-FAIL");
  process.exit(0);
}
console.log("POSITIVE-OK");
if (!${tampered ? "true" : "false"}) process.exit(0);
const sha256Oid = asn1.oidToDer(pki.oids.sha256).getBytes();
const nested = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, sha256Oid),
]);
const alg = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, sha256Oid),
  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
  nested,
]);
const di = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
  alg,
  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
]);
const t = asn1.toDer(di).getBytes();
const k = Math.ceil(keys.publicKey.n.bitLength() / 8);
const em = "\\x00\\x01" + "\\xFF".repeat(k - t.length - 3) + "\\x00" + t;
const forged = pki.rsa.encrypt(em, keys.privateKey, false);
try {
  const accepted = keys.publicKey.verify(digest, forged);
  console.log(accepted === true ? "TAMPERED-ACCEPTED" : "TAMPERED-REJECTED");
} catch (error) {
  console.log("TAMPERED-THREW: " + (error.message || ""));
}
`;
  return spawnSync(process.execPath, ["-e", source], {
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
}

function expectPatched(packageRoot, label) {
  const result = forgeProbe(packageRoot, true, 120_000);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} did not settle: ${result.error?.message ?? result.stderr}`);
  }
  if (!result.stdout.includes("POSITIVE-OK")) {
    throw new Error(`${label} broke legitimate signatures:\n${result.stdout}\n${result.stderr}`);
  }
  if (!result.stdout.includes("TAMPERED-THREW") || !result.stdout.includes("Unexpected DigestAlgorithm")) {
    throw new Error(`${label} still accepts the nested-DigestAlgorithm forgery:\n${result.stdout}`);
  }
}

function expectVulnerable(packageRoot, label) {
  const result = forgeProbe(packageRoot, true, 120_000);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} did not settle: ${result.error?.message ?? result.stderr}`);
  }
  if (!result.stdout.includes("POSITIVE-OK")) {
    throw new Error(`${label} positive control failed:\n${result.stdout}`);
  }
  if (!result.stdout.includes("TAMPERED-ACCEPTED")) {
    throw new Error(`${label} did not reproduce the advisory acceptance:\n${result.stdout}`);
  }
}

function reverseReviewedPatch(packageRoot) {
  const target = join(packageRoot, "lib", "rsa.js");
  const before = readFileSync(target, "utf8");
  const reversed = before
    .replace("    captureAsn1: 'digestAlgorithm',\n", "")
    .replace(
      /          \/\/ GHSA-86w9-cpqp-85rv: asn1\.validate accepts trailing elements, so\n          \/\/ a DigestAlgorithm SEQUENCE carrying extra nested elements passed\n          \/\/ validation\. RFC 8017 permits only the OID plus optional NULL\n          \/\/ parameters; reject anything else\.\n          var digestAlgorithm = capture\.digestAlgorithm;\n          var expectedAlgorithmElements = \('parameters' in capture\) \? 2 : 1;\n          if\(!digestAlgorithm \|\|\n            digestAlgorithm\.value\.length !== expectedAlgorithmElements\) \{\n            throw new Error\(\n              'ASN\.1 object does not contain a valid RSASSA-PKCS1-v1_5 ' \+\n              'DigestInfo value\. Unexpected DigestAlgorithm elements\.'\);\n          \}\n/,
      "",
    );
  if (
    reversed === before ||
    reversed.includes("captureAsn1: 'digestAlgorithm'") ||
    reversed.includes("Unexpected DigestAlgorithm")
  ) {
    throw new Error("Could not reconstruct the reviewed vulnerable node-forge source");
  }
  writeFileSync(target, reversed);
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
  expectPatched(installedRoot, "Patched node-forge");

  const vulnerableRoot = join(temporaryRoot, "vulnerable-node-forge");
  cpSync(installedRoot, vulnerableRoot, { recursive: true });
  reverseReviewedPatch(vulnerableRoot);
  expectVulnerable(vulnerableRoot, "Unpatched node-forge");

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
  cpSync(installedRoot, join(auditRoot, "node_modules", "node-forge"), { recursive: true });
  cpSync(join(root, "node_modules", "image-size"), join(auditRoot, "node_modules", "image-size"), {
    recursive: true,
  });
  cpSync(join(root, "node_modules", "braces"), join(auditRoot, "node_modules", "braces"), {
    recursive: true,
  });

  expectAuditSuccess(auditRoot, "Reviewed node-forge patch");

  const patchPath = join(auditRoot, "patches", "node-forge@1.4.0.patch");
  const reviewedPatch = readFileSync(patchPath, "utf8");

  safeCleanup(patchPath);
  expectAuditFailure(auditRoot, "Missing patch", "reviewed node-forge patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch + "\n# tampered\n");
  expectAuditFailure(auditRoot, "Tampered patch", "reviewed node-forge patch is missing");
  writeFileSync(patchPath, reviewedPatch);

  writeFileSync(patchPath, reviewedPatch.replace(/\r?\n/g, "\r\n"));
  expectAuditFailure(auditRoot, "CRLF-normalized patch", "SHA-256 changed");
  writeFileSync(patchPath, reviewedPatch);

  const auditInstall = join(auditRoot, "node_modules", "node-forge");
  safeCleanup(auditInstall);
  expectAuditFailure(auditRoot, "Missing install", "node-forge@1.4.0 is not installed");
  cpSync(installedRoot, auditInstall, { recursive: true });

  const rsaPath = join(auditInstall, "lib", "rsa.js");
  const reviewedRsa = readFileSync(rsaPath, "utf8");
  writeFileSync(rsaPath, `${reviewedRsa}\n// tampered\n`);
  expectAuditFailure(auditRoot, "Tampered install", "installed node-forge patch was not applied exactly");
  writeFileSync(rsaPath, reviewedRsa);

  const aliasInstall = join(auditRoot, "node_modules", "node-forge-alias");
  cpSync(installedRoot, aliasInstall, { recursive: true });
  reverseReviewedPatch(aliasInstall);
  expectAuditFailure(
    auditRoot,
    "Aliased install with an unpatched copy",
    "installed node-forge patch was not applied exactly",
  );
  safeCleanup(aliasInstall);

  console.log(
    "node-forge advisory patch: signature roundtrip, forgery rejection, exploit delta, digest, CRLF, alias, and tamper checks passed",
  );
} finally {
  safeCleanup(temporaryRoot);
}
