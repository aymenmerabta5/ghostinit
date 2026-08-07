import { file, type TemplateFile } from "../shared.js";
import { getGlobalEnvKeys } from "../../lib/env-manifest.js";

export function turbo(runtime: "node" | "bun"): TemplateFile {
  const dedupedEnvList = getGlobalEnvKeys(runtime);
  return file(
    "turbo.json",
    JSON.stringify(
      {
        $schema: "https://turbo.build/schema.json",
        globalDependencies: ["**/.env.*local"],
        globalEnv: dedupedEnvList,
        tasks: {
          build: { dependsOn: ["^build"], outputs: ["dist/**", ".next/**", "!.next/cache/**"] },
          dev: { cache: false, persistent: true },
          typecheck: { dependsOn: ["^build"] },
          lint: {},
          format: {},
          "format:check": {},
          test: {},
        },
      },
      null,
      2,
    ) + "\n",
  );
}
