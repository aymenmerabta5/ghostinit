import { file, type TemplateFile } from "../../shared.js";

export function toolCheckArchitecture(): TemplateFile {
  return file(
    "apps/eve/agent/tools/check_architecture.ts",
    `import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Run architecture boundary checks for GhostInit monorepo via oxc-parser AST.",
  inputSchema: z.object({}),
  async execute() {
    return { guidance: "Run: ghostinit check --json", command: "ghostinit check --json", qualityGate: "blockers==0 && highs==0" };
  },
});
`,
  );
}
