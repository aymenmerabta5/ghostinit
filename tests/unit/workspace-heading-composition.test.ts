import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function output(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex",
) {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "workspace-heading",
      mode,
      framework,
      database,
      runtime: "bun",
      preset: "custom",
      apps: ["web"],
      auth: true,
      api: true,
      billing: [],
      features: [],
      cache: "none",
      deploy: "none",
    }),
    { dryRun: true },
  );
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  return (path: string): string => {
    const source = files.find((file) => file.path === `${root}/${path}`)?.content;
    if (!source) throw new Error(`Missing generated ${path}`);
    return source;
  };
}

describe("workspace route heading composition", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} nests the Next workspace under Settings while retaining TanStack's page title`, () => {
        const next = output(mode, "nextjs", database);
        expect(next("app/settings/layout.tsx")).toMatch(/<h1\b[^>]*>\{t\("title"\)\}<\/h1>/);
        expect(next("app/settings/workspace/page.tsx")).toContain(
          "<IdentityWorkspace initialData={initialData}",
        );
        expect(next("features/identity-workspace/identity-workspace.tsx")).toContain(
          '<h2 className="text-3xl font-semibold tracking-tight">',
        );

        const tanstack = output(mode, "tanstack-start", database);
        expect(tanstack("routes/settings.tsx")).toContain(
          'if (location.pathname !== "/settings" && location.pathname !== "/settings/") return <Outlet />;',
        );
        expect(tanstack("routes/settings.workspace.tsx")).toContain(
          '<main className="mx-auto w-full max-w-6xl p-6"><IdentityWorkspace /></main>',
        );
        expect(tanstack("features/identity-workspace/identity-workspace.tsx")).toContain(
          '<h1 className="text-3xl font-semibold tracking-tight">',
        );
      });
    }
  }
});
