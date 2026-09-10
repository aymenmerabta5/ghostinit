import {
  DEPENDENCY_SECURITY_RUNTIME,
  DEPENDENCY_SECURITY_RUNTIME_SHA256,
} from "../../generation/embedded-dependency-security-runtime.js";
export {
  DEPENDENCY_SECURITY_RUNTIME_PATH,
  DEPENDENCY_SECURITY_INTEGRITY_PATH,
} from "../../domain/dependency-security/artifacts.js";

/** The verifier and loader use only Node builtins and never execute unchecked bytes. */
export function dependencySecurityIntegrityContent(): string {
  return `const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire, isBuiltin } = require("node:module");
const { Script } = require("node:vm");

const EXPECTED_SHA256 = ${JSON.stringify(DEPENDENCY_SECURITY_RUNTIME_SHA256)};
const EXPECTED_BYTES = ${Buffer.byteLength(DEPENDENCY_SECURITY_RUNTIME, "utf8")};
const ROOT = path.resolve(__dirname, "../..");
const FILE = path.join(ROOT, "scripts/lib/dependency-security.cjs");

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function directories() {
  return [ROOT, path.join(ROOT, "scripts"), path.join(ROOT, "scripts/lib")].map((directory) => {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, fs.realpathSync(directory)) !== "") {
      throw new Error("Compiled dependency security integrity failed: a parent directory is linked or invalid");
    }
    return { directory, stat };
  });
}

function readVerifiedRuntime() {
  const parents = directories();
  const before = fs.lstatSync(FILE);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== EXPECTED_BYTES) {
    throw new Error("Compiled dependency security integrity failed: expected the exact regular compiler artifact");
  }
  const descriptor = fs.openSync(FILE, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!sameIdentity(before, opened)) throw new Error("Compiled dependency security integrity failed: artifact changed while opening");
    const source = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(FILE);
    if (!sameIdentity(opened, after) || !sameIdentity(after, current) || current.isSymbolicLink() || current.nlink !== 1 || source.length !== EXPECTED_BYTES || createHash("sha256").update(source).digest("hex") !== EXPECTED_SHA256) {
      throw new Error("Compiled dependency security integrity failed: compiler artifact was modified");
    }
    const finalParents = directories();
    if (parents.some((parent, index) => !sameIdentity(parent.stat, finalParents[index].stat))) {
      throw new Error("Compiled dependency security integrity failed: parent directory changed");
    }
    return source.toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function verifyDependencySecurityRuntime() {
  readVerifiedRuntime();
}

function loadDependencySecurityRuntime() {
  const source = readVerifiedRuntime();
  const requireBuiltin = createRequire(FILE);
  const checkedRequire = (specifier) => {
    if (!isBuiltin(specifier)) throw new Error("Compiled dependency security runtime requested a non-builtin import");
    return requireBuiltin(specifier);
  };
  const compiled = new Script("(function(exports, require, module, __filename, __dirname) {\\n" + source + "\\n})", { filename: FILE });
  const runtimeModule = { exports: {} };
  compiled.runInThisContext().call(runtimeModule.exports, runtimeModule.exports, checkedRequire, runtimeModule, FILE, path.dirname(FILE));
  if (typeof runtimeModule.exports.runDependencySecurity !== "function") throw new Error("Compiled dependency security runtime has no entrypoint");
  return runtimeModule.exports;
}

module.exports = { verifyDependencySecurityRuntime, loadDependencySecurityRuntime };
if (require.main === module) {
  try { verifyDependencySecurityRuntime(); console.log("Compiled dependency security integrity verified."); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
`;
}
