import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(
  mode: "monorepo" | "single",
  database: "postgres" | "convex",
  auth = true,
  billing = false,
): ProjectConfig {
  return projectConfigSchema.parse({
    name: `eve-security-${mode}-${database}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database,
    billing: billing ? ["stripe"] : [],
    features: [],
    apps: ["web"],
    preset: "custom",
    auth,
    api: true,
    email: false,
    analytics: false,
    eve: true,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    cache: "none",
    deploy: "none",
  });
}

function source(files: ReturnType<typeof generateProjectFiles>, path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file: ${path}`);
  return value;
}

async function importGenerated<T>(content: string, name: string): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-security-"));
  temporaryRoots.push(root);
  const path = join(root, `${name}.ts`);
  writeFileSync(path, content);
  return (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as T;
}

describe("Eve browser authentication and durable ownership", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} emits a private Eve service and authenticated facade`, () => {
        const files = generateProjectFiles(config(mode, database), { dryRun: true });
        const channelPath =
          mode === "monorepo" ? "apps/eve/agent/channels/eve.ts" : "agent/channels/eve.ts";
        const pagePath =
          mode === "monorepo" ? "apps/web/src/app/agent/page.tsx" : "src/app/agent/page.tsx";
        const routePath =
          mode === "monorepo"
            ? "apps/web/src/app/api/agent/[...path]/route.ts"
            : "src/app/api/agent/[...path]/route.ts";
        const nextConfigPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
        const facadePath =
          mode === "monorepo" ? "packages/api/src/eve/facade.ts" : "src/server/eve/facade.ts";
        const actorPath =
          mode === "monorepo" ? "packages/api/src/eve/actor.ts" : "src/server/eve/actor.ts";
        const proxyPath = mode === "monorepo" ? "apps/web/src/proxy.ts" : "src/proxy.ts";
        const admissionPath =
          mode === "monorepo"
            ? "packages/api/src/eve/admission-adapter.ts"
            : "src/server/eve/admission-adapter.ts";
        const ownershipPath =
          mode === "monorepo"
            ? "packages/api/src/eve/ownership-adapter.ts"
            : "src/server/eve/ownership-adapter.ts";
        const lifecycleCallbackPath =
          mode === "monorepo"
            ? "packages/api/src/eve/lifecycle-callback.ts"
            : "src/server/eve/lifecycle-callback.ts";
        const lifecycleRoutePath =
          mode === "monorepo"
            ? "apps/web/src/app/api/agent/internal/eve-lifecycle/route.ts"
            : "src/app/api/agent/internal/eve-lifecycle/route.ts";
        const lifecycleHookPath =
          mode === "monorepo"
            ? "apps/eve/agent/hooks/admission-lifecycle.ts"
            : "agent/hooks/admission-lifecycle.ts";
        const reconciliationPath =
          mode === "monorepo"
            ? "packages/api/src/eve/admission-reconcile.ts"
            : "src/server/eve/admission-reconcile.ts";

        const channel = source(files, channelPath);
        expect(channel).toContain("verifyHttpBasic");
        expect(channel).toContain("principalId === PROXY_USERNAME");
        expect(channel).toContain('principalType === "service"');
        expect(channel).toContain("trustedForwarders");
        expect(channel).not.toContain("vercelOidc");
        expect(channel).not.toContain("localDev");

        expect(source(files, pagePath)).toContain('useEveAgent({ host: "/api/agent" })');
        expect(source(files, pagePath)).not.toContain("Cookie auth flows Better Auth");
        const route = source(files, routePath);
        expect(route).toContain("handleEveFacadeRequest");
        // Cache Components rejects route-segment runtime overrides. Next's
        // default runtime is already Node, so the facade must not redeclare it.
        expect(source(files, nextConfigPath)).toContain("cacheComponents: true");
        expect(route).not.toContain('export const runtime = "nodejs"');
        expect(source(files, proxyPath)).toContain('["/agent", "/dashboard"');

        const facade = source(files, facadePath);
        expect(facade).toContain("classifyEveFacadeRequest(request)");
        expect(facade).toContain("hasTrustedBrowserOrigin(request, browserOrigin)");
        expect(facade).toContain("MAX_EVE_JSON_BYTES");
        expect(facade).toContain('Reflect.deleteProperty(body, "forwardedPrincipal")');
        expect(facade).toContain("agentSessionOwnershipPort.authorize");
        expect(facade).toContain("agentSessionOwnershipPort.claim");
        expect(facade).toContain("agentSessionOwnershipPort.retire");
        expect(facade).toContain("actor.emailVerified");
        expect(facade).toContain("agentAdmissionPort.admit");
        expect(facade).toContain("reconcileExpiredEveAdmissions");
        expect(facade).toContain("eveAdmissionLeaseId");
        expect(facade.indexOf("reconcileExpiredEveAdmissions")).toBeLessThan(
          facade.indexOf("agentAdmissionPort.admit"),
        );
        expect(facade).toContain(".release({ actor: ownershipActor");
        expect(facade.indexOf("agentAdmissionPort.admit")).toBeLessThan(
          facade.indexOf("readBoundedJson(request)"),
        );
        expect(facade.indexOf("agentSessionOwnershipPort.claim")).toBeLessThan(
          facade.indexOf("return browserResponse(upstream, source)"),
        );
        expect(facade).toContain('redirect: "manual"');
        expect(facade).not.toContain("headers: request.headers");

        const callback = source(files, lifecycleCallbackPath);
        expect(callback).toContain("createHmac");
        expect(callback).toContain("timingSafeEqual");
        expect(callback).toContain("agentAdmissionPort.recordRuntimeEvent");
        expect(callback).not.toContain("resolveAuthenticatedEveActor");
        expect(source(files, lifecycleRoutePath)).toContain("handleEveLifecycleCallback");

        const hook = source(files, lifecycleHookPath);
        expect(hook).toContain('import { defineHook } from "eve/hooks"');
        expect(hook).toContain('async "*"(event, ctx)');
        expect(hook).toContain("ctx.session.id");
        expect(hook).toContain("X-GhostInit-Eve-Signature");
        expect(hook).not.toContain("monitorEveAdmissionStream");

        const reconciliation = source(files, reconciliationPath);
        expect(reconciliation).toContain("startIndex=-1&includeTailIndex=1");
        expect(reconciliation).toContain("listExpiredBoundSessions");
        expect(reconciliation).toContain("touchSession");

        const actor = source(files, actorPath);
        expect(actor).toContain("emailVerified");
        const admission = source(files, admissionPath);
        const ownershipAdapter = source(files, ownershipPath);
        expect(ownershipAdapter).toContain("teamId");
        const admissionPolicy =
          database === "postgres" ? admission : source(files, "convex/eve/sessions.ts");
        expect(admissionPolicy).toContain("APPLICATION_SPONSORED_EVE_ACCESS = true");
        expect(admissionPolicy).toContain('plan: "sponsored"');
        expect(admissionPolicy).toContain("EVE_MAX_OPERATIONS_PER_WINDOW");
        expect(admissionPolicy).toContain("EVE_OPERATION_RATE_WINDOW_MS");
        expect(admissionPolicy).toContain("EVE_MAX_CONCURRENT_OPERATIONS");
        expect(admissionPolicy).not.toContain("EVE_SPONSORED_MAX_OPERATIONS_PER_WINDOW");
        expect(admissionPolicy).not.toContain("EVE_SPONSORED_OPERATION_WINDOW_MS");
        if (database === "postgres") {
          expect(admission).toContain("EVE_ENTITLEMENT_UNSUPPORTED");
          expect(admission).not.toContain('import { subscriptions } from "');
          expect(actor).toContain("disableCookieCache: true");
          expect(actor).toContain("disableRefresh: true");
          expect(actor).toContain("isNull(sessions.revokedAt)");
          expect(actor).toContain("members.organizationId");
          expect(files.some((entry) => entry.path.endsWith("/schema/eve.ts"))).toBe(true);
          const schema = source(
            files,
            mode === "monorepo"
              ? "packages/database/src/schema/eve.ts"
              : "src/server/db/schema/eve.ts",
          );
          expect(schema).toContain("eveAgentAdmissions");
          expect(schema).toContain('teamId: text("team_id")');
          expect(schema).toContain('lastRuntimeEventId: text("last_runtime_event_id")');
          expect(admission).toContain("isNotNull(eveAgentAdmissions.eveSessionId)");
          expect(admission).toContain("recordRuntimeEvent");
        } else {
          expect(actor).toContain('url.searchParams.set("disableCookieCache", "true")');
          expect(actor).toContain('url.searchParams.set("disableRefresh", "true")');
          expect(actor).toContain("fetchAuthQuery(api.eve.sessions.current, {})");
          expect(source(files, "convex/eve/sessions.ts")).toContain("requireMembership");
          expect(source(files, "convex/eve/sessions.ts")).toContain("identityTeamMemberships");
          expect(source(files, "convex/eve/sessions.ts")).toContain("EVE_ENTITLEMENT_UNSUPPORTED");
          expect(source(files, "convex/eve/sessions.ts")).not.toContain('.query("subscriptions")');
          const schema = source(files, "convex/schema/eve.ts");
          expect(schema).toContain("eveAgentSessions");
          expect(schema).toContain("eveAgentAdmissions");
          expect(schema).toContain('teamId: v.optional(v.id("identityTeams"))');
          expect(schema).toContain("lastRuntimeEventId: v.optional(v.string())");
          expect(source(files, "convex/eve/sessions.ts")).toContain(
            "export const recordRuntimeEvent = mutation",
          );
        }
      });
    }

    test(`${mode} without application auth omits browser chat and fails closed`, () => {
      const files = generateProjectFiles(config(mode, "postgres", false), { dryRun: true });
      const channelPath =
        mode === "monorepo" ? "apps/eve/agent/channels/eve.ts" : "agent/channels/eve.ts";
      const pagePath =
        mode === "monorepo" ? "apps/web/src/app/agent/page.tsx" : "src/app/agent/page.tsx";
      expect(files.some((entry) => entry.path === pagePath)).toBe(false);
      expect(files.some((entry) => entry.path.includes("api/agent/[...path]"))).toBe(false);
      const channel = source(files, channelPath);
      expect(channel).toContain("placeholderAuth");
      expect(channel).toContain("localDev");
      expect(channel).not.toContain("verifyHttpBasic");
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} gates paid Eve work on durable billing entitlement and admission leases`, () => {
        const files = generateProjectFiles(config(mode, database, true, true), { dryRun: true });
        const admissionPath =
          mode === "monorepo"
            ? "packages/api/src/eve/admission-adapter.ts"
            : "src/server/eve/admission-adapter.ts";
        const admission = source(files, admissionPath);
        if (mode === "monorepo") {
          const manifest = JSON.parse(source(files, "packages/api/package.json")) as {
            dependencies?: Record<string, string>;
          };
          expect(manifest.dependencies?.["@repo/billing"]).toBe(
            database === "postgres" ? "workspace:*" : undefined,
          );
        }
        if (database === "postgres") {
          expect(admission).toContain('import { subscriptions } from "');
          expect(admission).toContain('plan: "pro"');
          expect(admission).not.toContain("APPLICATION_SPONSORED_EVE_ACCESS");
          expect(admission).toContain("pg_advisory_xact_lock");
          expect(admission).toContain("EVE_MAX_OPERATIONS_PER_WINDOW");
          expect(admission).toContain("EVE_MAX_CONCURRENT_OPERATIONS");
        } else {
          const functions = source(files, "convex/eve/sessions.ts");
          expect(functions).toContain('.query("subscriptions")');
          expect(functions).toContain('plan: "pro"');
          expect(functions).not.toContain("APPLICATION_SPONSORED_EVE_ACCESS");
          expect(functions).toContain("export const admit = mutation");
          expect(functions).toContain("export const releaseAdmission = mutation");
          expect(functions).toContain("EVE_MAX_OPERATIONS_PER_WINDOW");
          expect(functions).toContain("EVE_MAX_CONCURRENT_OPERATIONS");
        }
      });
    }
  }

  test("generated policy rejects unlisted routes, wrong methods, and foreign origins", async () => {
    const files = generateProjectFiles(config("single", "postgres"), { dryRun: true });
    const policy = await importGenerated<{
      classifyEveFacadeRequest(request: Request): { ok: boolean; status?: number };
      hasTrustedBrowserOrigin(request: Request, origin: string): boolean;
    }>(source(files, "src/server/eve/policy.ts"), "policy");
    const origin = "https://app.example.com";
    const headers = { Origin: origin, "Sec-Fetch-Site": "same-origin" };

    expect(
      policy.classifyEveFacadeRequest(
        new Request(`${origin}/api/agent/eve/v1/session`, { method: "POST", headers }),
      ).ok,
    ).toBe(true);
    expect(
      policy.classifyEveFacadeRequest(
        new Request(`${origin}/api/agent/eve/v1/session/wrun_1/stream?startIndex=0`, {
          headers: { "Sec-Fetch-Site": "same-origin" },
        }),
      ).ok,
    ).toBe(true);
    expect(
      policy.classifyEveFacadeRequest(
        new Request(`${origin}/api/agent/eve/v1/session/wrun_1/reset`, { method: "GET" }),
      ),
    ).toEqual({ ok: false, status: 405 });
    expect(
      policy.classifyEveFacadeRequest(
        new Request(`${origin}/api/agent/eve/v1/session/wrun_1/export`, { method: "POST" }),
      ),
    ).toEqual({ ok: false, status: 404 });
    expect(
      policy.classifyEveFacadeRequest(
        new Request(
          `${origin}/api/agent/eve/v1/session/wrun_1/stream?redirect=https://evil.example`,
          {
            headers: { "Sec-Fetch-Site": "same-origin" },
          },
        ),
      ),
    ).toEqual({ ok: false, status: 404 });

    expect(
      policy.hasTrustedBrowserOrigin(
        new Request(`${origin}/`, { method: "POST", headers }),
        origin,
      ),
    ).toBe(true);
    expect(
      policy.hasTrustedBrowserOrigin(
        new Request(`${origin}/`, {
          method: "POST",
          headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
        }),
        origin,
      ),
    ).toBe(false);
    expect(
      policy.hasTrustedBrowserOrigin(new Request(`${origin}/`, { method: "POST" }), origin),
    ).toBe(false);
  });

  test("generated ownership policy rejects malformed ids and compares tenant plus user", async () => {
    const files = generateProjectFiles(config("single", "postgres"), { dryRun: true });
    const ownership = await importGenerated<{
      isValidEveSessionId(value: string): boolean;
      sameAgentSessionOwner(
        record: { organizationId: string | null; teamId: string | null; userId: string },
        actor: { organizationId: string | null; teamId: string | null; userId: string },
      ): boolean;
    }>(source(files, "src/server/services/eve/ownership.ts"), "ownership");

    expect(ownership.isValidEveSessionId("wrun_valid-1")).toBe(true);
    expect(ownership.isValidEveSessionId("../other")).toBe(false);
    expect(
      ownership.sameAgentSessionOwner(
        { userId: "alice", organizationId: "org-a", teamId: "team-a" },
        { userId: "alice", organizationId: "org-a", teamId: "team-a" },
      ),
    ).toBe(true);
    expect(
      ownership.sameAgentSessionOwner(
        { userId: "alice", organizationId: "org-a", teamId: "team-a" },
        { userId: "alice", organizationId: "org-b", teamId: "team-a" },
      ),
    ).toBe(false);
    expect(
      ownership.sameAgentSessionOwner(
        { userId: "alice", organizationId: null, teamId: null },
        { userId: "bob", organizationId: null, teamId: null },
      ),
    ).toBe(false);
    expect(
      ownership.sameAgentSessionOwner(
        { userId: "alice", organizationId: "org-a", teamId: "team-a" },
        { userId: "alice", organizationId: "org-a", teamId: "team-b" },
      ),
    ).toBe(false);
  });
});
