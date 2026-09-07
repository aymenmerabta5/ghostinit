import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

const outputs = new Map<string, Map<string, string>>();

export function generatedUiOutput(
  framework: "nextjs" | "tanstack-start",
  mode: "monorepo" | "single" = "monorepo",
) {
  const key = `${mode}/${framework}`;
  let files = outputs.get(key);
  if (!files) {
    const result = resolveCreateConfig({
      name: "browser-regression",
      runtime: "bun",
      mode,
      framework,
      database: "postgres",
      databaseWasExplicit: true,
      preset: "saas",
      billing: [],
      features: ["i18n"],
      apps: mode === "monorepo" ? ["web", "mobile", "desktop"] : ["web"],
      cache: "none",
      deploy: "none",
      withNotifications: true,
      withMessaging: true,
      withPdf: true,
    });
    if (!result.ok) throw new Error(result.message);
    const plan = buildProjectGenerationPlan(result.resolvedConfig, {
      desiredConfig: result.desiredConfig,
    });
    files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
    outputs.set(key, files);
  }
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  return {
    root,
    read(path: string): string {
      const source = files.get(path);
      if (!source) throw new Error(`Missing generated ${path}`);
      return source;
    },
  };
}
