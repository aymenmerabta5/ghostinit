import { verifyOrpcRuntimeCompatibility } from "./src/runtime-check.js";

await verifyOrpcRuntimeCompatibility();
console.log("PASS: oRPC fetch, OpenAPI, Zod, and ORPCError runtime compatibility");
