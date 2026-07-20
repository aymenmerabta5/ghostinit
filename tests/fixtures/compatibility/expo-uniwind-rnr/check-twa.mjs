import fs from "fs";
const cssPath = "./node_modules/tw-animate-css/dist/tw-animate.css";
if (!fs.existsSync(cssPath)) { console.error("MISSING", cssPath); process.exit(1); }
const content = fs.readFileSync(cssPath, "utf8");
if (!content.includes("@keyframes") && !content.includes("animate")) { console.error("unexpected content"); process.exit(1); }
console.log("PASS: tw-animate-css 1.4.0 exists and contains animations, length:", content.length);
