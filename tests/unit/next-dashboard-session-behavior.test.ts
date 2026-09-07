import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type User = { id: string; name: string; email: string; role: string };

function sourceFiles(mode: "monorepo" | "single", database: "postgres" | "convex") {
  const resolution = resolveCreateConfig({
    name: "dashboard-session",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    withAuth: true,
    withApi: true,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const files = buildProjectGenerationPlan(resolution.resolvedConfig).files;
  function read(path: string) {
    const value = files.find((file) => file.physicalPath === path)?.content;
    if (!value) throw new Error(`Missing generated file ${path}`);
    return value;
  }
  return {
    auth: read(mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts"),
    page: read(`${mode === "monorepo" ? "apps/web/" : ""}src/app/dashboard/page.tsx`),
  };
}

function runtimeSource(source: string): string {
  return source
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, "")
    .replace(/^export\s+(?:default\s+)?/gm, "");
}

function dashboardRuntime(authSource: string, pageSource: string, user: User | null) {
  const calls: { provider: string; args: unknown[] }[] = [];
  const helper = authSource.match(
    /^export async function getRequestUser\([^)]*\) \{[\s\S]*?^\}/m,
  )?.[0];
  if (!helper) throw new Error("Generated auth entry has no getRequestUser helper");
  const getUser = new Function(
    "auth",
    "fetchAuthQuery",
    "api",
    `${new Bun.Transpiler({ loader: "ts" }).transformSync(runtimeSource(helper))}; return getRequestUser;`,
  )(
    {
      api: {
        getSession: async (...args: unknown[]) => {
          calls.push({ provider: "postgres", args });
          return user ? { user } : null;
        },
      },
    },
    async (...args: unknown[]) => {
      calls.push({ provider: "convex", args });
      return user;
    },
    { users: { me: "users:me" } },
  ) as (...args: unknown[]) => Promise<User | null>;
  const helperCalls: unknown[][] = [];
  const component = () => null;
  const dependencies = {
    React: {
      createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
        type: typeof type === "string" ? type : "component",
        props,
        children,
      }),
    },
    cache: (operation: unknown) => operation,
    Suspense: component,
    headers: async () => new Headers({ cookie: "session=test" }),
    redirect: (path: string): never => {
      throw new Error(`REDIRECT:${path}`);
    },
    getRequestUser: (...args: unknown[]) => {
      helperCalls.push(args);
      return getUser(...args);
    },
    getSurfaceTranslations: async () => (key: string, values?: Record<string, string>) =>
      values ? JSON.stringify(values) : key,
    Link: component,
    DashboardView: component,
    Card: component,
    CardHeader: component,
    CardTitle: component,
    CardDescription: component,
    CardContent: component,
    Badge: component,
    Button: component,
    Separator: component,
    Skeleton: component,
  };
  const javascript = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(runtimeSource(pageSource));
  const render = new Function(
    ...Object.keys(dependencies),
    `${javascript}; return DashboardContent;`,
  )(...Object.values(dependencies)) as () => Promise<unknown>;
  return { render, calls, helperCalls };
}

describe("Next dashboard session binding", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} redirects anonymous requests and renders authenticated identity`, async () => {
        const files = sourceFiles(mode, database);
        const anonymous = dashboardRuntime(files.auth, files.page, null);
        await expect(anonymous.render()).rejects.toThrow("REDIRECT:/sign-in");
        expect(anonymous.calls.map((call) => call.provider)).toEqual([database]);

        const user = { id: "actor", name: "Ada", email: "ada@example.test", role: "user" };
        const authenticated = dashboardRuntime(files.auth, files.page, user);
        const rendered = JSON.stringify(await authenticated.render());
        expect(rendered).toContain(user.email);
        expect(rendered).toContain(user.name);
        expect(authenticated.calls.map((call) => call.provider)).toEqual([database]);
        if (database === "convex") {
          expect(authenticated.helperCalls).toEqual([[]]);
          expect(authenticated.calls[0]?.args).toEqual(["users:me", {}]);
        } else {
          expect(authenticated.helperCalls[0]?.[0]).toBeInstanceOf(Headers);
          expect(authenticated.calls[0]?.args[0]).toMatchObject({ headers: expect.any(Headers) });
        }
      });
    }
  }
});
