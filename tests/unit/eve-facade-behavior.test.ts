import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function generatedSecurityFiles() {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "eve-facade-behavior",
      runtime: "bun",
      version: "0.1.0",
      mode: "single",
      framework: "nextjs",
      database: "postgres",
      billing: [],
      features: [],
      apps: ["web"],
      preset: "custom",
      auth: true,
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
    }),
    { dryRun: true },
  );
}

function content(files: ReturnType<typeof generatedSecurityFiles>, path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing ${path}`);
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function facadeHarness() {
  const files = generatedSecurityFiles();
  const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-facade-"));
  roots.push(root);
  writeFileSync(join(root, "policy.ts"), content(files, "src/server/eve/policy.ts"));
  writeFileSync(
    join(root, "facade.ts"),
    content(files, "src/server/eve/facade.ts")
      .replace('import "server-only";\n', "")
      .replace('from "@/server/services/eve"', 'from "./ownership"'),
  );
  writeFileSync(
    join(root, "actor.ts"),
    `export interface AuthenticatedEveActor {
  authSessionId: string; email: string; organizationId: string | null;
  emailVerified: boolean; role: string; teamId: string | null; userId: string;
}
export async function resolveAuthenticatedEveActor(headers: Headers): Promise<AuthenticatedEveActor | null> {
  const userId = headers.get("x-test-user");
  if (!userId) return null;
  return {
    authSessionId: headers.get("x-test-auth-session") ?? "auth-" + userId,
    email: userId + "@example.com",
    emailVerified: headers.get("x-test-verified") !== "false",
    organizationId: headers.get("x-test-org") ?? "org-a",
    role: "user",
    teamId: headers.get("x-test-team") ?? "team-a",
    userId,
  };
}
`,
  );
  writeFileSync(
    join(root, "ownership.ts"),
    `export interface AgentSessionActor { authSessionId: string; emailVerified: boolean; organizationId: string | null; teamId: string | null; userId: string }
export type AgentAdmissionDecision =
  | { ok: true; leaseId: string; plan: "pro" | "sponsored" }
  | { ok: false; code: "EVE_ENTITLEMENT_UNSUPPORTED" | "EVE_ENTITLEMENT_REQUIRED" | "EVE_RATE_LIMITED" | "EVE_CONCURRENCY_LIMIT"; retryAfterSeconds?: number };
export function isPaidAgentOperation(value: string): value is "create" | "follow" | "compact" {
  return value === "create" || value === "follow" || value === "compact";
}
export function isValidEveSessionId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
}
`,
  );
  writeFileSync(
    join(root, "ownership-adapter.ts"),
    `export const ownershipRecords = new Map<string, { userId: string; organizationId: string | null; teamId: string | null; retired: boolean }>();
export let forceConflict = false;
export function setForceConflict(value: boolean): void { forceConflict = value; }
export const agentSessionOwnershipPort = {
  async claim(input: { eveSessionId: string; actor: { userId: string; organizationId: string | null; teamId: string | null } }) {
    if (forceConflict) return "conflict" as const;
    const existing = ownershipRecords.get(input.eveSessionId);
    if (existing) return existing.userId === input.actor.userId && existing.organizationId === input.actor.organizationId && existing.teamId === input.actor.teamId ? "existing" as const : "conflict" as const;
    ownershipRecords.set(input.eveSessionId, { userId: input.actor.userId, organizationId: input.actor.organizationId, teamId: input.actor.teamId, retired: false });
    return "created" as const;
  },
  async authorize(input: { eveSessionId: string; actor: { userId: string; organizationId: string | null; teamId: string | null } }) {
    const value = ownershipRecords.get(input.eveSessionId);
    return !!value && !value.retired && value.userId === input.actor.userId && value.organizationId === input.actor.organizationId && value.teamId === input.actor.teamId;
  },
  async retire(input: { eveSessionId: string; actor: { userId: string; organizationId: string | null; teamId: string | null } }) {
    const value = ownershipRecords.get(input.eveSessionId);
    if (!value || value.retired || value.userId !== input.actor.userId || value.organizationId !== input.actor.organizationId || value.teamId !== input.actor.teamId) return false;
    value.retired = true;
    return true;
  },
};
`,
  );
  writeFileSync(
    join(root, "admission-adapter.ts"),
    `type Decision =
  | { ok: true; leaseId: string; plan: "pro" | "sponsored" }
  | { ok: false; code: "EVE_ENTITLEMENT_UNSUPPORTED" | "EVE_ENTITLEMENT_REQUIRED" | "EVE_RATE_LIMITED" | "EVE_CONCURRENCY_LIMIT"; retryAfterSeconds?: number };
