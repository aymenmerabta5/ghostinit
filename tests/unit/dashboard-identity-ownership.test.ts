import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { formatGenerationText } from "../../src/generation/plan-formatter.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { generatedFormHarness, elements, textContent } from "../helpers/generated-form-harness.js";

type Mode = "single" | "monorepo";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";
interface User {
  name: string;
  email: string;
  role: string;
}
const accountA: User = { name: "Initial A", email: "a@example.test", role: "admin" };
const accountB: User = { name: "Current B", email: "b@example.test", role: "user" };

function generated(mode: Mode, framework: Framework, database: Database, api: boolean) {
  const result = resolveCreateConfig({
    name: "dashboard-identity",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: ["i18n"],
    withAuth: true,
    withApi: api,
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig);
  const root = mode === "single" ? "src" : "apps/web/src";
  const read = (path: string) => {
    const entry = plan.files.find(({ physicalPath }) => physicalPath === `${root}/${path}`);
    if (!entry) throw new Error(`Missing dashboard output: ${path}`);
    return entry.content;
  };
  return { plan, root, read };
}

function adminLinks(tree: unknown): number {
  return elements(tree).filter(({ props }) => {
    const link = props.render as { props?: { href?: string; to?: string } } | undefined;
    return (link?.props?.href ?? link?.props?.to) === "/admin";
  }).length;
}

function identityHarness(read: (path: string) => string, mode: Mode, api: boolean) {
  const provider = {
    data: { user: accountA } as { user: User } | null,
    isPending: false,
    error: null as Error | null,
  };
  const canonical = {
    hasCanonicalApi: api,
    currentRequest: { user: accountB } as { user: User | null } | null,
    isPending: false,
    error: null as Error | null,
  };
  const selection = generatedFormHarness(
    read("features/dashboard/queries.ts"),
    ["useDashboardIdentity"],
    {
      identityClient: { useSession: () => provider },
      useQueryAuthSession: () => canonical,
    },
  );
  const bindings = {
    Badge: "Badge",
    Link: "Link",
    DashboardIdentityStatus: "IdentityStatus",
    useDashboardIdentity: (initialUser: unknown) =>
      selection.module.useDashboardIdentity!(initialUser),
    useSurfaceTranslations: () => (key: string, values?: { email?: string; name?: string }) =>
      values?.email ? `${key} ${values.email} ${values.name}` : key,
  };
  const name = mode === "single" ? "DashboardIdentityCard" : "IdentityCard";
  const card = generatedFormHarness(
    read("features/dashboard/components/identity-card.tsx"),
    [name],
    bindings,
  );
  const checks =
    mode === "monorepo"
      ? generatedFormHarness(
          read("features/dashboard/components/checks-card.tsx"),
          ["ChecksCard"],
          bindings,
        )
      : null;
  const screenName = mode === "single" ? "DashboardOverview" : "DashboardView";
  const screen = generatedFormHarness(
    read(`features/dashboard/${mode === "single" ? "dashboard-overview" : "dashboard-view"}.tsx`),
    [screenName],
    {
      ...bindings,
      DashboardIdentityCard: "IdentityCard",
      DashboardQuickActions: "QuickActions",
      ChevronDown: "ChevronDown",
      ArchitectureStatus: "ArchitectureStatus",
      DashboardHeader: "DashboardHeader",
      IdentityActions: "IdentityActions",
      ModulesCard: "ModulesCard",
    },
  );
  const screenNodes = () => elements(screen.render(screenName, { user: accountA }));
  return {
    provider,
    canonical,
    selection,
    render: () => {
      const node = screenNodes().find(
        ({ type }) => type === (mode === "single" ? "IdentityCard" : "IdentityActions"),
      )!;
      return card.render(name, mode === "single" ? node.props : node.props.identity);
    },
    renderChecks: () =>
      checks?.render(
        "ChecksCard",
        screenNodes().find(({ type }) => type === "ArchitectureStatus")!.props,
      ),
  };
}

describe("dashboard identity follows its current owner", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const api of [true, false]) {
          test(`${mode}/${framework}/${database}/api=${api} never restores private SSR identity after hydration`, async () => {
            const output = generated(mode, framework, database, api);
            const harness = identityHarness(output.read, mode, api);
            harness.selection.setHydrated(false);
            expect(textContent(harness.render())).toContain(accountA.email);
            expect(adminLinks(harness.render())).toBe(api ? 1 : 0);
            if (mode === "monorepo") expect(adminLinks(harness.renderChecks())).toBe(api ? 1 : 0);
            harness.selection.setHydrated(true);
            harness.provider.data = { user: api ? accountA : accountB };
            expect(textContent(harness.render())).toContain(accountB.email);
            expect(textContent(harness.render())).not.toContain(accountA.email);
            expect(adminLinks(harness.render())).toBe(0);
            expect(adminLinks(harness.renderChecks())).toBe(0);

            if (api) harness.canonical.isPending = true;
            else harness.provider.isPending = true;
            const pending = harness.render();
            expect(textContent(pending)).not.toContain(accountA.email);
            expect(textContent(pending)).not.toContain(accountB.email);
            expect(elements(pending)[0]?.props.pending).toBe(true);
            expect(adminLinks(harness.renderChecks())).toBe(0);

            harness.canonical.isPending = harness.provider.isPending = false;
            if (api) harness.canonical.error = new Error("private backend detail");
            else harness.provider.error = new Error("private provider detail");
            const failed = harness.render();
            expect(elements(failed)[0]?.type).toBe("IdentityStatus");
            expect(textContent(failed)).not.toContain(accountB.email);
            expect(adminLinks(harness.renderChecks())).toBe(0);

            harness.canonical.error = harness.provider.error = null;
            if (api) harness.canonical.currentRequest = { user: null };
            else harness.provider.data = null;
            expect(elements(harness.render())[0]?.type).toBe("IdentityStatus");
            expect(adminLinks(harness.renderChecks())).toBe(0);

            const currentAdmin = { ...accountB, role: "admin" };
            if (api) harness.canonical.currentRequest = { user: currentAdmin };
            else harness.provider.data = { user: currentAdmin };
            expect(textContent(harness.render())).toContain(accountB.email);
            expect(adminLinks(harness.render())).toBe(api ? 1 : 0);
            if (mode === "monorepo") expect(adminLinks(harness.renderChecks())).toBe(api ? 1 : 0);
            const freshA = { ...accountA, name: "Current A", email: "current-owner@example.test" };
            if (api) harness.canonical.currentRequest = { user: freshA };
            else harness.provider.data = { user: freshA };
            expect(textContent(harness.render())).toContain(freshA.email);
            expect(textContent(harness.render())).not.toContain(accountA.email);

            const stateSource = output.read("features/dashboard/components/identity-state.tsx");
            expect(stateSource).not.toMatch(
              /\bfetch\(|orpc|queryOptions|\.getSession\(|auth-client|useSession|useQueryAuthSession/,
            );
            expect(output.read("features/dashboard/queries.ts")).toContain(
              'from "@/lib/auth-client"',
            );
            expect(output.read("features/dashboard/components/identity-card.tsx")).not.toContain(
              "useDashboardIdentity",
            );
            expect(
              output.read(
                `features/dashboard/${mode === "single" ? "dashboard-overview" : "dashboard-view"}.tsx`,
              ),
            ).toContain('from "./queries"');
            expect(output.read("components/query-auth-boundary.tsx")).toContain(
              `hasCanonicalApi: ${api}`,
            );
            for (const file of output.plan.files.filter(({ physicalPath }) =>
              physicalPath.startsWith(`${output.root}/features/dashboard/`),
            )) {
              const formatted = await formatGenerationText(file.physicalPath, file.content);
              expect(parseSync(file.physicalPath, formatted).errors, file.physicalPath).toEqual([]);
              expect(formatted.split(/\r?\n/).length, file.physicalPath).toBeLessThanOrEqual(150);
              if (!api) expect(formatted, file.physicalPath).not.toMatch(/(?:href|to)="\/admin/);
              if (framework === "nextjs") expect(formatted).not.toContain("@tanstack/react-router");
            }
          });
        }
      }
    }
  }

  for (const mode of ["single", "monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} keeps server authorization before handing off the initial user`, async () => {
        for (const api of [true, false]) {
          const output = generated(mode, "nextjs", database, api);
          let user: User | null = accountA;
          const page = generatedFormHarness(
            output.read("app/dashboard/page.tsx"),
            ["DashboardContent"],
            {
              cache: (callback: unknown) => callback,
              getRequestUser: async () => user,
              headers: async () => new Headers(),
              DashboardOverview: "DashboardOverview",
              DashboardView: "DashboardView",
              Suspense: "Suspense",
              redirect: (path: string) => {
                throw new Error(`redirect:${path}`);
              },
            },
          );
          const initial = (await page.module.DashboardContent!()) as { props: { user: User } };
          expect(initial.props.user).toEqual(accountA);
          user = null;
          await expect(page.module.DashboardContent!()).rejects.toThrow("redirect:/sign-in");
        }
      });
    }
  }
});
