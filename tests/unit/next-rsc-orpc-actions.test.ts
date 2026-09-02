import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";

function generated(mode: Mode, database: Database, framework = "nextjs"): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "next-rsc-boundary",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database,
      auth: true,
      api: true,
      email: true,
      notifications: true,
      billing: ["stripe"],
      features: [],
      apps: ["web"],
    }),
    { dryRun: true },
  );
}

function generatedRemainingCapabilities(mode: Mode, database: Database): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "next-rsc-capabilities",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: "nextjs",
      database,
      auth: true,
      api: true,
      email: false,
      analytics: false,
      notifications: false,
      billing: [],
      features: ["eve"],
      eve: true,
      pdf: true,
      messaging: true,
      storage: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
      apps: ["web"],
      preset: "custom",
    }),
    { dryRun: true },
  );
}

function generatedPublicFlagsWithoutRequestApplication(mode: Mode): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "next-public-flags",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: "nextjs",
      database: "none",
      auth: false,
      api: true,
      email: false,
      notifications: false,
      billing: [],
      features: [],
      featureFlags: "posthog",
      apps: ["web"],
      preset: "custom",
    }),
    { dryRun: true },
  );
}

function prefix(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/" : "";
}

function content(files: readonly TemplateFile[], path: string): string {
  const entry = files.find((file) => file.path === path);
  if (!entry) throw new Error(`Missing generated file: ${path}`);
  return entry.content;
}

