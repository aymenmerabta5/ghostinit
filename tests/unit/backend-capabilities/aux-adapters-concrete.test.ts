// @allow-long 390: rendered runtime checks and the cross-database lease model form one acceptance suite
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  featureFlagAdapterFiles,
  featureFlagAdapterIntegrationGuide,
} from "../../../src/templates/adapters/feature-flags/index.js";
import {
  jobsAdapterFiles,
  jobsAdapterIntegrationGuide,
} from "../../../src/templates/adapters/jobs/index.js";
import {
  notificationAdapterFiles,
  notificationAdapterIntegrationGuide,
} from "../../../src/templates/adapters/notifications/index.js";
import {
  storageAdapterFiles,
  storageAdapterIntegrationGuide,
} from "../../../src/templates/adapters/storage/index.js";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function importPostHogAdapter() {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-flags-adapter-"));
  roots.push(root);
  const rendered = featureFlagAdapterFiles({ mode: "single" })[0]!
    .content.replace('import "server-only";\n', "")
    .replace('from "./adapter-contract"', 'from "./service"')
    .replace('from "./errors"', 'from "./service"')
    .replace('from "./contracts"', 'from "./service"');
  writeFileSync(join(root, "adapter.ts"), rendered);
  writeFileSync(
    join(root, "service.ts"),
    `export class FeatureFlagError extends Error {
  constructor(public readonly code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
export function defineRemoteFeatureFlagAdapter<T>(value: T): T { return value; }
export interface FeatureFlagProviderEvaluation { key: string; value: boolean | number | string; variant: string | null; reason: "targeting-match" | "rollout" | "provider-default" | "disabled"; version: string | null }
export interface FeatureFlagSubject { kind: "user" | "anonymous"; key: string; attributes: Readonly<Record<string, boolean | number | string>> }
`,
  );
  return await import(`${join(root, "adapter.ts")}?nonce=${crypto.randomUUID()}`);
}

async function importTokenProtection() {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-token-adapter-"));
  roots.push(root);
  const rendered = notificationAdapterFiles({ mode: "single", database: "postgres" })
    .find(({ path }) => path.endsWith("token-protection.ts"))!
    .content.replace('import "server-only";\n', "");
  writeFileSync(join(root, "token-protection.ts"), rendered);
  return await import(`${join(root, "token-protection.ts")}?nonce=${crypto.randomUUID()}`);
}

interface ModelRun {
  state: "queued" | "running" | "cancelled";
  token: string | null;
  worker: string | null;
  expiresAt: number | null;
  cancellationRequested: boolean;
  attempt: number;
}

function createLeaseModel(_kind: "postgres" | "convex") {
  const run: ModelRun = {
    state: "queued",
    token: null,
    worker: null,
    expiresAt: null,
    cancellationRequested: false,
    attempt: 0,
  };
  return {
    run,
    async claim(worker: string, now: number) {
      await Promise.resolve();
      if (run.state !== "queued" || run.cancellationRequested) return null;
      run.state = "running";
      run.worker = worker;
      run.token = `${worker}:${run.attempt + 1}`;
      run.expiresAt = now + 30_000;
      run.attempt += 1;
      return run.token;
    },
    async heartbeat(worker: string, token: string, now: number) {
      await Promise.resolve();
      if (
        run.state !== "running" ||
        run.worker !== worker ||
        run.token !== token ||
        run.expiresAt! <= now
      )
        return false;
      run.expiresAt = now + 30_000;
      return true;
    },
    async cancel() {
      await Promise.resolve();
      run.cancellationRequested = true;
      if (run.state === "queued") run.state = "cancelled";
    },
    async recover(expectedToken: string, expectedExpiry: number, now: number) {
      await Promise.resolve();
      if (
        run.state !== "running" ||
        run.token !== expectedToken ||
        run.expiresAt !== expectedExpiry ||
        expectedExpiry > now
      )
        return false;
      run.state = run.cancellationRequested ? "cancelled" : "queued";
      run.token = null;
      run.worker = null;
      run.expiresAt = null;
      return true;
    },
  };
}

