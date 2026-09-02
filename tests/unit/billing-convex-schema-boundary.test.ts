import { describe, expect, it } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

function generated(mode: Mode, framework: Framework, database: "postgres" | "convex") {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `billing-${mode}-${framework}-${database}`,
      mode,
      framework,
      database,
      preset: "saas",
      billing: ["stripe"],
      apps: ["web"],
    }),
  );
}

function contentAt(files: ReturnType<typeof generated>, path: string): string {
  return files.find((file) => file.path === path)?.content ?? "";
}

describe("billing database-aware schema boundary", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      it(`${mode}/${framework}/convex emits no Drizzle billing schema surface`, () => {
        const files = generated(mode, framework, "convex");
        const paths = files.map(({ path }) => path);
        const billingIndexPath =
          mode === "monorepo" ? "packages/billing/src/index.ts" : "src/server/billing/index.ts";
        const billingIndex = contentAt(files, billingIndexPath);

        expect(
          paths.filter(
            (path) =>
              path.startsWith("packages/billing/src/schema/") ||
              path.startsWith("src/server/billing/schema/") ||
              path.startsWith("src/server/db/schema/billing"),
          ),
        ).toEqual([]);
        expect(billingIndex).not.toContain("schema/billing");
        expect(billingIndex).not.toContain("billingProviderEnum");
        expect(billingIndex).not.toContain("webhook_events");

        if (mode === "monorepo") {
          const manifest = JSON.parse(contentAt(files, "packages/billing/package.json")) as {
            exports?: Record<string, string>;
            dependencies?: Record<string, string>;
          };
          expect(manifest.exports?.["./schema/*"]).toBeUndefined();
          expect(manifest.dependencies?.["drizzle-orm"]).toBeUndefined();
          expect(manifest.dependencies?.convex).toBeDefined();
        }
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    it(`${mode}/postgres retains the database-owned Drizzle schema surface`, () => {
      const files = generated(mode, "nextjs", "postgres");
      const paths = files.map(({ path }) => path);
      const billingSchemaPath =
        mode === "monorepo"
          ? "packages/billing/src/schema/billing.ts"
          : "src/server/billing/schema/billing.ts";

      expect(paths).toContain(billingSchemaPath);
      expect(contentAt(files, billingSchemaPath)).toContain("billingProviderEnum");
      if (mode === "single") {
        expect(paths).toContain("src/server/db/schema/billing.ts");
      } else {
        const manifest = JSON.parse(contentAt(files, "packages/billing/package.json")) as {
          exports?: Record<string, string>;
          dependencies?: Record<string, string>;
        };
        expect(manifest.exports?.["./schema/*"]).toBe("./src/schema/*.ts");
        expect(manifest.dependencies?.["drizzle-orm"]).toBeDefined();
        expect(manifest.dependencies?.convex).toBeUndefined();
      }
    });
  }
});
