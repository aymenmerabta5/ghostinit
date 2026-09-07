import { afterAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
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

function generatedFiles(
  options: {
    apps?: Array<"desktop" | "mobile" | "web">;
    framework?: "nextjs" | "tanstack-start";
    mode?: "monorepo" | "single";
  } = {},
) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "eve-durable-lifecycle",
      runtime: "bun",
      version: "0.1.0",
      mode: options.mode ?? "single",
      framework: options.framework ?? "nextjs",
      database: "postgres",
      billing: [],
      features: [],
      apps: options.apps ?? ["web"],
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

function source(path: string): string {
  const value = generatedFiles().find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file ${path}`);
  return value;
}

function sourceFrom(files: ReturnType<typeof generatedFiles>, path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file ${path}`);
  return value;
}

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function signature(body: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
}

describe("Eve server-authoritative admission lifecycle", () => {
  test("mounts the same private facade, callback, hook, and web client in both TanStack modes", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generatedFiles({ framework: "tanstack-start", mode });
      const root = mode === "monorepo" ? "apps/web/src" : "src";
      const hookPath =
        mode === "monorepo"
          ? "apps/eve/agent/hooks/admission-lifecycle.ts"
          : "agent/hooks/admission-lifecycle.ts";
      const facadeRoute = sourceFrom(files, `${root}/routes/api/agent/$.ts`);
      const callbackRoute = sourceFrom(files, `${root}/routes/api/agent/internal/eve-lifecycle.ts`);
      expect(facadeRoute).toContain('createFileRoute("/api/agent/$")');
      expect(facadeRoute).toContain("createServerOnlyFn");
      expect(callbackRoute).toContain('createFileRoute("/api/agent/internal/eve-lifecycle")');
      expect(`${facadeRoute}\n${callbackRoute}`).not.toContain('from "next/');
      expect(sourceFrom(files, `${root}/routes/agent.tsx`)).toContain(
        'useEveAgent({ host: "/api/agent" })',
      );
      expect(sourceFrom(files, ".env.local")).toContain(
        "EVE_NEXT_PRODUCTION_ORIGIN=http://127.0.0.1:4274",
      );
      const manifestPath = mode === "monorepo" ? "apps/eve/package.json" : "package.json";
      const manifest = JSON.parse(sourceFrom(files, manifestPath)) as {
        scripts: Record<string, string>;
      };
      expect(manifest.scripts[mode === "monorepo" ? "dev:diagnostic" : "eve:dev"]).toBe(
        mode === "monorepo" ? "node ../../scripts/eve-dev.mjs" : "node scripts/eve-dev.mjs",
      );
      expect(manifest.scripts[mode === "monorepo" ? "start:diagnostic" : "eve:start"]).toBe(
        mode === "monorepo" ? "node .output/server/index.mjs" : "bun scripts/eve-command.mjs start",
      );
      const rootManifest = JSON.parse(sourceFrom(files, "package.json")) as {
        scripts: Record<string, string>;
      };
      expect(rootManifest.scripts["start:production"]).toBe("bun scripts/start-production.mjs");
      expect(sourceFrom(files, "scripts/start-production.mjs")).toContain(
        'const EVE_PROCESS_SCRIPT = "start:eve"',
      );
      expect(sourceFrom(files, hookPath)).toContain('async "*"(event, ctx)');
      const facadePath =
        mode === "monorepo" ? "packages/api/src/eve/facade.ts" : "src/server/eve/facade.ts";
      expect(sourceFrom(files, facadePath)).not.toContain("monitorEveAdmissionStream");
      expect(sourceFrom(files, `${root}/server/http/eve.server.ts`)).toContain(
        "handleEveLifecycleCallback",
      );
    }

    const nativeFiles = generatedFiles({
      apps: ["web", "mobile", "desktop"],
      framework: "tanstack-start",
      mode: "monorepo",
    });
    for (const path of [
      "apps/mobile/src/lib/eve-protocol.ts",
      "apps/desktop/src/renderer/lib/eve-protocol.ts",
    ]) {
      const client = sourceFrom(nativeFiles, path);
      expect(client).toContain('"/api/agent/eve/v1/session"');
      expect(client).not.toContain("EVE_INTERNAL_AUTH_SECRET");
    }
  });

  test("accepts only fresh HMAC callbacks and derives lifecycle input without caller identity", async () => {
    const root = temporaryRoot("ghostinit-eve-callback-");
    writeFileSync(
      join(root, "lifecycle-callback.ts"),
      source("src/server/eve/lifecycle-callback.ts")
        .replace('import "server-only";\n', "")
        .replace('from "@/server/services/eve"', 'from "./service"'),
    );
    writeFileSync(
      join(root, "service.ts"),
      `const session = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
export const isValidEveSessionId = (value: string) => session.test(value);
export const isValidEveRuntimeEventId = (value: string) => /^evt_[A-Za-z0-9_-]{8,80}$/.test(value);
export const isValidEveRuntimeEventType = (value: string) => /^[a-z][a-z0-9.]{0,63}$/.test(value);
export const isValidEveAdmissionLeaseId = (value: string) => session.test(value);
`,
    );
    writeFileSync(
      join(root, "admission-adapter.ts"),
      `export const recorded: unknown[] = [];
export const agentAdmissionPort = {
  async recordRuntimeEvent(value: unknown) { recorded.push(value); },
};
`,
    );
    const nonce = crypto.randomUUID();
    const callback = (await import(
      `${pathToFileURL(join(root, "lifecycle-callback.ts")).href}?run=${nonce}`
    )) as { handleEveLifecycleCallback(request: Request): Promise<Response> };
    const adapter = (await import(pathToFileURL(join(root, "admission-adapter.ts")).href)) as {
      recorded: Array<Record<string, unknown>>;
    };
    const previousSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
    const secret = "l".repeat(48);
    process.env.EVE_INTERNAL_AUTH_SECRET = secret;
    try {
      const body = JSON.stringify({
        eventAt: new Date().toISOString(),
        eventId: "evt_01JABCDEFGHIJKLMNPQRSTUVWX",
        eventType: "session.waiting",
        eveSessionId: "wrun_authoritative",
        leaseId: "lease_authoritative",
        userId: "mallory-is-untrusted",
      });
      const unsigned = await callback.handleEveLifecycleCallback(
        new Request("https://app.example.com/api/agent/internal/eve-lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
      );
      expect(unsigned.status).toBe(401);
      expect(adapter.recorded).toHaveLength(0);

      const timestamp = String(Date.now());
      const accepted = await callback.handleEveLifecycleCallback(
        new Request("https://app.example.com/api/agent/internal/eve-lifecycle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GhostInit-Eve-Signature": signature(body, timestamp, secret),
            "X-GhostInit-Eve-Timestamp": timestamp,
          },
          body,
        }),
      );
      expect(accepted.status).toBe(204);
      expect(adapter.recorded).toHaveLength(1);
      expect(adapter.recorded[0]).toMatchObject({
        eventId: "evt_01JABCDEFGHIJKLMNPQRSTUVWX",
        eventType: "session.waiting",
        eveSessionId: "wrun_authoritative",
        leaseId: "lease_authoritative",
      });
      expect(adapter.recorded[0]).not.toHaveProperty("userId");

      const staleTimestamp = String(Date.now() - 10 * 60_000);
      const stale = await callback.handleEveLifecycleCallback(
        new Request("https://app.example.com/api/agent/internal/eve-lifecycle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GhostInit-Eve-Signature": signature(body, staleTimestamp, secret),
            "X-GhostInit-Eve-Timestamp": staleTimestamp,
          },
          body,
        }),
      );
      expect(stale.status).toBe(401);
      expect(adapter.recorded).toHaveLength(1);
    } finally {
      if (previousSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
      else process.env.EVE_INTERNAL_AUTH_SECRET = previousSecret;
    }
  });

  test("authored Eve hook signs durable events without any browser stream", async () => {
    const root = temporaryRoot("ghostinit-eve-hook-");
    writeFileSync(
      join(root, "hook.ts"),
      source("agent/hooks/admission-lifecycle.ts").replace(
        'import { defineHook } from "eve/hooks";',
        "const defineHook = <T>(definition: T): T => definition;",
      ),
    );
    const hook = (
      await import(`${pathToFileURL(join(root, "hook.ts")).href}?run=${crypto.randomUUID()}`)
    ).default as {
      events: {
        "*"(event: unknown, ctx: unknown): Promise<void>;
      };
    };
    const previousFetch = globalThis.fetch;
    const previousAuthUrl = process.env.BETTER_AUTH_URL;
    const previousSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
    const secret = "h".repeat(48);
    const requests: Request[] = [];
    process.env.BETTER_AUTH_URL = "https://app.example.com";
    process.env.EVE_INTERNAL_AUTH_SECRET = secret;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const ctx = {
      session: {
        id: "wrun_hook",
        auth: {
          current: { attributes: { eveAdmissionLeaseId: "lease_hook" } },
          initiator: null,
        },
      },
    };
    try {
      await hook.events["*"](
        {
          type: "session.started",
          meta: { id: "evt_01JHOOKSTARTABCDEFGHIJKLMN", at: new Date().toISOString() },
        },
        ctx,
      );
      await hook.events["*"](
        {
          type: "message.appended",
          meta: { id: "evt_01JHOOKDELTAABCDEFGHIJKLMN", at: new Date().toISOString() },
        },
        ctx,
      );
      await hook.events["*"](
        {
          type: "session.waiting",
          meta: { id: "evt_01JHOOKWAIT_ABCDEFGHIJKLMN", at: new Date().toISOString() },
        },
        ctx,
      );
      await hook.events["*"](
        {
          type: "compaction.requested",
          meta: { id: "evt_01JHOOKCOMPACTABCDEFGHIJ", at: new Date().toISOString() },
        },
        ctx,
      );
      await hook.events["*"](
        {
          type: "session.waiting",
          meta: { id: "evt_01JHOOKCOMPACTWAITABCDE", at: new Date().toISOString() },
        },
        ctx,
      );

      expect(requests).toHaveLength(4);
      const first = requests[0]!;
      expect(first.url).toBe("https://app.example.com/api/agent/internal/eve-lifecycle");
      const body = await first.text();
      const timestamp = first.headers.get("x-ghostinit-eve-timestamp") ?? "";
      expect(first.headers.get("x-ghostinit-eve-signature")).toBe(
        signature(body, timestamp, secret),
      );
      expect(JSON.parse(body)).toMatchObject({
        eventType: "session.started",
        eveSessionId: "wrun_hook",
        leaseId: "lease_hook",
      });
      expect(JSON.parse(await requests[1]!.text()).eventType).toBe("session.waiting");
      const compactRequested = JSON.parse(await requests[2]!.text()) as Record<string, unknown>;
      const compactWaiting = JSON.parse(await requests[3]!.text()) as Record<string, unknown>;
      expect(compactRequested.eventType).toBe("compaction.requested");
      expect(compactRequested).not.toHaveProperty("leaseId");
      expect(compactWaiting.eventType).toBe("session.waiting");
      expect(compactWaiting).not.toHaveProperty("leaseId");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousAuthUrl;
      if (previousSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
      else process.env.EVE_INTERNAL_AUTH_SECRET = previousSecret;
    }
  });

  test("expired bound leases require an authenticated durable-tail proof before release", async () => {
    const root = temporaryRoot("ghostinit-eve-reconcile-");
    writeFileSync(
      join(root, "admission-reconcile.ts"),
      source("src/server/eve/admission-reconcile.ts")
        .replace('import "server-only";\n', "")
        .replace('from "@/server/services/eve"', 'from "./types"'),
    );
    writeFileSync(join(root, "types.ts"), "export {};\n");
    writeFileSync(
      join(root, "admission-stream.ts"),
      `export interface TerminalEveEvent { eventAt: Date; eventId: string | null; eventType: string }
export function terminalEveEvent(line: string): TerminalEveEvent | null {
  const value = JSON.parse(line) as { type?: string; meta?: { at?: string; id?: string } };
  return ["session.waiting", "session.failed", "session.completed"].includes(value.type ?? "")
    ? { eventAt: new Date(value.meta?.at ?? ""), eventId: value.meta?.id ?? null, eventType: value.type! }
    : null;
}
`,
    );
    const reconciler = (await import(
      `${pathToFileURL(join(root, "admission-reconcile.ts")).href}?run=${crypto.randomUUID()}`
    )) as {
      reconcileExpiredEveAdmissions(input: Record<string, unknown>): Promise<void>;
    };
    const previousFetch = globalThis.fetch;
    const events: string[] = [];
    const admission = {
      async listExpiredBoundSessions() {
        return [{ eveSessionId: "wrun_stale", leaseId: "lease_stale" }];
      },
      async releaseSession(input: { leaseId?: string }) {
        expect(input.leaseId).toBe("lease_stale");
        events.push("release");
        return true;
      },
      async recordRuntimeEvent() {
        events.push("record");
      },
      async touchSession() {
        events.push("touch");
      },
    };
    const actor = {
      authSessionId: "auth-alice",
      emailVerified: true,
      organizationId: "org-a",
      teamId: "team-a",
      userId: "alice",
    };
    try {
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("authorization")).toStartWith("Basic ");
        return new Response(
          JSON.stringify({
            type: "step.started",
            meta: { at: "2030-01-01T00:00:00.000Z" },
          }) + "\n",
          { status: 200 },
        );
      }) as typeof fetch;
      await reconciler.reconcileExpiredEveAdmissions({
        actor,
        admission,
        origin: "https://app.example.com",
        secret: "r".repeat(48),
      });
      expect(events).toEqual(["touch"]);

      events.length = 0;
      globalThis.fetch = (async () => {
        throw new Error("runtime offline");
      }) as typeof fetch;
      await reconciler.reconcileExpiredEveAdmissions({
        actor,
        admission,
        origin: "https://app.example.com",
        secret: "r".repeat(48),
      });
      expect(events).toEqual(["touch"]);

      events.length = 0;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            type: "session.waiting",
            meta: {
              at: "2030-01-01T00:00:00.000Z",
              id: "evt_01JRECONCILEABCDEFGHIJKLM",
            },
          }) + "\n",
          { status: 200 },
        )) as typeof fetch;
      await reconciler.reconcileExpiredEveAdmissions({
        actor,
        admission,
        origin: "https://app.example.com",
        secret: "r".repeat(48),
      });
      expect(events).toEqual(["record", "release"]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
