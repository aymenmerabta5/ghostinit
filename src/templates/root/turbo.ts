import { file, type TemplateFile } from "../shared.js";
import { getGlobalEnvKeys, type GlobalEnvAudience } from "../../lib/env-manifest.js";

export function turbo(runtime: "node" | "bun", audience?: GlobalEnvAudience): TemplateFile {
  const dedupedEnvList = getGlobalEnvKeys(runtime, audience);
  return file(
    "turbo.json",
    JSON.stringify(
      {
        $schema: "https://turbo.build/schema.json",
        globalDependencies: ["**/.env.*local", "scripts/test-env.ts", "scripts/*.mjs"],
        globalEnv: dedupedEnvList,
        tasks: {
          build: {
            dependsOn: ["^build"],
            outputs: [
              "dist/**",
              ".next/**",
              "!.next/cache/**",
              ".output/**",
              ".vercel/output/**",
              ".ghostinit/runtime/*-production.mjs",
            ],
          },
          dev: { cache: false, persistent: true },
          start: {
            dependsOn: ["build"],
            cache: false,
            persistent: true,
            // Runtime binding controls must reach the long-lived server without
            // becoming build cache keys for every workspace task.
            passThroughEnv: ["HOST", "NITRO_HOST", "PORT"],
          },
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
