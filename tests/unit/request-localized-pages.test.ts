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

  for (const [kind, statement, component] of [
    ["named", 'import { Panel as Screen } from "@/features/example";', "Screen"],
    ["default", 'import Screen from "../../features/example";', "Screen"],
    ["namespace", 'import * as Feature from "@/features/example";', "Feature.Panel"],
  ] as const) {
    test(`localizes a generic ${kind} client wrapper while preserving its server contract`, () => {
      const path = "src/app/example/page.tsx";
      const tree = `<${component} label={title} {...extra} />`;
      const guard = 'if (!title.trim()) throw new Error("A title is required");';
      const content = `// 🌍 مرحبا français route
import type { Metadata } from "next";
${statement}
export const runtime = "nodejs";
export const metadata: Metadata = { title: "المدفوعات • Paiements" };
export default function Page({ title, ...extra }: { title: string; disabled?: boolean }) {
  ${guard}
  return (${tree});
}
`;
      const entries = [
        { path, content },
        {
          path: "src/features/example.tsx",
          content:
            '"use client"; export function Panel({ label }: { label: string }) { return <main>{label}</main>; } export default Panel;',
        },
      ];
      const result = composeRequestLocalizedPages(entries, "src");
      const page = result.find((entry) => entry.path === path)!.content;
      const boundary = "<RequestLocalizedMetadataBoundary />";
      expect(page).toContain(statement);
      expect(page).toContain(guard);
      expect(page.indexOf(guard)).toBeLessThan(page.indexOf(boundary));
      expect(page).toContain(tree);
      expect(page).toContain(
        'export const metadata: Metadata = { title: "المدفوعات • Paiements" };',
      );
      expect(page).toContain('export const runtime = "nodejs";');
      expect(page).toContain("// 🌍 مرحبا français route");
      expect(page).toContain("{ title, ...extra }: { title: string; disabled?: boolean }");
      expect(page.match(/<RequestLocalizedMetadataBoundary \/>/g)).toHaveLength(1);
      expect(parseSync(path, page).errors).toEqual([]);
      expect(result.some((entry) => entry.path.endsWith("page.client.tsx"))).toBe(false);
      expect(result.find((entry) => entry.path === entries[1]!.path)).toEqual(entries[1]);
      expect(composeRequestLocalizedPages(result, "src")).toEqual(result);
    });
  }

  test("keeps server compositions, erased imports, shadows and conditional returns unchanged", () => {
    const clientImport = 'import { Screen } from "@/features/client";';
    const cases = [
      `${clientImport} export default async function Page() { return <Screen />; }`,
      `${clientImport} export default function Page() { return <main><Screen /></main>; }`,
      'import { Screen } from "@/features/server"; export default function Page() { return <Screen />; }',
      'import type { Screen } from "@/features/client"; export default function Page() { return <Screen />; }',
      'import { type Screen } from "@/features/client"; export default function Page() { return <Screen />; }',
      `${clientImport} export default function Page(Screen: () => null) { return <Screen />; }`,
      `${clientImport} export default function Page({ Screen }: { Screen: () => null }) { return <Screen />; }`,
      `${clientImport} export default function Page() { const Screen = () => null; return <Screen />; }`,
      `${clientImport} export default function Page(source: { Screen: () => null }) { const { Screen } = source; return <Screen />; }`,
      `${clientImport} export default function Page() { function Screen() { return null; } return <Screen />; }`,
      `${clientImport} export default function Page() { try { throw new Error(); } catch (Screen) { void Screen; } return <Screen />; }`,
      `${clientImport} export default function Page({ hidden }: { hidden: boolean }) { if (hidden) return null; return <Screen />; }`,
    ];
    for (const content of cases) {
      const path = "src/app/example/page.tsx";
      expect(parseSync(path, content).errors).toEqual([]);
      const entries = [
        { path, content },
        {
          path: "src/features/client.tsx",
          content: '"use client"; export function Screen() { return <main />; }',
        },
        {
          path: "src/features/server.tsx",
          content: "export function Screen() { return <main />; }",
        },
      ];
      expect(composeRequestLocalizedPages(entries, "src"), content).toEqual(entries);
    }
  });

  test("keeps the actual metadata boundary when module or function bindings collide", () => {
    const path = "src/app/example/page.tsx";
    const declaration = "function RequestLocalizedMetadataBoundary() { return null; }";
    for (const scope of ["module", "function"] as const) {
      const content = `import { Screen } from "@/features/client";
${scope === "module" ? declaration : ""}
export default function Page() { ${scope === "function" ? declaration : ""} return <Screen />; }`;
      const result = composeRequestLocalizedPages(
        [
          { path, content },
          {
            path: "src/features/client.tsx",
            content: '"use client"; export function Screen() { return <main />; }',
          },
        ],
        "src",
      );
      const page = result.find((entry) => entry.path === path)!.content;
      const parsed = parseSync(path, page);
      expect(parsed.errors).toEqual([]);
      const boundary = parsed.program.body.find(
        (entry) =>
          entry.type === "ImportDeclaration" &&
          entry.source.value === "@/lib/request-localized-metadata",
      );
      const alias =
        boundary?.type === "ImportDeclaration" ? boundary.specifiers[0]?.local.name : null;
      if (!alias) throw new Error("No imported metadata boundary");
      expect(alias).not.toBe("RequestLocalizedMetadataBoundary");
      expect(page).toContain(`<${alias} />`);
      expect(page).toContain(declaration);
      const javascript = new Bun.Transpiler({
        loader: "tsx",
        tsconfig: JSON.stringify({
          compilerOptions: { jsx: "react", jsxFactory: "render", jsxFragmentFactory: "Fragment" },
        }),
      }).transformSync(page);
      let calls = 0;
      new Function(
        "render",
        "Fragment",
        "Screen",
        alias,
        javascript
          .replace(/^import .*;\n/gm, "")
          .replace("export default function Page", "function Page") + "\nreturn Page();",
      )(
        (component: unknown) =>
          typeof component === "function" ? Reflect.apply(component, undefined, []) : null,
        "fragment",
        () => null,
        () => {
          calls++;
        },
      );
      expect(calls).toBe(1);
      expect(composeRequestLocalizedPages(result, "src")).toEqual(result);
    }
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
          const screen = plan.files.find(
            ({ physicalPath }) => physicalPath === `${root}/features/auth/sign-in-screen.tsx`,
          )!;
          expect(screen.lifecycle).toBe("generator-owned");
          expect(screen.content).toContain('"use client"');
          expect(
            plan.files.some(
              ({ physicalPath }) => physicalPath === `${root}/app/sign-in/page.client.tsx`,
            ),
          ).toBe(false);
          if (framework === "nextjs" && i18n) {
            const page = plan.files.find(
              ({ physicalPath }) => physicalPath === `${root}/app/sign-in/page.tsx`,
            )!;
            expect(page.content).toContain("RequestLocalizedMetadataBoundary");
            expect(page.lifecycle).toBe("seed-once");
            expect(page.content).toContain('from "@/features/auth/sign-in-screen"');
            expect(page.content).not.toContain('"use client"');
            expect(
              plan.files.find(
                ({ physicalPath }) =>
                  physicalPath === `${root}/features/billing/use-billing-page.ts`,
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
