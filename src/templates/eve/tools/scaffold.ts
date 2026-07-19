import { file, type TemplateFile } from "../../shared.js";

export function toolScaffoldModule(): TemplateFile {
  return file(
    "apps/eve/agent/tools/scaffold_module.ts",
    `import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Scaffold a new DDD bounded-context module in the GhostInit monorepo.",
  inputSchema: z.object({ name: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, "kebab-case") }),
  async execute({ name }) {
    return {
      name,
      guidance: \`To scaffold module "\${name}" run: ghostinit add module \${name} --json\`,
      files: [ \`packages/modules/src/\${name}/domain/types.ts\`, \`packages/modules/src/\${name}/application/index.ts\` ],
      nextSteps: [ \`ghostinit add module \${name}\`, \`ghostinit sync --check\` ],
    };
  },
});
`,
  );
}
