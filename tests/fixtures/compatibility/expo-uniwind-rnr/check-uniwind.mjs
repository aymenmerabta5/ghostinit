import { readFileSync } from "fs";
const pkgPath = "./node_modules/uniwind/package.json";
try {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  console.log("uniwind package.json name:", pkg.name, "version:", pkg.version);
  console.log("description:", pkg.description);
  console.log("peerDeps:", JSON.stringify(pkg.peerDependencies));
  // Check if RN binding (look for react-native export condition)
  const hasRN = JSON.stringify(pkg.exports).includes("react-native");
  console.log("has react-native export condition (RN binding):", hasRN);
  if (pkg.description && pkg.description.includes("React Native")) {
    console.log("PASS: uniwind is RN binding (founded-labs/Unistack), not Vue 2.0.3");
  } else {
    console.log("WARN: description doesn't mention React Native");
  }
  // Check if Vue? Vue package would have vue peer
  const isVue = pkg.peerDependencies && pkg.peerDependencies.vue;
  console.log("isVue (has vue peer):", !!isVue);
} catch (e) {
  console.error("FAIL uniwind check", e);
  process.exit(1);
}