export const events: string[] = [];
let sequence = 0;
let nextDecision: Decision | null = null;
const leases = new Map<string, { active: boolean; createdAt: number; eveSessionId?: string; userId: string }>();
export function setNextDecision(value: Decision | null): void { nextDecision = value; }
export function activeAdmissions(): number { return [...leases.values()].filter((lease) => lease.active).length; }
export const agentAdmissionPort = {
  async admit(input: { actor: { userId: string }; eveSessionId?: string; operation: string }): Promise<Decision> {
    events.push("admit:" + input.actor.userId + ":" + input.operation);
    if (nextDecision) { const decision = nextDecision; nextDecision = null; return decision; }
    if ([...leases.values()].some((lease) => lease.active && lease.userId === input.actor.userId)) return { ok: false, code: "EVE_CONCURRENCY_LIMIT", retryAfterSeconds: 5 };
    sequence += 1;
    const leaseId = "lease-" + sequence;
    leases.set(leaseId, { active: true, createdAt: Date.now(), eveSessionId: input.eveSessionId, userId: input.actor.userId });
    return { ok: true, leaseId, plan: "pro" };
  },
  async bindSession(input: { actor: { userId: string }; eveSessionId: string; leaseId: string }): Promise<void> {
    const lease = leases.get(input.leaseId);
    if (!lease || !lease.active || lease.userId !== input.actor.userId) throw new Error("invalid lease");
    lease.eveSessionId = input.eveSessionId;
    events.push("bind:" + input.eveSessionId);
  },
  async touchSession(input: { actor: { userId: string }; eveSessionId: string }): Promise<void> {
    events.push("touch:" + input.actor.userId + ":" + input.eveSessionId);
  },
  async release(input: { actor: { userId: string }; leaseId: string }): Promise<void> {
    events.push("release:" + input.actor.userId + ":" + input.leaseId);
    const lease = leases.get(input.leaseId);
    if (lease?.userId === input.actor.userId) lease.active = false;
  },
  async releaseSession(input: { actor: { userId: string }; eveSessionId: string; leaseId?: string }): Promise<boolean> {
    let released = false;
    for (const lease of leases.values()) {
      if (lease.active && lease.userId === input.actor.userId && lease.eveSessionId === input.eveSessionId) {
        lease.active = false;
        released = true;
      }
    }
    events.push("release-session:" + input.eveSessionId + ":" + String(released));
    return released;
  },
};
`,
  );
  writeFileSync(
    join(root, "admission-reconcile.ts"),
    `export async function reconcileExpiredEveAdmissions(): Promise<void> {}
