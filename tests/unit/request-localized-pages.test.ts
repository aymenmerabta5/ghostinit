import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { composeRequestLocalizedPages } from "../../src/templates/apps/fragments/request-localized-page.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

describe("request-localized Next page composition", () => {
  test("keeps client code and relative imports intact behind a typed server entrypoint", () => {
    const content = `"use client";
import { helper } from "./helper";
export interface PageOptions { label: string; }
export function extra() { return helper; }
export default function Page({ label }: PageOptions) { return <main>{label}</main>; }
`;
    const files = composeRequestLocalizedPages(
      [{ path: "src/app/sign-in/page.tsx", content }],
      "src",
    );
    expect(files.find(({ path }) => path.endsWith("page.client.tsx"))?.content).toBe(content);
    const page = files.find(({ path }) => path === "src/app/sign-in/page.tsx")!.content;
    expect(page).not.toContain('"use client"');
    expect(page).toContain("<RequestLocalizedMetadataBoundary />");
    expect(page).toContain("<GhostinitPageContent {...props} />");
    expect(page).toContain('export type { PageOptions } from "./page.client";');
    expect(page).toContain('export { extra } from "./page.client";');
    expect(parseSync("page.tsx", page).errors).toEqual([]);
    expect(
      files.find(({ path }) => path.endsWith("request-localized-metadata.tsx"))?.content,
    ).toContain("await connection()");
  });

  test("preserves server imports, metadata and route exports around a client re-export", () => {
    const content = `// Localized • 🌍 مرحبا français route
import type { Metadata } from "next";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Route-specific title" };
export { Screen as default, type ScreenProps } from "@/features/screen";
`;
    const files = composeRequestLocalizedPages(
      [
        { path: "src/app/example/page.tsx", content },
        {
          path: "src/features/screen.tsx",
          content:
            '"use client"; export interface ScreenProps {} export function Screen() { return <main />; }',
        },
      ],
      "src",
    );
    const page = files.find(({ path }) => path === "src/app/example/page.tsx")!.content;
    expect(page).toContain('import type { Metadata } from "next";');
    expect(page).toContain('export const runtime = "nodejs";');
    expect(page).toContain('export const metadata: Metadata = { title: "Route-specific title" };');
    expect(page).toContain('import { Screen as GhostinitPageContent } from "@/features/screen";');
    expect(page).toContain('export { type ScreenProps } from "@/features/screen";');
    expect(parseSync("page.tsx", page).errors).toEqual([]);
    expect(files.some(({ path }) => path.endsWith("page.client.tsx"))).toBe(false);
  });

  test("does not wrap existing server pages or unrelated client components", () => {
    const entries = [
      {
        path: "src/app/account/page.tsx",
        content: "export default async function Page() { return <main />; }",
      },
      {
        path: "src/app/account/form.tsx",
        content: '"use client"; export default function Form() { return <form />; }',
      },
    ];
    expect(composeRequestLocalizedPages(entries, "src")).toEqual(entries);
  });

  test("marks an explicitly declared static server landing page without moving its exports", () => {
    const path = "src/app/page.tsx";
    const content = `// 🌍 مرحبا
import { Hero } from "./hero";
export const metadata = { title: "Localized page" };
export default function Home() { return (<main><Hero /></main>); }
`;
    const result = composeRequestLocalizedPages([{ path, content }], "src", {
      staticServerPages: [path],
    });
    const page = result.find((entry) => entry.path === path)!.content;
    expect(page).toContain('import { Hero } from "./hero";');
    expect(page).toContain('export const metadata = { title: "Localized page" };');
    expect(page).toContain("<RequestLocalizedMetadataBoundary /><main><Hero /></main>");
    expect(parseSync(path, page).errors).toEqual([]);
    expect(result.some((entry) => entry.path.endsWith("page.client.tsx"))).toBe(false);
  });

  test("rejects collisions and server configuration hidden in a client page", () => {
    const path = "src/app/example/page.tsx";
    const content = '"use client"; export default function Page() { return <main />; }';
    expect(() =>
      composeRequestLocalizedPages(
        [
          { path, content },
          { path: "src/app/example/page.client.tsx", content: "export {};" },
        ],
        "src",
      ),
    ).toThrow("companion already exists");
    expect(() =>
      composeRequestLocalizedPages(
        [{ path, content: `${content}\nexport const runtime = "nodejs";` }],
        "src",
      ),
    ).toThrow("server-only route configuration");
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} composes only localized Next client route entrypoints`, () => {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const i18n of [false, true]) {
          const resolution = resolveCreateConfig({
            name: "localized-pages",
            runtime: "bun",
            mode,
            framework,
            billing: ["stripe"],
            features: i18n ? ["i18n"] : [],
            database: "postgres",
            databaseWasExplicit: true,
            apps: ["web"],
            preset: undefined,
            cache: "none",
            deploy: "none",
          });
          if (!resolution.ok) throw new Error(resolution.message);
          const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          });
          const root = mode === "monorepo" ? "apps/web/src" : "src";
          const path = `${root}/app/sign-in/page.client.tsx`;
          expect(plan.files.some(({ physicalPath }) => physicalPath === path)).toBe(
            framework === "nextjs" && i18n,
          );
          if (framework === "nextjs" && i18n) {
            const page = plan.files.find(
              ({ physicalPath }) => physicalPath === `${root}/app/sign-in/page.tsx`,
            )!;
            expect(page.content).toContain("RequestLocalizedMetadataBoundary");
            expect(page.lifecycle).toBe("seed-once");
            expect(plan.files.find(({ physicalPath }) => physicalPath === path)?.lifecycle).toBe(
              "seed-once",
            );
            expect(plan.files.find(({ physicalPath }) => physicalPath === path)?.content).toContain(
              '"use client"',
            );
            expect(
              plan.files.find(
                ({ physicalPath }) =>
                  physicalPath === `${root}/app/billing/hooks/use-billing-page.ts`,
              )?.lifecycle,
            ).toBe("generator-owned");
            expect(
              plan.files.find(
                ({ physicalPath }) => physicalPath === `${root}/app/settings/page.tsx`,
              )?.content,
            ).not.toContain("RequestLocalizedMetadataBoundary");
            if (mode === "single") {
              expect(
                plan.files.find(({ physicalPath }) => physicalPath === `${root}/app/page.tsx`)
                  ?.content,
              ).toContain("RequestLocalizedMetadataBoundary");
            }
            for (const outcome of ["cancel", "success"]) {
              expect(
                plan.files.find(
                  ({ physicalPath }) => physicalPath === `${root}/app/billing/${outcome}/page.tsx`,
                )?.content,
              ).toContain("RequestLocalizedMetadataBoundary");
            }
          }
        }
      }
    });
  }
});
