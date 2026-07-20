import { tv } from "tailwind-variants";
import { twMerge } from "tailwind-merge";
const b = tv({ base: "px-2", variants: { color: { red: "bg-red-500" } } });
const m = twMerge(b({ color: "red" }), "text-white");
if (!m.includes("bg-red-500")) { process.exit(1); }
console.log("PASS: tailwind-variants 0.3.1 + tailwind-merge 3.6.0 compatible, merged:", m);