const FORBIDDEN_SERVER_UI_TRANSPORT =
  /@orpc\/|@repo\/api|@\/server\/api|createRouterClient|createServerApiClient|RPCLink|\/api\/rpc|\bfetch\s*\(/;

describe("Next RSC-first application and Server Action boundaries", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} calls the application facade for RSC initial data`, () => {
        const files = generated(mode, database);
        const root = prefix(mode);
        const applicationModule =
          mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
        const applicationRoot =
          mode === "monorepo"
            ? "packages/services/src/application"
            : "src/server/services/application";
        const browser = content(files, `${root}src/lib/orpc.ts`);
        expect(files.some((file) => file.path === `${root}src/lib/orpc.server.ts`)).toBe(false);
        expect(browser).toContain("new RPCLink");
        expect(browser).not.toContain("createRequestApiClient");
        expect(content(files, `${root}src/app/api/rpc/[...path]/route.ts`)).toContain("RPCHandler");
        const facade = content(files, `${applicationRoot}/facade.ts`);
        const server = content(files, `${applicationRoot}/server.ts`);
        expect(facade).toContain("requireActivePrincipal");
        expect(facade).toContain("requireAdminPrincipal");
        expect(facade).toContain('dependencies.rateLimit("admin:list:"');
        expect(facade).toContain('dependencies.rateLimit("billing:checkout:"');
        expect(server).toContain("resolvePrincipal(headers)");
        expect(`${facade}\n${server}`).not.toContain("@orpc/");

        const pages = new Map([
          [`${root}src/app/admin/users/page.tsx`, "initialData={initialData}"],
          [`${root}src/app/settings/workspace/page.tsx`, "initialData={initialData}"],
          [`${root}src/app/billing/page.tsx`, "initialData={initialData}"],
          [`${root}src/app/settings/page.tsx`, "initialSessions={initialSessions}"],
          [`${root}src/app/notifications/page.tsx`, "initialItems={result.items}"],
        ]);
        for (const [path, initialDataMarker] of pages) {
          const page = content(files, path);
          expect(page, path).not.toMatch(/^["']use client["'];/);
          expect(page, path).toContain(
            `createRequestApplicationForRequest } from "${applicationModule}"`,
          );
          expect(page, path).toContain(initialDataMarker);
          expect(page, path).toContain("<Suspense");
          expect(page, path).not.toMatch(FORBIDDEN_SERVER_UI_TRANSPORT);
        }
      });

      test(`${mode}/${database} routes authenticated UI mutations through validated actions`, () => {
        const files = generated(mode, database);
        const root = prefix(mode);
        const actions = [
          `${root}src/app/admin/users/actions.ts`,
          `${root}src/app/settings/workspace/actions.ts`,
          `${root}src/app/billing/actions.ts`,
          `${root}src/app/settings/actions.ts`,
          `${root}src/app/notifications/actions.ts`,
        ];
        for (const path of actions) {
          const action = content(files, path);
          expect(action, path).toMatch(/^["']use server["'];/);
          expect(action, path).toContain("safeParse(");
          expect(action, path).toContain("revalidatePath(");
          expect(action, path).toContain("createRequestApplicationForRequest");
          expect(action, path).not.toMatch(FORBIDDEN_SERVER_UI_TRANSPORT);
        }
        const settingsActions = content(files, `${root}src/app/settings/actions.ts`);
        const settingsClients = [
          content(files, `${root}src/app/settings/components/profile-card.tsx`),
          content(files, `${root}src/app/settings/components/password-card.tsx`),
          content(files, `${root}src/app/settings/components/danger-zone-card.tsx`),
        ].join("\n");
        if (database === "convex") {
          expect(settingsActions).not.toContain("auth.api");
          expect(settingsActions).not.toContain("import { auth }");
          expect(settingsActions).toContain("revokeIdentitySessionAction");
          expect(settingsClients).toContain("identityClient.updateProfile");
          expect(settingsClients).toContain("identityClient.changePassword");
          expect(settingsClients).toContain("identityClient.deleteAccount");
          expect(settingsClients).not.toMatch(
            /updateProfileAction|changePasswordAction|deleteAccountAction/,
          );
        } else {
          expect(settingsActions).toContain("auth.api.updateUser");
          expect(settingsActions).toContain("auth.api.changePassword");
          expect(settingsActions).toContain("auth.api.deleteUser");
          expect(settingsClients).toContain("updateProfileAction");
          expect(settingsClients).toContain("changePasswordAction");
          expect(settingsClients).toContain("deleteAccountAction");
        }
        expect(content(files, `${root}src/features/admin-users/mutations.ts`)).toContain(
          "createAdminUserAction",
        );
        expect(content(files, `${root}src/features/identity-workspace/mutations.ts`)).toContain(
          "createOrganizationAction",
        );
        expect(content(files, `${root}src/app/billing/hooks/use-billing-page.ts`)).toContain(
          "createBillingCheckoutAction",
        );
        expect(content(files, `${root}src/features/notifications/mutations.ts`)).toContain(
          "createSelfNotificationAction",
        );
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} preloads remaining authenticated Next reads without transport self-calls`, () => {
        const files = generatedRemainingCapabilities(mode, database);
        const root = prefix(mode);
        const applicationModule =
          mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
        const applicationRoot =
          mode === "monorepo"
            ? "packages/services/src/application"
            : "src/server/services/application";

        const messagesPage = content(files, `${root}src/app/(app)/messages/page.tsx`);
        expect(messagesPage).not.toMatch(/^["']use client["'];/);
        expect(messagesPage).toContain(
          `createRequestApplicationForRequest, type ConversationDto } from "${applicationModule}"`,
        );
        expect(messagesPage).toContain("application.messaging.listConversations()");
        expect(messagesPage).toContain("initialConversations={");
        expect(messagesPage).toContain("<Suspense");
        expect(messagesPage).not.toMatch(FORBIDDEN_SERVER_UI_TRANSPORT);

        const messagesClient = content(files, `${root}src/app/(app)/messages/client.tsx`);
        expect(messagesClient).toMatch(/^["']use client["'];/);
        expect(messagesClient).toContain("initialConversations");
        if (database === "postgres") {
          expect(content(files, `${root}src/app/(app)/messages/hooks/use-messaging.ts`)).toContain(
            "orpc.messaging.listMessages",
          );
        } else {
          expect(messagesClient).toContain('from "convex/react"');
          expect(messagesClient).toContain("const liveValue: unknown = useQuery(");
          expect(messagesClient).toContain("liveValue.filter(isLiveConversation)");
          expect(messagesClient).toContain("liveId: null");
        }

        const flagsPage = content(files, `${root}src/app/feature-flags/page.tsx`);
        expect(flagsPage).not.toMatch(/^["']use client["'];/);
        expect(flagsPage).toContain("createRequestApplicationForRequest");
        expect(flagsPage).toContain("evaluateAuthenticatedFeatureFlag");
        expect(flagsPage).toContain('"new-dashboard"');
        expect(flagsPage).toContain("initialResult={initialResult}");
        expect(flagsPage).toContain("<Suspense");
        expect(flagsPage).not.toMatch(FORBIDDEN_SERVER_UI_TRANSPORT);

        const flagApplication = content(files, `${applicationRoot}/feature-flags.ts`);
        expect(flagApplication).toContain("createAuthenticatedFeatureFlagSubject(user.id");
        expect(flagApplication).toContain("createFeatureFlagService({ provider }).evaluate");
        expect(flagApplication).toContain("evaluatedAt: value.evaluatedAt.toISOString()");
        expect(flagApplication).not.toMatch(/@repo\/api|@\/server\/api|\/api\/rpc/);

        const adapterPath =
          mode === "monorepo"
            ? "packages/services/src/feature-flags/posthog.ts"
            : "src/server/services/feature-flags/posthog.ts";
        expect(content(files, adapterPath)).toContain("createPostHogFeatureFlagAdapter");
        expect(
          files.some(({ path }) => path.includes("api/src/adapters/feature-flags/posthog")),
        ).toBe(false);
      });

      test(`${mode}/${database} retains only explicit live, binary, streaming, and shared-client protocol exceptions`, () => {
        const files = generatedRemainingCapabilities(mode, database);
        const root = prefix(mode);

        const storage = content(files, `${root}src/features/storage/mutations.ts`);
        expect(storage).toContain("no collection/list use case to preload");
        expect(storage).toContain("orpcClient.storage.uploadBase64");
        expect(storage).toContain("orpcClient.storage.downloadBase64");

        const jobsQuery = content(files, `${root}src/features/jobs/queries.ts`);
        const jobsMutation = content(files, `${root}src/features/jobs/mutations.ts`);
        expect(jobsQuery).toContain("there is no list-runs contract");
        expect(jobsQuery).toContain("orpcClient.jobs.getRun");
        expect(jobsMutation).toContain("orpcClient.jobs.enqueue");
        expect(jobsMutation).toContain("orpcClient.jobs.cancelRun");

        const pdfClientPath =
          mode === "monorepo" ? "packages/pdf/src/client/usePdf.ts" : "src/hooks/usePdf.ts";
        const pdfClient = content(files, pdfClientPath);
        expect(pdfClient).toContain('"/api/pdf"');
        expect(pdfClient).toContain('credentials: "include"');
        expect(content(files, `${root}src/app/api/pdf/route.ts`)).toContain("renderToBuffer");

        const agentPage = content(files, `${root}src/app/agent/page.tsx`);
        expect(agentPage).toContain('useEveAgent({ host: "/api/agent" })');
        expect(content(files, `${root}src/app/api/agent/[...path]/route.ts`)).toContain(
          "handleEveFacadeRequest",
        );

        if (database === "postgres") {
          const messaging = content(files, `${root}src/app/(app)/messages/hooks/use-messaging.ts`);
          expect(messaging).toContain("subscribeRealtime(conversationId");
          expect(messaging).toContain("orpc.messaging.sendMessage");
          expect(
            content(files, `${root}src/app/(app)/messages/_components/message-composer.tsx`),
          ).toContain('fetch("/api/messaging/attachments"');
        } else {
          expect(
            content(files, `${root}src/app/(app)/messages/_components/convex-message-thread.tsx`),
          ).toContain("useMutation(api.messaging.sendMessage)");
        }

        const arbitraryFlagEvaluation = content(
          files,
          `${root}src/features/feature-flags/queries.ts`,
        );
        expect(arbitraryFlagEvaluation).toContain("orpcClient.featureFlags.evaluate");
      });
    }
  }

  test("splits Next Convex messaging into bounded, closed shadcn components", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generatedRemainingCapabilities(mode, "convex");
      const root = prefix(mode);
      const clientPath = `${root}src/app/(app)/messages/client.tsx`;
      const sidebarPath = `${root}src/app/(app)/messages/_components/convex-conversation-sidebar.tsx`;
      const threadPath = `${root}src/app/(app)/messages/_components/convex-message-thread.tsx`;
      const client = content(files, clientPath);
      const sidebar = content(files, sidebarPath);
      const thread = content(files, threadPath);

      expect(client.split(/\r?\n/).length, clientPath).toBeLessThanOrEqual(120);
      expect(sidebar.split(/\r?\n/).length, sidebarPath).toBeLessThanOrEqual(150);
      expect(thread.split(/\r?\n/).length, threadPath).toBeLessThanOrEqual(150);
      expect(client).toContain('from "./_components/convex-conversation-sidebar"');
      expect(client).toContain('from "./_components/convex-message-thread"');
      expect(client).toContain("liveValue.filter(isLiveConversation)");
      expect(client).toContain("liveId: null");
      expect(sidebar).toContain("disabled={conversation.liveId === null}");
      expect(`${client}\n${sidebar}\n${thread}`).not.toMatch(
        /\bas never\b|\bas Array<|import type \{ Doc/,
      );
      for (const source of [sidebar, thread]) {
        expect(source).toContain('from "@/components/ui/');
      }
      expect(thread).toContain("useMutation(api.messaging.sendMessage)");
      expect(thread).toContain("useMutation(api.messaging.sendTyping)");
    }
  });

  test("keeps TanStack on its framework-specific server and browser adapters", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "postgres", "tanstack-start");
      const root = prefix(mode);
      expect(files.some((file) => file.path === `${root}src/lib/orpc.server.ts`)).toBe(false);
      expect(content(files, `${root}src/lib/orpc.ts`)).toContain("createRequestApiClient");
      expect(files.some((file) => file.path.endsWith("/settings/workspace/actions.ts"))).toBe(
        false,
      );
      expect(files.some((file) => file.path.endsWith("/admin/users/actions.ts"))).toBe(false);
    }
  });

  test("keeps public Next feature flags reachable without inventing a request facade", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generatedPublicFlagsWithoutRequestApplication(mode);
      const root = prefix(mode);
      const route = content(files, `${root}src/app/feature-flags/page.tsx`);
      const applicationRoot =
        mode === "monorepo"
          ? "packages/services/src/application/index.ts"
          : "src/server/services/application/index.ts";
      expect(
        files.some(({ path }) => path === applicationRoot),
        mode,
      ).toBe(false);
      expect(route).toContain("<FeatureFlagsPage initialResult={null} />");
      expect(route).not.toContain("services/application");
      expect(route).not.toContain("createRequestApplicationForRequest");
      expect(content(files, `${root}src/features/feature-flags/queries.ts`)).toContain(
        "orpcClient.featureFlags.evaluate",
      );
    }
  });
});
