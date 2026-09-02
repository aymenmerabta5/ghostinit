import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import {
  checkCapabilityIsolation,
  getCapabilityFromPath,
} from "../../src/lib/architecture/rules/capability.js";
import { checkApplicationLayer } from "../../src/lib/architecture/rules/application-purity.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function generate(
  mode: "monorepo" | "single",
  database: "postgres" | "convex",
  overrides: Partial<ProjectConfig> = {},
) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "request-application",
      version: "0.1.0",
      runtime: "bun",
      mode,
      framework: "nextjs",
      database,
      apps: ["web"],
      billing: ["stripe"],
      features: [],
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      analytics: false,
      notifications: true,
      cache: "none",
      deploy: "none",
      ...overrides,
    }),
    { dryRun: true },
  );
}

function read(files: TemplateFile[], path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file: ${path}`);
  return value;
}

function runtimeSource(source: string): string {
  return source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/^export\s+/gm, "");
}

class TestApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function loadFacade(source: string) {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(runtimeSource(source));
  return new Function("RequestApplicationError", `${javascript}; return createRequestApplication;`)(
    TestApplicationError,
  ) as (dependencies: Record<string, unknown>) => Record<string, unknown>;
}

function loadIdentityActions(source: string) {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(runtimeSource(source));
  return new Function("createServiceORPCError", `${javascript}; return createIdentityActions;`)(
    (error: unknown) => {
      throw error;
    },
  ) as () => {
    organizations: {
      list(input: {
        context: Record<string, unknown>;
        input: Record<string, never>;
      }): Promise<unknown>;
    };
  };
}

describe("generated request application facade", () => {
  test("classifies only exact request composition roots while keeping the facade pure", () => {
    for (const root of ["packages/services/src/application", "src/server/services/application"]) {
      const composition = `${root}/composition/identity.ts`;
      const server = `${root}/server.ts`;
      const facade = `${root}/facade.ts`;
      expect(getCapabilityFromPath(composition), composition).toBeNull();
      expect(getCapabilityFromPath(server), server).toBeNull();
      expect(getCapabilityFromPath(facade), facade).toEqual({
        kind: "service",
        name: "application",
      });
      expect(getCapabilityFromPath(`${root}/adapters/identity/convex.ts`)).toEqual({
        kind: "service",
        name: "application",
      });
      expect(getCapabilityFromPath(`${root}/server.ts.bak`)).toEqual({
        kind: "service",
        name: "application",
      });

      const capabilityFindings: Parameters<typeof checkCapabilityIsolation>[0] = [];
      const target = root.startsWith("packages/")
        ? "packages/services/src/admin/index.ts"
        : "src/server/services/admin/index.ts";
      for (const allowed of [composition, server]) {
        checkCapabilityIsolation(
          capabilityFindings,
          allowed,
          `D:/generated/${allowed}`,
          "../admin/index",
          `D:/generated/${target}`,
        );
      }
      expect(capabilityFindings).toEqual([]);
      checkCapabilityIsolation(
        capabilityFindings,
        facade,
        `D:/generated/${facade}`,
        "../admin/index",
        `D:/generated/${target}`,
      );
      expect(capabilityFindings).toMatchObject([
        { id: "capability-cross-import", severity: "HIGH", file: facade },
      ]);

      const findings: Parameters<typeof checkApplicationLayer>[0] = [];
      checkApplicationLayer(findings, composition, "drizzle-orm");
      expect(findings).toEqual([]);
      checkApplicationLayer(findings, composition, "@orpc/server");
      checkApplicationLayer(findings, facade, "drizzle-orm");
      expect(findings).toMatchObject([
        { id: "application-imports-framework", severity: "HIGH", file: composition },
        { id: "application-imports-framework", severity: "HIGH", file: facade },
      ]);
    }
  });

  test("emits one transport-free server facade in every mode and database", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const files = generate(mode, database);
        const root =
          mode === "monorepo"
            ? "packages/services/src/application"
            : "src/server/services/application";
        const application = files.filter(({ path }) => path.startsWith(`${root}/`));
        const paths = new Set(application.map(({ path }) => path));
        const allPaths = new Set(files.map(({ path }) => path));
        const facade = read(files, `${root}/facade.ts`);
        expect(facade).toContain(
          `from "${mode === "monorepo" ? "@repo/services" : "@/server/services"}"`,
        );
        expect(facade).not.toMatch(
          /from ["'](?:\.\.\/(?:admin|identity|notifications)|@\/server\/services\/(?:admin|identity|notifications))/,
        );
        for (const suffix of [
          "index.ts",
          "types.ts",
          "errors.ts",
          "facade.ts",
          "server.ts",
          "rate-limit.ts",
          "composition/admin.ts",
          "composition/identity.ts",
          "composition/notifications.ts",
        ]) {
          expect(paths.has(`${root}/${suffix}`), `${mode}/${database}/${suffix}`).toBe(true);
        }
        for (const { path, content } of application) {
          expect(content, path).not.toMatch(
            /@repo\/api|@orpc\/|from ["']next(?:\/|["'])|@tanstack\//,
          );
        }
        const apiRoot = mode === "monorepo" ? "packages/api/src" : "src/server/api";
        expect(allPaths.has(`${apiRoot}/composition/admin.ts`)).toBe(false);
        expect(allPaths.has(`${apiRoot}/composition/identity.ts`)).toBe(false);
        expect(allPaths.has(`${apiRoot}/composition/notifications.ts`)).toBe(false);
        const applicationIndex = read(files, `${root}/index.ts`);
        expect(applicationIndex).toContain("createRequestApplicationForRequest");
        expect(applicationIndex).toContain("type { RequestApplication }");
        expect(applicationIndex).not.toContain("createRequestApplication,");
        expect(applicationIndex).not.toContain("RequestApplicationDependencies");
        expect(applicationIndex).not.toContain("RequestPrincipal");
        if (mode === "monorepo") {
          const manifest = JSON.parse(read(files, "packages/services/package.json")) as {
            exports: Record<string, string>;
          };
          expect(manifest.exports["./application"]).toBe("./src/application/index.ts");
        }
        const me = read(files, `${apiRoot}/procedures/me.ts`);
        expect(me).toContain("return await context.application.me()");
        const admin = read(files, `${apiRoot}/procedures/admin/change-role.ts`);
        expect(admin).toContain("context.application.admin.changeRole(input)");
        expect(admin).not.toMatch(/createAdminServiceForRequest|rateLimitStrict|@repo\/database/);
        const billing = read(files, `${apiRoot}/procedures/billing/create-checkout.ts`);
        expect(billing).toContain("context.application.billing.createCheckout(input)");
        expect(billing).not.toMatch(/getBillingProvider|createCheckoutService|rateLimit\(/);
      }
    }
  });

  test("keeps optional facade output lint-safe and request context variables authoritative", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const noBilling = generate(mode, "postgres", { billing: [] });
      const applicationRoot =
        mode === "monorepo"
          ? "packages/services/src/application"
          : "src/server/services/application";
      const facade = read(noBilling, `${applicationRoot}/facade.ts`);
      const server = read(noBilling, `${applicationRoot}/server.ts`);
      expect(facade).not.toContain("function publicValue");
      expect(facade).not.toContain("function requireVerifiedPrincipal");
      expect(server).not.toContain("BillingApplicationPort");
      expect(server).not.toContain("BillingCheckoutInput");
      expect(server).toContain("RequestPrincipal");

      const withFeatureFlags = generate(mode, "postgres", {
        billing: [],
        featureFlags: "posthog",
      });
      const apiRoot = mode === "monorepo" ? "packages/api/src" : "src/server/api";
      const context = read(withFeatureFlags, `${apiRoot}/context.ts`);
      expect(context).toContain("featureFlagSubject");
      expect(context).not.toContain("verifiedSession.user.email");
      if (mode === "single") {
        expect(context).toContain("createAuthenticatedFeatureFlagSubject");
        expect(context).toContain("email: principal.email");
      }
    }
  });

  test("emits the exact services compiler and manifest closure required by auth adapters", () => {
    const postgres = generate("monorepo", "postgres");
    const postgresConfig = JSON.parse(read(postgres, "packages/services/tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
    };
    const postgresManifest = JSON.parse(read(postgres, "packages/services/package.json")) as {
      devDependencies?: Record<string, string>;
    };
    expect(postgresConfig.compilerOptions.jsx).toBe("react-jsx");
    expect(postgresManifest.devDependencies?.["@types/react"]).toBeDefined();

    const convex = generate("monorepo", "convex");
    const convexManifest = JSON.parse(read(convex, "packages/services/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(convexManifest.dependencies?.convex).toBeDefined();
    const servicesSource = convex
      .filter(({ path }) => path.startsWith("packages/services/src/"))
      .map(({ content }) => content)
      .join("\n");
    expect(servicesSource).not.toContain("convex/_generated/dataModel");
    expect(servicesSource).toContain('import type { GenericId as Id } from "convex/values"');
  });

  test("normalizes messaging through a serializable application DTO and the server auth owner", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const files = generate(mode, database, {
          billing: [],
          messaging: true,
          storage: true,
        });
        const root =
          mode === "monorepo"
            ? "packages/services/src/application"
            : "src/server/services/application";
        const server = read(files, `${root}/server.ts`);
        const facade = read(files, `${root}/facade.ts`);
        const types = read(files, `${root}/types.ts`);
        const webRoot = mode === "monorepo" ? "apps/web/" : "";
        const messagesPage = read(files, `${webRoot}src/app/(app)/messages/page.tsx`);
        const key = `${mode}/${database}`;

        expect(types, key).toContain("export interface ConversationDto {");
        expect(types, key).toContain("readonly createdAt: string;");
        expect(types, key).toContain("readonly updatedAt: string;");
        expect(read(files, `${root}/index.ts`), key).toContain("ConversationDto");
        expect(facade, key).toContain(
          "listConversations(userId: string): Promise<ConversationDto[]>;",
        );
        expect(facade, key).toContain(
          "conversations: await dependencies.messaging.listConversations(principal.userId)",
        );
        expect(facade, key).not.toContain("listConversations(principal.userId)).map(publicRecord)");
        expect(messagesPage, key).toContain("type ConversationDto");
        expect(messagesPage, key).toContain("conversationSummary(value: ConversationDto)");
        expect(messagesPage, key).not.toContain("Readonly<Record<string, unknown>>");
        expect(server, key).toContain("createdAt:");
        expect(server, key).toContain(".toISOString()");
        if (mode === "monorepo") {
          expect(server, key).toContain('from "@repo/auth/server"');
          expect(server, key).not.toMatch(/from "@repo\/auth";/);
        }
        if (database === "convex") {
          expect(server, key).toContain("fetchAuthQuery(api.messaging.listConversations, {})");
          expect(server, key).toContain("const values: unknown = await fetchAuthQuery");
          expect(server, key).toContain("values.map(toConvexConversationDto)");
          expect(server, key).toContain("function toConvexConversationDto(");
          expect(server, key).not.toMatch(/values as|conversation as|:\s*any\b/);
        } else {
          expect(server, key).toContain("createdAt: conversation.createdAt.toISOString()");
        }
      }
    }
  });

  test("preserves declared transport errors and established public error aliases", () => {
    const files = generate("monorepo", "postgres");
    const subscriptions = read(files, "packages/api/src/procedures/billing/subscriptions.ts");
    expect(subscriptions).toContain('TOO_MANY_REQUESTS: { message: "Too many requests" }');
    expect(subscriptions).toContain(
      'SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" }',
    );
    const notifications = read(files, "packages/api/src/notifications/contract.ts");
    expect(notifications.match(/\.errors\(notificationContractErrors\)/g)).toHaveLength(4);
    const notificationActions = read(files, "apps/web/src/app/notifications/actions.ts");
    expect(notificationActions).toContain("notificationId: z.string().min(1).max(128)");
    const notificationService = read(files, "packages/services/src/notifications/service.ts");
    expect(notificationService).toContain("normalizedNotificationId.length > 128");
    const serviceErrors = read(files, "packages/api/src/utils/service-error.ts");
    expect(serviceErrors).toContain('APPLICATION_ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED"');
    expect(serviceErrors).toContain("requestApplicationCodeAliases[error.code]");
    const server = read(files, "packages/services/src/application/server.ts");
    expect(server).not.toContain('typeof result.error.code === "string") throw result.error');
    expect(server).toContain('code === "CUSTOMER_NOT_FOUND"');
    expect(server).toContain('code === "NOT_SUPPORTED"');
  });

  test("redirects anonymous settings requests before invoking protected identity services", () => {
    const settings = read(generate("monorepo", "postgres"), "apps/web/src/app/settings/page.tsx");
    const me = settings.indexOf("const me = await application.me()");
    const redirect = settings.indexOf('if (!me.user) redirect("/sign-in")');
    const sessions = settings.indexOf("await application.identity.sessions.list()");
    expect(me).toBeGreaterThanOrEqual(0);
    expect(redirect).toBeGreaterThan(me);
    expect(sessions).toBeGreaterThan(redirect);
  });

  test("binds authoritative actors once and serializes direct service results", async () => {
    const files = generate("monorepo", "postgres");
    const createRequestApplication = loadFacade(
      read(files, "packages/services/src/application/facade.ts"),
    );
    const calls: string[] = [];
    const now = new Date("2026-09-01T12:00:00.000Z");
    const principal = {
      userId: "app-user",
      identityUserId: "auth-user",
      sessionId: "session-1",
      email: "user@example.test",
      emailVerified: true,
      name: "User",
      role: "admin",
      banned: false,
      authenticatedAt: now,
      activeOrganizationId: "org-1",
      activeTeamId: "team-1",
    };
    const application = createRequestApplication({
      principal,
      rateLimit: async (key: string) => calls.push(`rate:${key}`),
      admin: {
        listUsers: async (actor: { id: string }) => {
          calls.push(`admin:${actor.id}`);
          return { users: [], total: 0 };
        },
      },
      identity: {
        sessions: {
          list: async (actor: { userId: string }) => {
            calls.push(`identity:${actor.userId}`);
            return [
              {
                id: "session-1",
                userId: actor.userId,
                createdAt: now,
                authenticatedAt: now,
                expiresAt: now,
                revokedAt: null,
              },
            ];
          },
        },
      },
      billing: {
        subscriptions: async () => ({
          subscriptions: [
            {
              _id: "subscription-1",
              userId: "must-not-leak",
              createdAt: now,
              nested: { tokenFingerprint: "must-not-leak", safe: "visible" },
            },
          ],
          invoices: [],
          usageEvents: [],
          licenseKeys: [],
        }),
      },
      notifications: {
        listInbox: async (actor: { userId: string }) => ({
          items: [
            {
              id: "notification-1",
              userId: "must-not-leak",
              pushToken: "must-not-leak",
              kind: "user.note",
              title: "Hello",
              body: "World",
              href: null,
              data: {},
              createdAt: now,
              readAt: null,
            },
          ],
          nextCursor: null,
          unreadCount: actor.userId === "app-user" ? 0 : 1,
        }),
      },
    });

    const me = await Reflect.apply(Reflect.get(application, "me"), application, []);
    expect(me).toMatchObject({
      user: { id: "app-user" },
      sessionId: "session-1",
      activeOrganizationId: "org-1",
      activeTeamId: "team-1",
    });
    const admin = Reflect.get(application, "admin") as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    await admin.listUsers({ page: 1, limit: 20 });
    const identity = Reflect.get(application, "identity") as Record<
      string,
      Record<string, (...args: unknown[]) => unknown>
    >;
    const sessions = (await identity.sessions.list()) as Array<{ createdAt: string }>;
    expect(sessions[0]?.createdAt).toBe(now.toISOString());
    const billing = Reflect.get(application, "billing") as { subscriptions(): Promise<unknown> };
    const snapshot = (await billing.subscriptions()) as {
      subscriptions: Array<Record<string, unknown>>;
    };
    expect(snapshot.subscriptions[0]).toEqual({
      id: "subscription-1",
      createdAt: now.toISOString(),
      nested: { safe: "visible" },
    });
    const notifications = Reflect.get(application, "notifications") as {
      listInbox(input: Record<string, never>): Promise<{ items: Array<Record<string, unknown>> }>;
    };
    const inbox = await notifications.listInbox({});
    expect(inbox.items[0]).toEqual({
      id: "notification-1",
      kind: "user.note",
      title: "Hello",
      body: "World",
      href: null,
      data: {},
      createdAt: now.toISOString(),
      readAt: null,
    });
    expect(calls).toContain("admin:auth-user");
    expect(calls).toContain("identity:app-user");
    expect(calls).toContain("rate:admin:list:app-user");
    expect(calls).toContain("rate:billing:subscriptions:app-user");
  });

  test("rejects suspended actors before rate limits or capability side effects", async () => {
    const createRequestApplication = loadFacade(
      read(generate("single", "postgres"), "src/server/services/application/facade.ts"),
    );
    let sideEffects = 0;
    const application = createRequestApplication({
      principal: {
        userId: "banned-user",
        identityUserId: "banned-auth",
        sessionId: "session",
        email: "banned@example.test",
        emailVerified: true,
        name: null,
        role: "admin",
        banned: true,
        authenticatedAt: new Date(),
        activeOrganizationId: null,
        activeTeamId: null,
      },
      rateLimit: async () => {
        sideEffects += 1;
      },
      admin: {
        listUsers: async () => {
          sideEffects += 1;
        },
      },
      identity: {
        sessions: {
          list: async () => {
            sideEffects += 1;
            return [];
          },
        },
      },
      billing: {
        subscriptions: async () => {
          sideEffects += 1;
          return { subscriptions: [], invoices: [], usageEvents: [], licenseKeys: [] };
        },
      },
      notifications: {
        listInbox: async () => {
          sideEffects += 1;
          return { items: [], nextCursor: null, unreadCount: 0 };
        },
      },
    });
    const billing = Reflect.get(application, "billing") as { subscriptions(): Promise<unknown> };
    await expect(billing.subscriptions()).rejects.toMatchObject({
      code: "APPLICATION_ACCOUNT_SUSPENDED",
    });
    expect(sideEffects).toBe(0);
  });

  test("enforces authentication, verification, administration, and limiter order centrally", async () => {
    const createRequestApplication = loadFacade(
      read(generate("monorepo", "postgres"), "packages/services/src/application/facade.ts"),
    );
    let capabilityCalls = 0;
    const principal = {
      userId: "app-user",
      identityUserId: "auth-user",
      sessionId: "session",
      email: "user@example.test",
      emailVerified: true,
      name: null,
      role: "admin",
      banned: false,
      authenticatedAt: new Date(),
      activeOrganizationId: null,
      activeTeamId: null,
    };
    const dependencies = {
      rateLimit: async () => {},
      admin: {
        listUsers: async () => {
          capabilityCalls += 1;
          return { users: [], total: 0 };
        },
      },
      billing: {
        subscriptions: async () => {
          capabilityCalls += 1;
          return { subscriptions: [], invoices: [], usageEvents: [], licenseKeys: [] };
        },
        createPaymentLink: async () => {
          capabilityCalls += 1;
          return { id: "link", url: "https://example.test" };
        },
      },
      identity: {},
      notifications: {},
    };

    const anonymous = createRequestApplication({ ...dependencies, principal: null });
    await expect(
      (
        Reflect.get(anonymous, "admin") as { listUsers(input: unknown): Promise<unknown> }
      ).listUsers({}),
    ).rejects.toMatchObject({ code: "APPLICATION_UNAUTHENTICATED" });

    const unverified = createRequestApplication({
      ...dependencies,
      principal: { ...principal, emailVerified: false },
    });
    await expect(
      (Reflect.get(unverified, "billing") as { subscriptions(): Promise<unknown> }).subscriptions(),
    ).rejects.toMatchObject({ code: "APPLICATION_EMAIL_NOT_VERIFIED" });

    const nonAdmin = createRequestApplication({
      ...dependencies,
      principal: { ...principal, role: "user" },
    });
    await expect(
      (
        Reflect.get(nonAdmin, "billing") as {
          createPaymentLink(input: unknown): Promise<unknown>;
        }
      ).createPaymentLink({}),
    ).rejects.toMatchObject({ code: "APPLICATION_ADMIN_REQUIRED" });

    const limited = createRequestApplication({
      ...dependencies,
      principal,
      rateLimit: async () => {
        throw new TestApplicationError("APPLICATION_RATE_LIMITED", "limited");
      },
    });
    await expect(
      (Reflect.get(limited, "admin") as { listUsers(input: unknown): Promise<unknown> }).listUsers(
        {},
      ),
    ).rejects.toMatchObject({ code: "APPLICATION_RATE_LIMITED" });
    expect(capabilityCalls).toBe(0);
  });

  test("keeps direct and oRPC identity paths behaviorally identical", async () => {
    const files = generate("monorepo", "postgres");
    const expected = [{ id: "org-1", name: "Workspace" }];
    let calls = 0;
    const application = {
      identity: {
        organizations: {
          async list() {
            calls += 1;
            return expected;
          },
        },
      },
    };
    const direct = await application.identity.organizations.list();
    const createIdentityActions = loadIdentityActions(
      read(files, "packages/api/src/identity/actions.ts"),
    );
    const throughTransport = await createIdentityActions().organizations.list({
      context: { application },
      input: {},
    });
    expect(throughTransport).toEqual(direct);
    expect(calls).toBe(2);
  });
});
