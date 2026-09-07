import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./node_modules/uniwind/package.json", "utf8"));
const peerDependencies = pkg.peerDependencies ?? {};
const exportsText = JSON.stringify(pkg.exports ?? {});

if (pkg.name !== "uniwind") throw new Error(`Unexpected package name: ${String(pkg.name)}`);
if (pkg.version !== "1.11.0") throw new Error(`Unexpected uniwind version: ${String(pkg.version)}`);
if (typeof pkg.description !== "string" || !pkg.description.includes("React Native")) {
  throw new Error("uniwind does not identify itself as a React Native binding");
}
if (!("react-native" in peerDependencies)) {
  throw new Error("uniwind does not declare its react-native peer dependency");
}
if ("vue" in peerDependencies) throw new Error("Resolved uniwind package unexpectedly targets Vue");
if (!exportsText.includes("react-native")) {
  throw new Error("uniwind package exports do not contain a react-native condition");
}

console.log(`PASS: uniwind ${pkg.version} exposes the React Native package contract`);
