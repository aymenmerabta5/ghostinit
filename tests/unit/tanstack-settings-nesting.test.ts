import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

interface GeneratedRoute {
  path: string;
  beforeLoad?: () => Promise<unknown>;
  component: () => unknown;
}

function evaluateRoute(source: string, bindings: Record<string, unknown>): GeneratedRoute {
  const parsed = parseSync("route.tsx", source);
  expect(parsed.errors).toEqual([]);
  let isolated = source;
  for (const declaration of [...parsed.program.body].reverse()) {
    if (declaration.type === "ImportDeclaration") {
      isolated = isolated.slice(0, declaration.start) + isolated.slice(declaration.end);
    }
  }
  isolated = isolated.replace("export const Route", "const Route");
  const javascript = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react", jsxFactory: "jsx" } },
  }).transformSync(isolated);
  return new Function(...Object.keys(bindings), `${javascript}\nreturn Route;`)(
    ...Object.values(bindings),
  ) as GeneratedRoute;
}

describe("generated TanStack settings route hierarchy", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} renders the workspace child and preserves the settings page and guard`, async () => {
        const resolution = resolveCreateConfig({
          name: "settings-nesting",
          runtime: "bun",
          mode,
          database,
          databaseWasExplicit: true,
          framework: "tanstack-start",
          apps: ["web"],
          preset: "saas",
          billing: [],
          features: [],
          cache: "none",
          deploy: "none",
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const files = new Map(
          buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          }).files.map((file) => [file.physicalPath, file.content]),
        );
        const routeRoot = mode === "single" ? "src/routes" : "apps/web/src/routes";
        const settings = files.get(`${routeRoot}/settings.tsx`);
        const workspace = files.get(`${routeRoot}/settings.workspace.tsx`);
        expect(settings).toBeString();
        expect(workspace).toBeString();

        let pathname = "/settings";
        let user: { id: string } | null = { id: "member-1" };
        let child: GeneratedRoute;
        const jsx = (
          type: unknown,
          props: Record<string, unknown> | null,
          ...children: unknown[]
        ): unknown =>
          typeof type === "function" ? type({ ...props, children }) : { type, props, children };
        const bindings = {
          jsx,
          createFileRoute: (path: string) => (options: Omit<GeneratedRoute, "path">) => ({
            path,
            ...options,
          }),
          createServerFn: () => ({ handler: (handler: () => Promise<unknown>) => handler }),
          getRequestUser: async () => user,
          getRequestHeaders: () => new Headers(),
          redirect: (destination: unknown) => destination,
          useLocation: () => ({ pathname }),
          useSurfaceTranslations: () => (key: string) => key,
          Link: "link",
          Button: "button",
          Separator: "separator",
          SettingsController: () => "settings-controller",
          IdentityWorkspace: () => "identity-workspace",
          Outlet: () => child.component(),
          loadInitialIdentityWorkspace: () => undefined,
          requireProtectedRoute: () => undefined,
        };
        const parent = evaluateRoute(settings!, bindings);
        child = evaluateRoute(workspace!, bindings);
        expect(parent.path).toBe("/settings");
        expect(child.path).toBe(`${parent.path}/workspace`);
        expect(await parent.beforeLoad!()).toEqual({ user });
        for (pathname of ["/settings", "/settings/"]) {
          const rendered = JSON.stringify(parent.component());
          expect(rendered).toContain("settings-controller");
          expect(rendered).not.toContain("identity-workspace");
        }
        pathname = child.path;
        const rendered = JSON.stringify(parent.component());
        expect(rendered).toContain("identity-workspace");
        expect(rendered).not.toContain("settings-controller");
        user = null;
        await expect(parent.beforeLoad!()).rejects.toEqual({ to: "/sign-in" });
      });
    }
  }
});
