import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";

function plan(
  mode: Mode,
  database: Database,
  framework: "nextjs" | "tanstack-start" = "tanstack-start",
) {
  const resolved = resolveCreateConfig({
    name: `initial-reads-${mode}-${database}-${framework}`,
    runtime: "bun",
    mode,
    framework,
    billing: ["stripe"],
    features: [],
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    withEve: true,
    withMessaging: true,
    withStorage: true,
    withJobs: true,
    withPdf: true,
    featureFlags: "posthog",
  });
  if (!resolved.ok) throw new Error(resolved.message);
  return buildProjectGenerationPlan(resolved.resolvedConfig, {
    desiredConfig: resolved.desiredConfig,
  });
}

function read(generated: ReturnType<typeof plan>, mode: Mode, path: string): string {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const physicalPath = path.startsWith("packages/") ? path : `${root}${path}`;
  const value = generated.files.find((file) => file.physicalPath === physicalPath)?.content;
  if (value === undefined) throw new Error(`Missing generated file: ${physicalPath}`);
  return value;
}

describe("TanStack Start-native initial reads", () => {
  test("hydrates every supported JSON surface through direct application boundaries", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const generated = plan(mode, database);
        const serverFunctions = read(generated, mode, "src/lib/server-functions.ts");
        const protectedRoute = read(generated, mode, "src/lib/protected-route.ts");

        for (const name of [
          "getInitialAdminUsers",
          "getInitialIdentityWorkspace",
          "getInitialBillingSnapshot",
          "getInitialConversations",
          "getInitialUserFeatureFlag",
        ]) {
          expect(serverFunctions, `${mode}/${database}/${name}`).toContain(name);
        }
        expect(serverFunctions).toContain("application.admin.listUsers");
        expect(serverFunctions).toContain("application.identity.workspace.snapshot()");
        expect(serverFunctions).toContain("application.billing.subscriptions()");
        expect(serverFunctions).toContain("application.messaging.listConversations()");
        expect(serverFunctions).toContain("evaluateAuthenticatedFeatureFlag");
        expect(serverFunctions).not.toContain("@orpc/");
        expect(serverFunctions).not.toContain("@repo/api");
        expect(serverFunctions).not.toContain("@/server/api");
        expect(serverFunctions).toContain(
          mode === "monorepo"
            ? 'import("@repo/services/application")'
            : 'import("@/server/services/application")',
        );
        expect(serverFunctions).not.toContain("createRouterClient");
        expect(serverFunctions).not.toContain("/api/rpc");
        expect(serverFunctions).not.toMatch(/\bfetch\s*\(/);

        for (const loader of [
          "loadInitialAdminUsers",
          "loadInitialIdentityWorkspace",
          "loadInitialBillingSnapshot",
          "loadInitialConversations",
          "loadInitialUserFeatureFlag",
        ]) {
          expect(protectedRoute, `${mode}/${database}/${loader}`).toContain(loader);
        }
        expect(protectedRoute.match(/ensureQueryData/g)?.length).toBeGreaterThanOrEqual(6);

        const adminRoute = read(generated, mode, "src/routes/admin.users.tsx");
        const adminQueries = read(generated, mode, "src/features/admin-users/queries.ts");
        expect(adminRoute).toContain("loadInitialAdminUsers(context)");
        expect(adminQueries).toContain("adminUsersQueryKey(scope, input)");

        const identityRoute = read(generated, mode, "src/routes/settings.workspace.tsx");
        const identityQueries = read(generated, mode, "src/features/identity-workspace/queries.ts");
        expect(identityRoute).toContain("loadInitialIdentityWorkspace(context)");
        expect(identityQueries).toContain("identityWorkspaceInitialQueryKey(scope)");

        const billingRoute = read(generated, mode, "src/routes/billing.tsx");
        const billingQueries = read(generated, mode, "src/features/billing/queries.ts");
        expect(billingRoute).toContain("loadInitialBillingSnapshot(context)");
        expect(billingQueries).toContain("billingSnapshotQueryKey(scope)");

        const messagingRoute = read(generated, mode, "src/routes/messages.tsx");
        expect(messagingRoute).toContain("loadInitialConversations(context)");
        if (database === "postgres") {
          const messagingQueries = read(generated, mode, "src/features/messaging/queries.ts");
          expect(messagingQueries).toContain("messagingConversationsQueryKey(scope)");
        } else {
          expect(messagingRoute).toContain('from "@/features/messaging/screen"');
          expect(messagingRoute).toContain("component: ConvexMessagesPage");
          const messagingPage = read(generated, mode, "src/features/messaging/queries.ts");
          expect(messagingPage).toContain("messagingConversationsQueryKey(owner.scope)");
          expect(messagingPage).toContain("conversations: InitialConversation[]");
          expect(messagingPage).toContain("live.map((conversation)");
          expect(messagingPage).toContain("liveId: null");
          expect(messagingPage).not.toContain('conversations: Array<{ _id: Id<"conversations"> }>');
        }

        const flagRoute = read(generated, mode, "src/routes/feature-flags.tsx");
        const flagQueries = read(generated, mode, "src/features/feature-flags/queries.ts");
        expect(flagRoute).toContain("resolveRouteAuth(context.queryClient)");
        expect(flagRoute).toContain("loadInitialUserFeatureFlag");
        expect(flagRoute).not.toContain("requireProtectedRoute");
        expect(flagQueries).toContain("initialUserFeatureFlagQueryKey(scope)");

        const applicationPath =
          mode === "monorepo"
            ? "packages/services/src/application/facade.ts"
            : "src/server/services/application/facade.ts";
        const application = generated.files.find(
          (file) => file.physicalPath === applicationPath,
        )?.content;
        expect(application).toContain('rateLimit("admin:list:" + principal.userId');
        expect(application).toContain('rateLimit("billing:subscriptions:" + principal.userId');
        expect(application).toContain('rateLimit("identity:workspace:" + principal.userId');
        expect(application).toContain("canReadInvitations");
        expect(application).toContain("listConversations: async ()");
        expect(application).toContain(
          "listConversations(userId: string): Promise<ConversationDto[]>;",
        );
        expect(application).not.toContain("listConversations(principal.userId)).map(publicRecord)");

        const applicationServerPath =
          mode === "monorepo"
            ? "packages/services/src/application/server.ts"
            : "src/server/services/application/server.ts";
        const applicationServer = generated.files.find(
          (file) => file.physicalPath === applicationServerPath,
        )?.content;
        expect(applicationServer).toContain(".toISOString()");
        if (mode === "monorepo") {
          expect(applicationServer).toContain('from "@repo/auth/server"');
        }
      }
    }
  });

  test("keeps non-initial binary, id-driven, and streaming operations on their protocols", () => {
    const generated = plan("monorepo", "postgres");
    const serverFunctions = read(generated, "monorepo", "src/lib/server-functions.ts");
    for (const unsupported of [
      "getInitialStorage",
      "getInitialJobs",
      "getInitialPdf",
      "getInitialEve",
    ]) {
      expect(serverFunctions).not.toContain(unsupported);
    }

    expect(read(generated, "monorepo", "src/features/storage/mutations.ts")).toContain(
      "orpcClient.storage.uploadBase64",
    );
    expect(read(generated, "monorepo", "src/features/storage/queries.ts")).toContain(
      "orpcClient.storage.downloadBase64",
    );
    expect(read(generated, "monorepo", "src/features/jobs/queries.ts")).toContain(
      "orpcClient.jobs.getRun",
    );
    const pdfClient = generated.files.find(
      (file) => file.physicalPath === "packages/pdf/src/client/usePdf.ts",
    )?.content;
    expect(pdfClient).toContain('method: "POST"');
    expect(pdfClient).toContain('"/api/pdf"');
    expect(read(generated, "monorepo", "src/routes/agent.tsx")).toContain(
      "Eve output is a user-triggered stream",
    );
  });

  test("does not change Next into a Start server-function client", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const generated = plan(mode, "postgres", "nextjs");
      const root = mode === "monorepo" ? "apps/web/" : "";
      expect(
        generated.files.some((file) => file.physicalPath === `${root}src/lib/server-functions.ts`),
      ).toBe(false);
      expect(
        generated.files
          .filter((file) => file.physicalPath.includes("features/billing"))
          .map((file) => file.content)
          .join("\n"),
      ).not.toContain("getInitialBillingSnapshot");
    }
  });
});
