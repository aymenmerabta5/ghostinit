import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

describe("internal-only jobs integration", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} keeps workers without inventing auth or transport`, () => {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "internal-jobs",
            mode,
            framework: "nextjs",
            database,
            preset: "custom",
            auth: false,
            api: false,
            jobs: true,
            jobsUserFacingApi: false,
            email: false,
            analytics: false,
            billing: [],
            apps: ["web"],
            features: [],
          }),
        );
        const paths = new Set(files.map(({ path }) => path));
        const rootPackage = JSON.parse(
          files.find(({ path }) => path === "package.json")?.content ?? "{}",
        ) as { scripts?: Record<string, string> };

        expect(paths.has("packages/auth/package.json")).toBe(false);
        expect(paths.has("packages/api/package.json")).toBe(false);
        expect(paths.has("src/server/auth/index.ts")).toBe(false);
        expect(paths.has("src/server/api/index.ts")).toBe(false);
        if (database === "postgres") {
          const schemaPath =
            mode === "monorepo"
              ? "packages/database/src/schema/jobs.ts"
              : "src/server/db/schema/jobs.ts";
          const schema = files.find(({ path }) => path === schemaPath)?.content ?? "";
          expect(schema).not.toContain('from "./auth"');
          expect(schema).not.toContain("users.id");
          expect(rootPackage.scripts?.["jobs:worker"]).toContain(
            mode === "monorepo" ? "packages/jobs-runtime/src" : "src/server/workers/jobs",
          );
          expect(paths.has("packages/jobs-runtime/package.json")).toBe(mode === "monorepo");
        } else {
          expect(paths.has("convex/jobs.ts")).toBe(false);
          expect(paths.has("convex/jobsInternal.ts")).toBe(true);
          expect(rootPackage.scripts?.["jobs:deploy"]).toBe("bun x --no-install convex deploy");
        }
      });
    }
  }
});
