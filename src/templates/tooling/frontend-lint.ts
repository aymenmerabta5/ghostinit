import { FRONTEND_OWNERSHIP_RUNTIME } from "../../generation/embedded-frontend-runtime.js";
import { DEFAULT_FRONTEND_OWNERSHIP_POLICY } from "../../lib/architecture/frontend/index.js";
import { file, type TemplateFile } from "../shared.js";

export function frontendOwnershipLintFiles(): TemplateFile[] {
  return [
    file("scripts/lib/frontend-ownership.cjs", FRONTEND_OWNERSHIP_RUNTIME),
    file(
      "tooling/frontend-ownership-policy.json",
      JSON.stringify(DEFAULT_FRONTEND_OWNERSHIP_POLICY, null, 2) + "\n",
    ),
    file(
      "scripts/check-frontend-ownership.cjs",
      `#!/usr/bin/env bun
const { analyzeFrontendProject, validateFrontendOwnershipPolicy } = require("./lib/frontend-ownership.cjs");
async function main() {
  const policy = require("../tooling/frontend-ownership-policy.json");
  const errors = validateFrontendOwnershipPolicy(policy);
  if (errors.length) throw new Error(errors.join("; "));
  const report = await analyzeFrontendProject(process.cwd());
  for (const finding of report.findings) console.error(finding.file + ":" + (finding.line || 1) + ":" + (finding.column || 1) + " [" + finding.id + "] " + finding.message);
  if (!report.complete || report.findings.length) process.exitCode = 1;
  else console.log("Frontend ownership check passed (" + report.files + " maintained files).");
}
main().catch((error) => { console.error("Frontend ownership check failed: " + error.message); process.exitCode = 1; });
`,
    ),
  ];
}