`,
  );
  writeFileSync(
    join(root, "admission-stream.ts"),
    content(files, "src/server/eve/admission-stream.ts")
      .replace('import "server-only";\n', "")
      .replace(
        "const ADMISSION_TOUCH_INTERVAL_MS = 60_000;",
        "const ADMISSION_TOUCH_INTERVAL_MS = 5;",
      )
      .replace('from "@/server/services/eve"', 'from "./ownership"'),
  );
  const nonce = crypto.randomUUID();
  const facade = await import(`${pathToFileURL(join(root, "facade.ts")).href}?run=${nonce}`);
  const ownership = await import(pathToFileURL(join(root, "ownership-adapter.ts")).href);
  const admission = await import(pathToFileURL(join(root, "admission-adapter.ts")).href);
  return { admission, facade, ownership };
}

function browserRequest(
  path: string,
  userId: string,
  init: {
    method?: "GET" | "POST";
    origin?: string;
    body?: string;
    contentLength?: string;
    teamId?: string | null;
    verified?: boolean;
    authSessionId?: string;
  } = {},
): Request {
  const origin = init.origin ?? "https://app.example.com";
  const method = init.method ?? "POST";
  const headers = new Headers({
    Cookie: "better-auth.session_token=opaque",
    "Sec-Fetch-Site": origin === "https://app.example.com" ? "same-origin" : "cross-site",
    "X-Test-User": userId,
    "X-Test-Verified": init.verified === false ? "false" : "true",
  });
  if (init.teamId !== null) headers.set("X-Test-Team", init.teamId ?? "team-a");
  if (init.authSessionId) headers.set("X-Test-Auth-Session", init.authSessionId);
  if (method === "POST") {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", origin);
  }
  if (init.contentLength) headers.set("Content-Length", init.contentLength);
  return new Request("https://app.example.com" + path, {
    method,
    headers,
    ...(method === "POST" ? { body: init.body ?? JSON.stringify({ message: "hello" }) } : {}),
  });
}

describe("generated Eve facade behavior", () => {
  test("claims before disclosure, enforces owner/tenant, strips credentials, and retires reset", async () => {
    const { admission, facade, ownership } = await facadeHarness();
    const previousFetch = globalThis.fetch;
    const previousAuthURL = process.env.BETTER_AUTH_URL;
    const previousSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.EVE_INTERNAL_AUTH_SECRET = "x".repeat(48);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const options = init ?? {};
      calls.push({ url, init: options });
      if (url.endsWith("/eve/v1/session")) {
        return Response.json(
          { ok: true, sessionId: "wrun_created", status: "accepted" },
          { status: 202, headers: { "x-eve-session-id": "wrun_created" } },
        );
      }
      if (url.endsWith("/stream")) {
        const terminalEvent = JSON.stringify({
          type: "session.waiting",
          meta: { at: new Date(Date.now() + 1_000).toISOString() },
        });
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode(terminalEvent));
                controller.close();
              }, 25);
            },
          }),
          { status: 202, headers: { "content-type": "application/x-ndjson" } },
        );
      }
      return Response.json({ ok: true, status: "accepted" }, { status: 202 });
    }) as typeof fetch;

    try {
      const created = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      expect(created.status).toBe(202);
      expect(ownership.ownershipRecords.get("wrun_created")).toEqual({
        userId: "alice",
        organizationId: "org-a",
        teamId: "team-a",
        retired: false,
      });

      const createHeaders = new Headers(calls[0]?.init.headers);
      expect(createHeaders.has("cookie")).toBe(false);
      expect(createHeaders.get("authorization")).toStartWith("Basic ");
      const createBody = JSON.parse(String(calls[0]?.init.body));
      expect(createBody.forwardedPrincipal.current.principalId).toBe("alice");
      expect(createBody.forwardedPrincipal.initiator.principalId).toBe("alice");
      expect(createBody.forwardedPrincipal.current.attributes.authSessionId).toBeUndefined();

      const settled = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created/stream", "alice", {
          method: "GET",
        }),
      );
      expect(settled.status).toBe(202);
      await settled.text();
      // Reading the browser stream is presentation only. The Eve hook/callback
      // owns admission lifecycle, so disconnecting or consuming this response
      // cannot release the server-side lease.
      expect(admission.activeAdmissions()).toBe(1);
      expect(admission.events).not.toContain("touch:alice:wrun_created");
      await admission.agentAdmissionPort.releaseSession({
        actor: { userId: "alice" },
        eveSessionId: "wrun_created",
      });

      const callsBeforeBob = calls.length;
      const bob = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created", "bob"),
      );
      expect(bob.status).toBe(404);
      expect(calls.length).toBe(callsBeforeBob);

      const otherTeam = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created", "alice", {
          teamId: "team-b",
        }),
      );
      expect(otherTeam.status).toBe(404);
      expect(calls.length).toBe(callsBeforeBob);

      const alice = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created", "alice", {
          authSessionId: "auth-alice-reconnected",
        }),
      );
      expect(alice.status).toBe(202);
      const followBody = JSON.parse(String(calls.at(-1)?.init.body));
      expect(followBody.forwardedPrincipal.current.principalId).toBe("alice");
      expect(followBody.forwardedPrincipal.initiator).toBeUndefined();

      const reset = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created/reset", "alice", { body: "{}" }),
      );
      expect(reset.status).toBe(202);
      expect(ownership.ownershipRecords.get("wrun_created")?.retired).toBe(true);

      const stream = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_created/stream", "alice", {
          method: "GET",
        }),
      );
      expect(stream.status).toBe(404);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAuthURL === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousAuthURL;
      if (previousSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
      else process.env.EVE_INTERNAL_AUTH_SECRET = previousSecret;
    }
  });

  test("blocks foreign origins and withholds conflicting or oversized creates", async () => {
    const { facade, ownership } = await facadeHarness();
    const previousFetch = globalThis.fetch;
    const previousAuthURL = process.env.BETTER_AUTH_URL;
    const previousSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
    const calls: string[] = [];
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.EVE_INTERNAL_AUTH_SECRET = "y".repeat(48);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return Response.json(
        { ok: true, sessionId: "wrun_conflict", status: "accepted" },
        { status: 202, headers: { "x-eve-session-id": "wrun_conflict" } },
      );
    }) as typeof fetch;

    try {
      const foreign = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice", {
          origin: "https://evil.example",
        }),
      );
      expect(foreign.status).toBe(403);
      expect(calls).toHaveLength(0);

      const oversized = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice", {
          contentLength: String(26 * 1024 * 1024),
        }),
      );
      expect(oversized.status).toBe(413);
      expect(calls).toHaveLength(0);

      ownership.setForceConflict(true);
      const conflicted = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      expect(conflicted.status).toBe(409);
      expect(await conflicted.text()).not.toContain("wrun_conflict");
      expect(calls.some((url) => url.endsWith("/eve/v1/session/wrun_conflict/reset"))).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAuthURL === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousAuthURL;
      if (previousSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
      else process.env.EVE_INTERNAL_AUTH_SECRET = previousSecret;
    }
  });

  test("rejects unverified/unentitled actors and admits one paid operation before reading or forwarding", async () => {
    const { admission, facade } = await facadeHarness();
    const previousFetch = globalThis.fetch;
    const previousAuthURL = process.env.BETTER_AUTH_URL;
    const previousSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
    const fetchStarted = deferred<void>();
    const finishFirstFetch = deferred<void>();
    let calls = 0;
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.EVE_INTERNAL_AUTH_SECRET = "z".repeat(48);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (calls === 1 && url.endsWith("/eve/v1/session")) {
        fetchStarted.resolve();
        await finishFirstFetch.promise;
        return Response.json(
          { ok: true, sessionId: "wrun_admitted", status: "accepted" },
          { status: 202, headers: { "x-eve-session-id": "wrun_admitted" } },
        );
      }
      if (url.endsWith("/stream")) {
        const oldBoundary = JSON.stringify({
          type: "session.waiting",
          meta: { at: "2000-01-01T00:00:00.000Z" },
        });
        const currentBoundary = JSON.stringify({
          type: "session.waiting",
          meta: { at: new Date(Date.now() + 1_000).toISOString() },
        });
        return new Response(`${oldBoundary}\n${currentBoundary}\n`, {
          status: 202,
          headers: { "content-type": "application/x-ndjson" },
        });
      }
      return Response.json({ ok: true, status: "accepted" }, { status: 202 });
    }) as typeof fetch;

    try {
      const unverified = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice", { verified: false }),
      );
      expect(unverified.status).toBe(403);
      expect((await unverified.json()).code).toBe("email_verification_required");
      expect(admission.events).toHaveLength(0);
      expect(calls).toBe(0);

      admission.setNextDecision({ ok: false, code: "EVE_ENTITLEMENT_UNSUPPORTED" });
      const unsupported = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      expect(unsupported.status).toBe(501);
      expect((await unsupported.json()).code).toBe("eve_entitlement_unsupported");
      expect(calls).toBe(0);

      admission.setNextDecision({
        ok: false,
        code: "EVE_RATE_LIMITED",
        retryAfterSeconds: 60,
      });
      const limited = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("60");
      expect(calls).toBe(0);

      const first = facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      await fetchStarted.promise;
      const concurrent = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session", "alice"),
      );
      expect(concurrent.status).toBe(429);
      expect((await concurrent.json()).code).toBe("eve_concurrency_limited");
      expect(calls).toBe(1);
      finishFirstFetch.resolve();
      expect((await first).status).toBe(202);
      expect(admission.activeAdmissions()).toBe(1);

      const paidAdmissions = admission.events.filter((event: string) =>
        event.startsWith("admit:"),
      ).length;
      const stream = await facade.handleEveFacadeRequest(
        browserRequest("/api/agent/eve/v1/session/wrun_admitted/stream", "alice", {
          method: "GET",
        }),
      );
      expect(stream.status).toBe(202);
      await stream.text();
      expect(admission.activeAdmissions()).toBe(1);
      expect(admission.events).not.toContain("release-session:wrun_admitted:false");
      expect(admission.events).not.toContain("release-session:wrun_admitted:true");
      expect(admission.events.filter((event: string) => event.startsWith("admit:")).length).toBe(
        paidAdmissions,
      );
    } finally {
      finishFirstFetch.resolve();
      globalThis.fetch = previousFetch;
      if (previousAuthURL === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousAuthURL;
      if (previousSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
      else process.env.EVE_INTERNAL_AUTH_SECRET = previousSecret;
    }
  });
});
