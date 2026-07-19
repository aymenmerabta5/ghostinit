import { file, type TemplateFile } from "../../shared.js";

export function toolDbMigrate(): TemplateFile {
  return file(
    "apps/eve/agent/tools/db_migrate.ts",
    `import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Generate and run database migrations for Drizzle ORM + Postgres.",
  inputSchema: z.object({ action: z.enum(["generate", "migrate", "push"]) }),
  async execute({ action }) {
    const commands: Record<string, string> = { generate: "bun --env-file=../../.env.local drizzle-kit generate", migrate: "bun --env-file=../../.env.local drizzle-kit migrate", push: "bun --env-file=../../.env.local drizzle-kit push" };
    return { action, command: commands[action] ?? commands.generate, viaTurbo: \`bun run db:\${action}\` };
  },
});
`,
  );
}
