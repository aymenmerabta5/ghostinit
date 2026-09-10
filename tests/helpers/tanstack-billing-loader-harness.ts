import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { BillingProviderName } from "../../src/lib/addons.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { deferred, generatedFormHarness } from "./generated-form-harness.js";

export type BillingMode = "single" | "monorepo";
export type BillingDatabase = "postgres" | "convex";
export const billingLoaderSelections: readonly {
  id: string;
  billing: readonly BillingProviderName[];
}[] = [
  { id: "manual", billing: ["manual"] },
  { id: "chargily", billing: ["chargily"] },
  { id: "stripe", billing: ["stripe"] },
  { id: "manual-stripe", billing: ["manual", "stripe"] },
  { id: "manual-chargily-stripe", billing: ["manual", "chargily", "stripe"] },
  { id: "manual-chargily-polar", billing: ["manual", "chargily", "polar"] },
  { id: "manual-chargily-paddle", billing: ["manual", "chargily", "paddle"] },
];
export function generatedBillingRoute(
  mode: BillingMode,
  database: BillingDatabase,
  billing: readonly BillingProviderName[],
) {
  const resolved = resolveCreateConfig({
    name: "billing-loader-" + mode + "-" + database,
    runtime: "bun",
    mode,
    framework: "tanstack-start",
    database,
    databaseWasExplicit: true,
    billing: [...billing],
    features: [],
    apps: ["web"],
    preset: "saas",
    cache: "none",
    deploy: "none",
    withStorage: billing.includes("manual"),
  });
  if (!resolved.ok) throw new Error(resolved.message);
  const plan = buildProjectGenerationPlan(resolved.resolvedConfig, {
    desiredConfig: resolved.desiredConfig,
  });
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  const path = root + "/routes/billing.tsx";
  const route = plan.files.find((entry) => entry.physicalPath === path);
  if (!route) throw new Error("Missing emitted billing route: " + path);
  const page = plan.files.find(
    (entry) => entry.physicalPath === root + "/features/billing/billing-page.tsx",
  );
  if (!page) throw new Error("Missing emitted billing component");
  return { path, source: route.content, page: page.content };
}
interface BillingRoute {
  path: string;
  component: unknown;
  beforeLoad(input: { context: unknown }): Promise<unknown>;
  loader(input: { context: unknown }): Promise<unknown>;
}
export function billingRouteHarness(source: string) {
  const session = deferred<unknown>();
  const snapshot = deferred<unknown>();
  const queryClient = Object.freeze({ fixture: "query-client" });
  const queryScope = Object.freeze({
    userId: "owner",
    sessionId: "session",
    tenantId: null,
    teamId: null,
  });
  const context = Object.freeze({ queryClient, queryScope });
  const calls: { kind: string; input: unknown }[] = [];
  let guardFailure: Error | null = null;
  let synchronousReadFailure: Error | null = null;
  const component = () => null;
  const h = generatedFormHarness(source, ["Route"], {
    createFileRoute: (path: string) => (options: object) => ({ path, ...options }),
    BillingPage: component,
    requireProtectedRoute: (input: unknown) => {
      calls.push({ kind: "authorize", input });
      return guardFailure ? Promise.reject(guardFailure) : Promise.resolve({ queryScope });
    },
    loadProtectedRoute: (input: unknown) => {
      calls.push({ kind: "session", input });
      if (synchronousReadFailure) throw synchronousReadFailure;
      return session.promise;
    },
    loadInitialBillingSnapshot: (input: unknown) => {
      calls.push({ kind: "snapshot", input });
      return snapshot.promise;
    },
  });
  return {
    route: h.module.Route as unknown as BillingRoute,
    component,
    context,
    queryClient,
    queryScope,
    calls,
    session,
    snapshot,
    failAuthorization(error: Error) {
      guardFailure = error;
    },
    failReadSynchronously(error: Error) {
      synchronousReadFailure = error;
    },
  };
}
