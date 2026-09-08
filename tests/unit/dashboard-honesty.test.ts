import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "children" in value)
    return text((value as Element).children);
  return "";
}

function render(source: string, name: string, catalog: object): unknown {
  const bindings: Record<string, unknown> = {
    useDashboardIdentity: () => ({ user: { role: "admin" }, pending: false, error: null }),
    React: {
      createElement(
        type: unknown,
        props: Record<string, unknown> | null,
        ...children: unknown[]
      ): Element {
        return { type, props: props ?? {}, children };
      },
    },
    useSurfaceTranslations:
      () =>
      (key: string, values: Record<string, unknown> = {}) => {
        const value = key.split(".").reduce<unknown>((entry, part) => {
          if (!entry || typeof entry !== "object") throw new Error(`Unknown dashboard key ${key}`);
          return Reflect.get(entry, part);
        }, catalog);
        if (typeof value !== "string") throw new Error(`Missing dashboard text ${key}`);
        return value.replace(/\{(\w+)\}/g, (_match, parameter: string) => {
          if (!(parameter in values)) throw new Error(`Missing parameter ${key}.${parameter}`);
          return String(values[parameter]);
        });
      },
  };
  for (const component of ["Link", "Button", "SignOutButton"]) bindings[component] = component;
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""));
  return new Function(...Object.keys(bindings), `${executable}\nreturn ${name}();`)(
    ...Object.values(bindings),
  );
}

function generate(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex",
  billing: boolean,
) {
  const result = resolveCreateConfig({
    name: "dashboard-honesty",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: billing ? ["stripe"] : [],
    features: [],
    apps: ["web"],
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  return new Map(plan.files.map((file) => [file.physicalPath, file.content]));
}

function read(files: Map<string, string>, path: string): string {
  const source = files.get(path);
  if (!source) throw new Error(`Missing ${path}`);
  return source;
}

describe("generated dashboard operational honesty", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      for (const billing of [false, true]) {
        test(`${framework}/${database}/billing=${billing} renders guidance and included files, without fabricated status`, () => {
          const files = generate("monorepo", framework, database, billing);
          const root = "apps/web/src/features/dashboard";
          const scripts = (
            JSON.parse(read(files, "package.json")) as { scripts: Record<string, string> }
          ).scripts;
          const packageNames = [...files]
            .filter(([path]) => path.endsWith("/package.json"))
            .map(([, content]) => (JSON.parse(content) as { name: string }).name);
          for (const catalog of [
            EN_MESSAGES.dashboard,
            FR_MESSAGES.dashboard,
            AR_MESSAGES.dashboard,
          ]) {
            const header = text(
              render(read(files, `${root}/dashboard-header.tsx`), "DashboardHeader", catalog),
            );
            const architecture = text(
              render(read(files, `${root}/architecture-card.tsx`), "ArchitectureCard", catalog),
            );
            const checks = text(
              render(read(files, `${root}/checks-card.tsx`), "ChecksCard", catalog),
            );
            const modules = text(
              render(read(files, `${root}/modules-card.tsx`), "ModulesCard", catalog),
            );
            expect(`${header} ${architecture} ${checks} ${modules}`).not.toMatch(
              /\bPASS\b|\bRÉUSSI\b|ناجح|system live|système opérationnel|النظام يعمل|environment: local|0 blockers|0 highs|3 mediums/,
            );
            expect(header).toContain(catalog.header.setupGuide);
            expect(checks).toContain(catalog.checks.instructions);
            expect(checks).toContain(catalog.checks.reviewResults);
            expect(architecture).not.toMatch(/L[1-6]|→|←/);
            for (const key of [
              "layerUi",
              "layerTransport",
              "layerApplication",
              "layerDomain",
              "layerVendors",
              "layerSupporting",
            ] as const)
              expect(architecture).toContain(catalog.architecture[key]);
            expect(architecture).toContain(catalog.architecture.description);
            const commands = checks.match(/bun run [a-z:]+/g) ?? [];
            expect(commands).toEqual(["bun run check", "bun run typecheck", "bun run lint:all"]);
            for (const command of commands)
              expect(scripts[command.replace("bun run ", "")]).toBeTruthy();
            expect(modules).toContain(catalog.modules.included);
            const listedPackages = modules.match(/@repo\/[a-z-]+/g) ?? [];
            expect(listedPackages).toEqual(
              billing
                ? ["@repo/ui", "@repo/auth", "@repo/database", "@repo/billing"]
                : ["@repo/ui", "@repo/auth", "@repo/database"],
            );
            for (const name of listedPackages) expect(packageNames).toContain(name);
            expect(files.has("apps/web/package.json")).toBe(true);
            expect(modules).not.toContain("pipeline: check");
          }
          expect(scripts.check).toMatch(/ghostinit@[^ ]+ check$/);
          expect(scripts.typecheck).toBe("turbo run typecheck");
          expect(scripts["lint:all"]).toContain("bun run lint");
          expect(scripts["lint:all"]).toContain("bun run typecheck");
        });
      }

      test(`single/${framework}/${database} keeps its account-focused dashboard free of operational claims`, () => {
        const files = generate("single", framework, database, true);
        const dashboard = [...files]
          .filter(
            ([path]) =>
              path.includes("/features/dashboard/") ||
              path.endsWith("/dashboard/page.tsx") ||
              path === "src/routes/dashboard.tsx",
          )
          .map(([, content]) => content)
          .join("\n");
        expect(dashboard.length).toBeGreaterThan(0);
        expect(dashboard).not.toMatch(
          /systemLive|environmentLocal|statusPass|checks\.(?:blockers|highs|mediums)/,
        );
        expect(dashboard).toContain("useDashboardIdentity(initialUser)");
        expect(dashboard).toContain('String(user.email ?? "")');
        expect(dashboard).not.toContain("identity.signedInAs");
      });
    }
  }
});
