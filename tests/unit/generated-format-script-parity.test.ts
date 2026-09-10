import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  function fullCapabilityProject(framework: "nextjs" | "tanstack-start") {
    return generateProjectFiles(
      projectConfigSchema.parse({
        name: "format-script-parity",
        mode: "monorepo",
        framework,
        database: "postgres",
        preset: "custom",
        auth: true,
        api: true,
        email: true,
        analytics: true,
        billing: ["chargily", globalProvider],
        messaging: true,
        storage: true,
        notifications: true,
        featureFlags: "posthog",
        jobs: true,
        pdf: true,
        cache: "redis",
        apps: ["web", "mobile", "desktop"],
        features: ["i18n"],
      }),
      { dryRun: true },
    );
  }

  function manifestScripts(content: string): Record<string, string> {
    const manifest: unknown = JSON.parse(content);
    if (!manifest || typeof manifest !== "object") return {};
    const scripts = Reflect.get(manifest, "scripts");
    if (!scripts || typeof scripts !== "object") return {};
    return Object.fromEntries(
      Object.entries(scripts).filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      }),
    );
  }

  describe("generated formatting script parity", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${framework} gives every checked workspace a formatting lifecycle`, () => {
        const manifests = fullCapabilityProject(framework).filter(({ path }) =>
          path.endsWith("package.json"),
        );
        const asymmetric = manifests.flatMap(({ path, content }) => {
          const scripts = manifestScripts(content);
          return Boolean(scripts.format) === Boolean(scripts["format:check"])
            ? []
            : [
                `${path}: format=${scripts.format ?? "missing"}, format:check=${scripts["format:check"] ?? "missing"}`,
              ];
        });
        expect(asymmetric).toEqual([]);

        const byPath = new Map(
          manifests.map(({ path, content }) => [path, manifestScripts(content)]),
        );
        for (const path of ["packages/storage/package.json", "packages/realtime/package.json"]) {
          expect(byPath.get(path)?.format, path).toBe("oxfmt --write .");
          expect(byPath.get(path)?.["format:check"], path).toBe("oxfmt --check .");
        }
      });
    }
  });
});