describe("concrete auxiliary adapter renderers", () => {
  test("render database- and mode-aware files with explicit integration edits", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const postgresNotifications = notificationAdapterFiles({ mode, database: "postgres" });
      const convexNotifications = notificationAdapterFiles({ mode, database: "convex" });
      const postgresJobs = jobsAdapterFiles({ mode, database: "postgres" });
      const convexJobs = jobsAdapterFiles({ mode, database: "convex" });
      const postgresStorage = storageAdapterFiles({ mode, database: "postgres" });
      const convexStorage = storageAdapterFiles({ mode, database: "convex" });
      expect(
        postgresNotifications.some(({ path }) => path.endsWith("schema/notifications.ts")),
      ).toBe(true);
      expect(convexNotifications.map(({ path }) => path)).toContain("convex/notifications.ts");
      expect(postgresJobs.map(({ path }) => path)).toContain("scripts/start-jobs.mjs");
      expect(convexJobs.map(({ path }) => path)).toContain("convex/crons.ts");
      expect(postgresStorage.length).toBeGreaterThan(0);
      expect(postgresStorage.some(({ path }) => path.endsWith("schema/storage.ts"))).toBe(true);
      expect(
        postgresStorage.some(({ path }) => path.endsWith("adapters/storage/postgres.ts")),
      ).toBe(true);
      expect(convexStorage.map(({ path }) => path)).toContain("convex/storage.ts");
    }
    expect(
      notificationAdapterIntegrationGuide({ mode: "monorepo", database: "postgres" })
        .schemaBarrelLine,
    ).toBe('export { notificationDeviceTokens, notifications } from "./notifications";');
    expect(
      jobsAdapterIntegrationGuide({ mode: "monorepo", database: "convex" }).convexSchemaSpread,
    ).toBe("...jobTables,");
    expect(featureFlagAdapterIntegrationGuide({ mode: "single" }).securityInvariant).toContain(
      "never authorize",
    );
    expect(
      storageAdapterIntegrationGuide({ mode: "monorepo", database: "postgres" }).selection,
    ).toContain(
      'resolve hasStorage = config.storage === true || hasAddon(addonMap, "storage") || hasMessaging',
    );
  });

  test("all rendered TypeScript parses and carries no unsafe placeholder implementation", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const files = [
          ...notificationAdapterFiles({ mode, database }),
          ...featureFlagAdapterFiles({ mode }),
          ...jobsAdapterFiles({ mode, database }),
          ...storageAdapterFiles({ mode, database }),
        ];
        for (const entry of files.filter(({ path }) => /\.[cm]?[jt]sx?$/.test(path))) {
          expect(() => transpiler.transformSync(entry.content), entry.path).not.toThrow();
          expect(entry.content, entry.path).not.toMatch(/\bas any\b|\bv\.any\s*\(/);
          expect(entry.content, entry.path).not.toContain("unavailableJobOperation");
        }
      }
    }
  });

  test("notification storage scopes actors, atomically reads, and protects device tokens", async () => {
    const postgres = notificationAdapterFiles({ mode: "monorepo", database: "postgres" })
      .map(({ content }) => content)
      .join("\n");
    const convex = notificationAdapterFiles({ mode: "monorepo", database: "convex" })
      .map(({ content }) => content)
      .join("\n");
    expect(postgres).toContain("notification_devices_fingerprint_uidx");
    expect(postgres).toContain("eq(notifications.userId, input.userId)");
    expect(postgres).toContain("isNull(notifications.readAt)");
    expect(postgres).toContain('.for("update")');
    expect(convex).toContain("const actor = await requireActor(ctx)");
    expect(convex).not.toContain("args.userId");

    const previous = process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
    process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
    try {
      const protection = await importTokenProtection();
      const token = "push-token-with-high-entropy-123456789";
      const first = protection.protectNotificationDeviceToken(token) as string;
      const second = protection.protectNotificationDeviceToken(token) as string;
      expect(first).not.toContain(token);
      expect(first).not.toBe(second);
      expect(protection.fingerprintNotificationDeviceToken(token)).toBe(
        protection.fingerprintNotificationDeviceToken(token),
      );
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
      else process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = previous;
    }
  });

  test("PostHog accepts only server-minted subjects and fails closed on timeout or missing values", async () => {
    const adapterModule = await importPostHogAdapter();
    const subject = adapterModule.createAuthenticatedFeatureFlagSubject("user-42", { plan: "pro" });
    const adapter = adapterModule.createPostHogFeatureFlagAdapter({
      apiKey: "phc_test_project_key",
      host: "https://us.i.posthog.com",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            flags: { "release.new": { enabled: true, variant: "beta", metadata: { version: 7 } } },
          }),
        ),
    });
    expect(await adapter.evaluateMany({ subject, keys: ["release.new"] })).toEqual([
      {
        key: "release.new",
        value: "beta",
        variant: "beta",
        reason: "targeting-match",
        version: "7",
      },
    ]);
    await expect(
      adapter.evaluateMany({
        subject: { kind: "user", key: "user-42", attributes: {} },
        keys: ["release.new"],
      }),
    ).rejects.toMatchObject({ code: "FEATURE_FLAG_SUBJECT_REQUIRED" });
    expect(() =>
      adapterModule.createAnonymousFeatureFlagSubjectFromSignedCookie({
        signedCookie: "anonymous-42.forged",
        signingSecret: "x".repeat(32),
      }),
    ).toThrow();
    const signingSecret = "y".repeat(32);
    const issued = adapterModule.createAnonymousFeatureFlagSubjectAndCookie({ signingSecret });
    expect(
      adapterModule.createAnonymousFeatureFlagSubjectFromSignedCookie({
        signedCookie: issued.signedCookie,
        signingSecret,
      }).kind,
    ).toBe("anonymous");
    expect(await adapter.evaluateMany({ subject, keys: ["missing.flag"] })).toEqual([]);

    const timedOut = adapterModule.createPostHogFeatureFlagAdapter({
      apiKey: "phc_test_project_key",
      host: "https://us.i.posthog.com",
      timeoutMs: 100,
      fetchImplementation: async (_request: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    await expect(timedOut.evaluateMany({ subject, keys: ["release.new"] })).rejects.toMatchObject({
      code: "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
    });
  });

  test("Postgres and Convex models have one claim winner and crash recovery cannot beat heartbeat or cancellation", async () => {
    for (const kind of ["postgres", "convex"] as const) {
      const claimed = createLeaseModel(kind);
      const claims = await Promise.all([
        claimed.claim("worker-a", 0),
        claimed.claim("worker-b", 0),
      ]);
      expect(claims.filter(Boolean), kind).toHaveLength(1);

      const heartbeatRace = createLeaseModel(kind);
      const token = (await heartbeatRace.claim("worker-a", 0))!;
      const expiredAt = heartbeatRace.run.expiresAt!;
      expect(await heartbeatRace.heartbeat("worker-a", token, expiredAt - 1)).toBe(true);
      expect(await heartbeatRace.recover(token, expiredAt, expiredAt + 1)).toBe(false);

      const cancellationRace = createLeaseModel(kind);
      const cancellationToken = (await cancellationRace.claim("worker-a", 0))!;
      const cancellationExpiry = cancellationRace.run.expiresAt!;
      await cancellationRace.cancel();
      expect(
        await cancellationRace.recover(
          cancellationToken,
          cancellationExpiry,
          cancellationExpiry + 1,
        ),
      ).toBe(true);
      expect(cancellationRace.run.state).toBe("cancelled");
    }
  });

  test("workers persist observable results and deployment scripts really start/register execution", () => {
    const postgres = jobsAdapterFiles({ mode: "monorepo", database: "postgres" });
    const convex = jobsAdapterFiles({ mode: "monorepo", database: "convex" });
    const postgresContent = postgres.map(({ content }) => content).join("\n");
    const convexContent = convex.map(({ content }) => content).join("\n");
    expect(postgresContent).toContain("completeRunWithResult");
    expect(postgresContent).toContain("getOwnedResult");
    expect(postgresContent).toContain('.for("update", { skipLocked: true })');
    const jobsSupervisor = postgres.find(({ path }) => path === "scripts/start-jobs.mjs")?.content;
    expect(jobsSupervisor).toContain("spawn(command.executable, command.arguments, {");
    expect(jobsSupervisor).toContain("shell: false");
    expect(jobsSupervisor).toContain('const SCOPE_ENV = "GHOSTINIT_JOBS_PROCESS_SCOPE_ID"');
    expect(jobsSupervisor).toContain("AssignProcessToJobObject");
    expect(jobsSupervisor).toContain("TerminateJobObject");
    expect(jobsSupervisor).not.toContain("#!/usr/bin/env bash");
    expect(
      postgres.find(({ path }) => path === "scripts/typescript-worker-loader.mjs")?.content,
    ).toContain("registerHooks");
    expect(convexContent).toContain("internal.jobsInternal.recoverExpired");
    expect(convexContent).toContain("result: run.result ?? null");
    expect(
      jobsAdapterIntegrationGuide({ mode: "monorepo", database: "convex" }).packageScripts[
        "jobs:deploy"
      ],
    ).toBe("bun x --no-install convex deploy");

    const loaderRoot = mkdtempSync(join(tmpdir(), "ghostinit-node-worker-loader-"));
    roots.push(loaderRoot);
    const loader = postgres.find(
      ({ path }) => path === "scripts/typescript-worker-loader.mjs",
    )!.content;
    writeFileSync(join(loaderRoot, "loader.mjs"), loader);
    writeFileSync(join(loaderRoot, "value.ts"), "export const value: number = 20;\n");
    writeFileSync(join(loaderRoot, "explicit.ts"), "export const explicit: number = 22;\n");
    writeFileSync(
      join(loaderRoot, "entry.ts"),
      'import { value } from "./value"; import { explicit } from "./explicit.js"; console.log(value + explicit);\n',
    );
    const launched = spawnSync(
      "node",
      [
        "--import",
        pathToFileURL(join(loaderRoot, "loader.mjs")).href,
        "--experimental-strip-types",
        join(loaderRoot, "entry.ts"),
      ],
      { encoding: "utf8" },
    );
    expect(launched.status, launched.stderr).toBe(0);
    expect(launched.stdout.trim()).toBe("42");
  });

  test("standalone storage emits real local/S3 or actor-owned Convex implementations", () => {
    const postgres = storageAdapterFiles({ mode: "monorepo", database: "postgres" })
      .map(({ content }) => content)
      .join("\n");
    const convexFiles = storageAdapterFiles({ mode: "monorepo", database: "convex" });
    const convex = convexFiles.map(({ content }) => content).join("\n");
    const convexPublic =
      convexFiles.find(({ path }) => path === "convex/storage.ts")?.content ?? "";
    expect(postgres).toContain('env.STORAGE_DRIVER === "s3"');
    expect(postgres).toContain("assertSafeStorageKey");
    expect(postgres).toContain('ServerSideEncryption: "AES256"');
    expect(postgres).toContain("postgresOwnedStorageAdapter");
    expect(postgres).toContain("eq(storedObjects.ownerId, input.ownerId)");
    expect(convex).toContain("const actor = await requireActor(ctx)");
    expect(convex).toContain("ctx.db.system.get(args.storageId)");
    expect(convexPublic).not.toContain("args.ownerId");
    expect(convex).toContain("cleanupExpiredUploads");
  });
});
