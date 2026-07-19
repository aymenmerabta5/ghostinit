import { file, type TemplateFile } from "../../shared.js";

export function toolListModules(): TemplateFile {
  return file(
    "apps/eve/agent/tools/list_modules.ts",
    `import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "List existing DDD modules in GhostInit monorepo.",
  inputSchema: z.object({}),
  async execute() { return { guidance: "Run: ghostinit status --json", command: "ghostinit status --json" }; },
});
`,
  );
}
