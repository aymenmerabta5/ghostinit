import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type AuthState = {
  hasCanonicalApi: boolean;
  isPending: boolean;
  error: Error | null;
  currentRequest: { user: { role: string } | null } | null;
} | null;

interface Element {
  type: unknown;
  props: Record<string, unknown> | null;
  children: unknown[];
}

function hasAdminLink(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasAdminLink);
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<Element>;
  return node.props?.href === "/admin" || hasAdminLink(node.children);
}

function render(source: string, auth: AuthState): Element {
  const javascript = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace("export default function", "function"),
  );
  const createElement = (
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): Element => ({ type, props, children });
  const component = new Function(
    "React",
    "Link",
    "Separator",
    "cn",
    "usePathname",
    "useSurfaceTranslations",
    "useQueryAuthSession",
    "useAuth",
    `${javascript}; return SettingsLayout;`,
  )(
    { createElement },
    "Link",
    "Separator",
    (...values: unknown[]) => values.join(" "),
    () => "/settings",
    () => (key: string) => key,
    () => auth,
    () => ({ user: { role: "admin" } }),
  ) as (props: { children: null }) => Element;
  return component({ children: null });
}

describe("settings administrative navigation ownership", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      for (const api of [false, true]) {
        test(`${mode}/${database}/api-${api} uses only the current canonical role`, () => {
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: "settings-role",
              mode,
              database,
              api,
              auth: true,
              runtime: "bun",
              framework: "nextjs",
              preset: "custom",
              apps: ["web"],
              billing: [],
              features: [],
              cache: "none",
              deploy: "none",
            }),
            { dryRun: true },
          );
          const root = mode === "monorepo" ? "apps/web/src" : "src";
          const source = files.find(
            (file) => file.path === `${root}/app/settings/layout.tsx`,
          )?.content;
          if (!source) throw new Error("Missing generated settings layout");
          expect(source).not.toContain("useAuth");
          expect(source.includes("useQueryAuthSession")).toBe(api);
          const canonical: NonNullable<AuthState> = {
            hasCanonicalApi: true,
            isPending: false,
            error: null,
            currentRequest: { user: { role: "admin" } },
          };
          expect(hasAdminLink(render(source, canonical))).toBe(api);
          for (const state of [
            null,
            { ...canonical, isPending: true },
            { ...canonical, error: new Error("Current identity unavailable") },
            { ...canonical, hasCanonicalApi: false },
            { ...canonical, currentRequest: null },
            { ...canonical, currentRequest: { user: null } },
            { ...canonical, currentRequest: { user: { role: "user" } } },
          ])
            expect(hasAdminLink(render(source, state))).toBe(false);
        });
      }
    }
  }
});
