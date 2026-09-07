import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";
type Row = Record<string, unknown>;
type Condition =
  | { kind: "and"; values: Condition[] }
  | { kind: "or"; values: Condition[] }
  | { kind: "eq" | "gt" | "gte" | "lt" | "lte"; field: string; value: unknown }
  | { kind: "in"; field: string; values: unknown[] }
  | { kind: "not-null" | "null"; field: string }
  | { kind: "sql"; source: string };

interface Actor {
  authSessionId: string;
  emailVerified: boolean;
  organizationId: string | null;
  teamId: string | null;
  userId: string;
}

interface Decision {
  ok: boolean;
  code?: string;
  leaseId?: string;
  plan?: string;
  retryAfterSeconds?: number;
}

function config(mode: Mode, database: Database, billing: boolean): ProjectConfig {
  return projectConfigSchema.parse({
    name: `eve-admission-${mode}-${database}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database,
    billing: billing ? ["stripe"] : [],
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
  });
}

function generatedSource(mode: Mode, database: Database, billing: boolean, path: string): string {
  const files = generateProjectFiles(config(mode, database, billing), { dryRun: true });
  const content = files.find((entry) => entry.path === path)?.content;
  if (!content) throw new Error(`Missing generated file ${path}`);
  return content;
}

function scalar(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function matches(row: Row, condition: Condition): boolean {
  if (condition.kind === "and") return condition.values.every((value) => matches(row, value));
  if (condition.kind === "or") return condition.values.some((value) => matches(row, value));
  if (condition.kind === "null")
    return row[condition.field] === null || row[condition.field] === undefined;
  if (condition.kind === "not-null")
    return row[condition.field] !== null && row[condition.field] !== undefined;
  if (condition.kind === "in") return condition.values.includes(row[condition.field]);
  if (condition.kind === "sql") return (row.metadata as Row | undefined)?.planId === "pro";
  const left = scalar(row[condition.field]);
  const right = scalar(condition.value);
  if (condition.kind === "eq") return left === right;
  if (condition.kind === "gt") return left > right;
  if (condition.kind === "gte") return left >= right;
  if (condition.kind === "lt") return left < right;
  return left <= right;
}

const eq = (field: string, value: unknown): Condition => ({ kind: "eq", field, value });
const gt = (field: string, value: unknown): Condition => ({ kind: "gt", field, value });
const gte = (field: string, value: unknown): Condition => ({ kind: "gte", field, value });
const lt = (field: string, value: unknown): Condition => ({ kind: "lt", field, value });
const lte = (field: string, value: unknown): Condition => ({ kind: "lte", field, value });
const isNull = (field: string): Condition => ({ kind: "null", field });
const isNotNull = (field: string): Condition => ({ kind: "not-null", field });
const inArray = (field: string, values: unknown[]): Condition => ({ kind: "in", field, values });
const and = (...values: Array<Condition | undefined>): Condition => ({
  kind: "and",
  values: values.filter((value): value is Condition => value !== undefined),
});
const or = (...values: Array<Condition | undefined>): Condition => ({
  kind: "or",
  values: values.filter((value): value is Condition => value !== undefined),
});
const sql = (parts: TemplateStringsArray): Condition => ({ kind: "sql", source: parts.join("?") });

function actor(userId: string, overrides: Partial<Actor> = {}): Actor {
  return {
    authSessionId: `auth-${userId}`,
    emailVerified: true,
    organizationId: "org-a",
    teamId: "team-a",
    userId,
    ...overrides,
  };
}

function postgresAdmissionHarness(mode: Mode, billing: boolean, sponsoredEnabled = true) {
  const path =
    mode === "monorepo"
      ? "packages/api/src/eve/admission-adapter.ts"
      : "src/server/eve/admission-adapter.ts";
  const content = generatedSource(mode, "postgres", billing, path).replace(
    "const APPLICATION_SPONSORED_EVE_ACCESS = true;",
    `const APPLICATION_SPONSORED_EVE_ACCESS = ${String(sponsoredEnabled)};`,
  );
  const start = content.indexOf("export const agentAdmissionPort");
  if (start < 0) throw new Error("Generated Postgres admission port is missing");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    content.slice(start).replace("export const agentAdmissionPort", "const agentAdmissionPort"),
  );

  const subscriptions = {
    id: "id",
    userId: "userId",
    status: "status",
    currentPeriodEnd: "currentPeriodEnd",
    trialEnd: "trialEnd",
    metadata: "metadata",
  };
  const admissions = {
    id: "id",
    userId: "userId",
    organizationId: "organizationId",
    teamId: "teamId",
    operation: "operation",
    plan: "plan",
    createdAt: "createdAt",
    expiresAt: "expiresAt",
    eveSessionId: "eveSessionId",
    releasedAt: "releasedAt",
    lastRuntimeEventAt: "lastRuntimeEventAt",
    lastRuntimeEventId: "lastRuntimeEventId",
  };
  const runtimeSessions = {
    eveSessionId: "eveSessionId",
    lastEventAt: "lastEventAt",
    lastEventId: "lastEventId",
    updatedAt: "updatedAt",
  };
  const runtimeEvents = {
    eventId: "eventId",
    eveSessionId: "eveSessionId",
    eventType: "eventType",
    eventAt: "eventAt",
    receivedAt: "receivedAt",
  };
  const subscriptionRows: Row[] = [
    {
      id: "sub-alice",
      userId: "alice",
      status: "active",
      currentPeriodEnd: new Date("2100-01-01T00:00:00.000Z"),
      trialEnd: null,
      metadata: { planId: "pro" },
    },
    {
      id: "sub-bob",
      userId: "bob",
      status: "active",
      currentPeriodEnd: new Date("2100-01-01T00:00:00.000Z"),
      trialEnd: null,
      metadata: { planId: "pro" },
    },
  ];
  const admissionRows: Row[] = [];
  const runtimeSessionRows: Row[] = [];
  const runtimeEventRows: Row[] = [];
  const rowsFor = (table: unknown): Row[] =>
    table === subscriptions
      ? subscriptionRows
      : table === admissions
        ? admissionRows
        : table === runtimeSessions
          ? runtimeSessionRows
          : table === runtimeEvents
            ? runtimeEventRows
            : [];
  const project = (row: Row, selection: Record<string, string>): Row =>
    Object.fromEntries(Object.entries(selection).map(([key, field]) => [key, row[field]]));
  const transaction = {
    async execute() {},
    select(selection: Record<string, string>) {
      return {
        from: (table: unknown) => ({
          where: (condition: Condition) => ({
            limit: async (limit: number) =>
              rowsFor(table)
                .filter((row) => matches(row, condition))
                .slice(0, limit)
                .map((row) => project(row, selection)),
          }),
        }),
      };
    },
    delete(table: unknown) {
      return {
        where: async (condition: Condition) => {
          const rows = rowsFor(table);
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (matches(rows[index]!, condition)) rows.splice(index, 1);
          }
        },
      };
    },
    insert(table: unknown) {
      return {
        values: (value: Row) => {
          const rows = rowsFor(table);
          const duplicate =
            table === runtimeEvents && rows.some((row) => row.eventId === value.eventId);
          const normalized =
            table === admissions
              ? {
                  releasedAt: null,
                  lastRuntimeEventAt: null,
                  lastRuntimeEventId: null,
                  ...value,
                }
              : { ...value };
          const inserted = duplicate ? [] : [normalized];
          if (!duplicate) rows.push(inserted[0]!);
          const operation = Promise.resolve();
          return Object.assign(operation, {
            onConflictDoNothing: () => ({
              returning: async (selection: Record<string, string>) =>
                inserted.map((row) => project(row, selection)),
            }),
          });
        },
      };
    },
    update(table: unknown) {
      return {
        set: (value: Row) => ({
          where: (condition: Condition) => {
            const matched = rowsFor(table).filter((row) => matches(row, condition));
            for (const row of matched) Object.assign(row, value);
            return Object.assign(Promise.resolve(), {
              returning: async (selection: Record<string, string>) =>
                matched.map((row) => project(row, selection)),
            });
          },
        }),
      };
    },
  };
  let queue = Promise.resolve();
  const db = {
    transaction<T>(callback: (tx: typeof transaction) => Promise<T>): Promise<T> {
      const run = queue.then(() => callback(transaction));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    select: transaction.select,
    update: transaction.update,
  };
  let sequence = 0;
  const port = new Function(
    "randomUUID",
    "and",
    "eq",
    "gt",
    "gte",
    "inArray",
    "isNull",
    "isNotNull",
    "lt",
    "lte",
    "or",
    "sql",
    "db",
    "subscriptions",
    "eveAgentAdmissions",
    "eveAgentRuntimeSessions",
    "eveAgentRuntimeEvents",
    "EVE_ADMISSION_LEASE_MS",
    "EVE_MAX_CONCURRENT_OPERATIONS",
    "EVE_MAX_OPERATIONS_PER_WINDOW",
    "EVE_OPERATION_RATE_WINDOW_MS",
    "APPLICATION_SPONSORED_EVE_ACCESS",
    "isTerminalEveRuntimeEvent",
    `${javascript}; return agentAdmissionPort;`,
  )(
    () => `lease-${++sequence}`,
    and,
    eq,
    gt,
    gte,
    inArray,
    isNull,
    isNotNull,
    lt,
    lte,
    or,
    sql,
    db,
    subscriptions,
    admissions,
    runtimeSessions,
    runtimeEvents,
    5 * 60_000,
    1,
    10,
    60_000,
    sponsoredEnabled,
    (eventType: string) =>
      eventType === "session.waiting" ||
      eventType === "session.failed" ||
      eventType === "session.completed",
  ) as {
    admit(input: {
      actor: Actor;
      eveSessionId?: string;
      operation: "create" | "follow" | "compact";
      requestedAt: Date;
    }): Promise<Decision>;
    bindSession(input: {
      actor: Actor;
      boundAt: Date;
      eveSessionId: string;
      leaseId: string;
    }): Promise<void>;
    touchSession(input: { actor: Actor; eveSessionId: string; touchedAt: Date }): Promise<void>;
    release(input: { actor: Actor; leaseId: string; releasedAt: Date }): Promise<void>;
    releaseSession(input: {
      actor: Actor;
      eveSessionId: string;
      leaseId?: string;
      releasedAt: Date;
    }): Promise<boolean>;
    recordRuntimeEvent(input: {
      eventAt: Date;
      eventId: string;
      eventType: string;
      eveSessionId: string;
      leaseId?: string;
      receivedAt: Date;
    }): Promise<void>;
  };
  return { admissionRows, port };
}

function convexAdmissionHarness(mode: Mode, billing: boolean, sponsoredEnabled = true) {
  const content = generatedSource(mode, "convex", billing, "convex/eve/sessions.ts").replace(
    "const APPLICATION_SPONSORED_EVE_ACCESS = true;",
    `const APPLICATION_SPONSORED_EVE_ACCESS = ${String(sponsoredEnabled)};`,
  );
  const start = content.indexOf("type EveCtx");
  if (start < 0) throw new Error("Generated Convex Eve functions are missing");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    content.slice(start).replace(/^export /gm, ""),
  );
  const rows = new Map<string, Row[]>([
    [
      "subscriptions",
      [
        {
          _id: "sub-alice",
          userId: "alice",
          status: "active",
          currentPeriodEnd: Date.parse("2100-01-01T00:00:00.000Z"),
          metadata: { planId: "pro" },
        },
        {
          _id: "sub-bob",
          userId: "bob",
          status: "active",
          currentPeriodEnd: Date.parse("2100-01-01T00:00:00.000Z"),
          metadata: { planId: "pro" },
        },
      ],
    ],
    ["eveAgentAdmissions", []],
    ["eveAgentRuntimeSessions", []],
    ["eveAgentRuntimeEvents", []],
  ]);
  let currentActor = actor("alice");
  const identityActor = () => ({
    authSessionId: currentActor.authSessionId,
    session: { activeOrganizationId: undefined, activeTeamId: undefined },
    user: {
      _id: currentActor.userId,
      authId: currentActor.userId,
      email: `${currentActor.userId}@example.com`,
      emailVerified: currentActor.emailVerified,
      role: "user",
    },
  });
  const context = {
    db: {
      query(table: string) {
        const tableRows = rows.get(table) ?? [];
        return {
          withIndex(_name: string, build: (query: Record<string, unknown>) => unknown) {
            const conditions: Condition[] = [];
            const query = {
              eq(field: string, value: unknown) {
                conditions.push(eq(field, value));
                return query;
              },
              gt(field: string, value: unknown) {
                conditions.push(gt(field, value));
                return query;
              },
              gte(field: string, value: unknown) {
                conditions.push(gte(field, value));
                return query;
              },
              lt(field: string, value: unknown) {
                conditions.push(lt(field, value));
                return query;
              },
            };
            build(query);
            const selected = () =>
              tableRows.filter((row) => conditions.every((c) => matches(row, c)));
            return {
              collect: async () => selected(),
              take: async (limit: number) => selected().slice(0, limit),
              unique: async () => selected()[0] ?? null,
            };
          },
        };
      },
      async insert(table: string, value: Row) {
        const tableRows = rows.get(table) ?? [];
        if (!rows.has(table)) rows.set(table, tableRows);
        const row = { _id: `${table}-${tableRows.length + 1}`, ...value };
        tableRows.push(row);
        return row._id;
      },
      async delete(id: unknown) {
        for (const tableRows of rows.values()) {
          const index = tableRows.findIndex((row) => row._id === id);
          if (index >= 0) tableRows.splice(index, 1);
        }
      },
      async patch(id: unknown, value: Row) {
        for (const tableRows of rows.values()) {
          const row = tableRows.find((candidate) => candidate._id === id);
          if (row) Object.assign(row, value);
        }
      },
    },
  };
  const v = new Proxy(
    {},
    {
      get:
        () =>
        (..._args: unknown[]) => ({}),
    },
  );
  const builder = <T>(definition: T): T => definition;
  let clock = Date.parse("2030-01-01T00:00:00.000Z");
  const functions = new Function(
    "v",
    "mutation",
    "query",
    "ConvexError",
    "requireIdentityActor",
    "requireMembership",
    "requireTeam",
    "process",
    "Date",
    `${javascript}; return { admit, bindSessionAdmission, expiredBoundAdmissions, touchSessionAdmission, releaseSessionAdmissions, releaseAdmission, recordRuntimeEvent };`,
  )(
    v,
    builder,
    builder,
    class ConvexError extends Error {},
    async () => identityActor(),
    async () => undefined,
    async () => undefined,
    { env: { BETTER_AUTH_SECRET: "s".repeat(48) } },
    { now: () => clock },
  ) as {
    admit: {
      handler(
        ctx: unknown,
        args: {
          serverToken: string;
          eveSessionId?: string;
          operation: "create" | "follow" | "compact";
        },
      ): Promise<Decision>;
    };
    releaseAdmission: {
      handler(ctx: unknown, args: { serverToken: string; leaseId: string }): Promise<unknown>;
    };
    bindSessionAdmission: {
      handler(
        ctx: unknown,
        args: { serverToken: string; eveSessionId: string; leaseId: string },
      ): Promise<unknown>;
    };
    touchSessionAdmission: {
      handler(ctx: unknown, args: { serverToken: string; eveSessionId: string }): Promise<unknown>;
    };
    releaseSessionAdmissions: {
      handler(
        ctx: unknown,
        args: { serverToken: string; eveSessionId: string; leaseId?: string },
      ): Promise<{ released: boolean }>;
    };
    recordRuntimeEvent: {
      handler(
        ctx: unknown,
        args: {
          serverToken: string;
          eventAt: number;
          eventId: string;
          eventType: string;
          eveSessionId: string;
          leaseId?: string;
          receivedAt: number;
        },
      ): Promise<unknown>;
    };
  };
  let queue = Promise.resolve();
  const invoke = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return {
    admissions: rows.get("eveAgentAdmissions")!,
    admit(
      nextActor: Actor,
      at = clock,
      eveSessionId?: string,
      operation: "create" | "follow" | "compact" = "create",
    ): Promise<Decision> {
      currentActor = nextActor;
      clock = at;
      return invoke(() =>
        functions.admit.handler(context, {
          serverToken: "s".repeat(48),
          operation,
          ...(eveSessionId ? { eveSessionId } : {}),
        }),
      );
    },
    bind(nextActor: Actor, leaseId: string, eveSessionId: string, at = clock): Promise<unknown> {
      currentActor = nextActor;
      clock = at;
      return invoke(() =>
        functions.bindSessionAdmission.handler(context, {
          serverToken: "s".repeat(48),
          leaseId,
          eveSessionId,
        }),
      );
    },
    touch(nextActor: Actor, eveSessionId: string, at = clock): Promise<unknown> {
      currentActor = nextActor;
      clock = at;
      return invoke(() =>
        functions.touchSessionAdmission.handler(context, {
          serverToken: "s".repeat(48),
          eveSessionId,
        }),
      );
    },
    release(nextActor: Actor, leaseId: string, at = clock): Promise<unknown> {
      currentActor = nextActor;
      clock = at;
      return invoke(() =>
        functions.releaseAdmission.handler(context, { serverToken: "s".repeat(48), leaseId }),
      );
    },
    releaseSession(
      nextActor: Actor,
      eveSessionId: string,
      at = clock,
      leaseId?: string,
    ): Promise<{ released: boolean }> {
      currentActor = nextActor;
      clock = at;
      return invoke(() =>
        functions.releaseSessionAdmissions.handler(context, {
          serverToken: "s".repeat(48),
          eveSessionId,
          ...(leaseId === undefined ? {} : { leaseId }),
        }),
      );
    },
    recordRuntimeEvent(input: {
      eventAt: number;
      eventId: string;
      eventType: string;
      eveSessionId: string;
      leaseId?: string;
      receivedAt: number;
    }): Promise<unknown> {
      clock = input.receivedAt;
      return invoke(() =>
        functions.recordRuntimeEvent.handler(context, {
          serverToken: "s".repeat(48),
          ...input,
        }),
      );
    },
  };
}

async function verifyAdmissionLifecycle(
  admit: (value: Actor) => Promise<Decision>,
  release: (value: Actor, leaseId: string) => Promise<unknown>,
  expectedPlan: "pro" | "sponsored",
  operationLimit: number,
): Promise<void> {
  const alice = actor("alice");
  const first = await admit(alice);
  expect(first).toMatchObject({ ok: true, plan: expectedPlan });
  if (!first.leaseId) throw new Error("Admission did not return a lease");

  const sameUserOtherTeam = await admit(actor("alice", { teamId: "team-b" }));
  expect(sameUserOtherTeam).toMatchObject({ ok: false, code: "EVE_CONCURRENCY_LIMIT" });
  const bob = await admit(actor("bob"));
  expect(bob).toMatchObject({ ok: true, plan: expectedPlan });
  if (!bob.leaseId) throw new Error("Bob admission did not return a lease");
  await release(actor("bob"), bob.leaseId);
  await release(alice, first.leaseId);

  for (let index = 1; index < operationLimit; index += 1) {
    const admitted = await admit(alice);
    expect(admitted.ok).toBe(true);
    if (!admitted.leaseId) throw new Error("Rate test admission did not return a lease");
    await release(alice, admitted.leaseId);
  }
  expect(await admit(alice)).toMatchObject({ ok: false, code: "EVE_RATE_LIMITED" });
  const charlie = await admit(actor("charlie"));
  if (expectedPlan === "pro") {
    expect(charlie).toMatchObject({ ok: false, code: "EVE_ENTITLEMENT_REQUIRED" });
  } else {
    expect(charlie).toMatchObject({ ok: true, plan: "sponsored" });
    if (!charlie.leaseId) throw new Error("Sponsored admission did not return a lease");
    await release(actor("charlie"), charlie.leaseId);
  }
  expect(await admit(actor("alice", { emailVerified: false }))).toMatchObject({
    ok: false,
    code: "EVE_ENTITLEMENT_REQUIRED",
  });
}

interface SessionLeaseHarness {
  rows: Row[];
  admit(value: Actor, at: number): Promise<Decision>;
  bind(value: Actor, leaseId: string, eveSessionId: string, at: number): Promise<unknown>;
  touch(value: Actor, eveSessionId: string, at: number): Promise<unknown>;
  releaseSession(
    value: Actor,
    eveSessionId: string,
    at: number,
    leaseId?: string,
  ): Promise<boolean>;
}

async function verifySessionLeaseLifecycle(harness: SessionLeaseHarness): Promise<void> {
  const alice = actor("alice");
  const bob = actor("bob");
  const startedAt = Date.parse("2030-01-01T00:00:00.000Z");
  const eveSessionId = "wrun_durable_session";

  const first = await harness.admit(alice, startedAt);
  if (!first.leaseId) throw new Error("First session admission did not return a lease");
  await expect(harness.bind(bob, first.leaseId, eveSessionId, startedAt + 100)).rejects.toThrow();
  await harness.bind(alice, first.leaseId, eveSessionId, startedAt + 100);

  const firstRow = harness.rows.find(
    (row) => row.id === first.leaseId || row.leaseId === first.leaseId,
  );
  expect(firstRow?.eveSessionId).toBe(eveSessionId);
  const originalExpiry = scalar(firstRow?.expiresAt);
  await harness.touch(bob, eveSessionId, startedAt + 60_000);
  expect(scalar(firstRow?.expiresAt)).toBe(originalExpiry);
  await harness.touch(alice, eveSessionId, startedAt + 60_000);
  expect(scalar(firstRow?.expiresAt)).toBe(startedAt + 60_000 + 5 * 60_000);

  expect(await harness.releaseSession(bob, eveSessionId, startedAt + 61_000)).toBe(false);
  expect(await harness.releaseSession(alice, eveSessionId, startedAt + 63_000, first.leaseId)).toBe(
    true,
  );
  expect(firstRow?.releasedAt).toBeDefined();

  const secondStartedAt = startedAt + 2 * 60_000;
  const second = await harness.admit(alice, secondStartedAt);
  if (!second.leaseId) throw new Error("Second session admission did not return a lease");
  await harness.bind(alice, second.leaseId, eveSessionId, secondStartedAt + 100);
  const secondRow = harness.rows.find(
    (row) => row.id === second.leaseId || row.leaseId === second.leaseId,
  );
  expect(secondRow?.releasedAt ?? undefined).toBeUndefined();

  // A delayed terminal event scoped to the first lease must never release the
  // newer lease, regardless of either host's wall clock.
  expect(
    await harness.releaseSession(alice, eveSessionId, secondStartedAt + 200, first.leaseId),
  ).toBe(false);
  expect(secondRow?.releasedAt ?? undefined).toBeUndefined();
  expect(
    await harness.releaseSession(alice, eveSessionId, secondStartedAt + 2_000, second.leaseId),
  ).toBe(true);
  expect(secondRow?.releasedAt).toBeDefined();
}

interface RuntimeEventHarness {
  rows: Row[];
  admit(value: Actor, at: number): Promise<Decision>;
  record(input: {
    eventAt: number;
    eventId: string;
    eventType: string;
    eveSessionId: string;
    leaseId?: string;
    receivedAt: number;
  }): Promise<unknown>;
}

async function verifyRuntimeEventLifecycle(harness: RuntimeEventHarness): Promise<void> {
  const startedAt = Date.parse("2031-01-01T00:00:00.000Z");
  const eveClockOffsetMs = -2 * 60_000;
  const firstEveEventAt = startedAt + eveClockOffsetMs + 100;
  const eveSessionId = "wrun_runtime_authority";
  const first = await harness.admit(actor("alice"), startedAt);
  if (!first.leaseId) throw new Error("Runtime lifecycle admission did not return a lease");

  await harness.record({
    eventAt: firstEveEventAt,
    eventId: "evt_runtime_started_0001",
    eventType: "session.started",
    eveSessionId,
    leaseId: first.leaseId,
    receivedAt: startedAt + 200,
  });
  const firstRow = harness.rows.find(
    (row) => row.id === first.leaseId || row.leaseId === first.leaseId,
  );
  expect(firstRow?.eveSessionId).toBe(eveSessionId);
  expect(scalar(firstRow?.expiresAt)).toBe(startedAt + 200 + 5 * 60_000);
  expect(firstRow?.lastRuntimeEventId).toBe("evt_runtime_started_0001");

  // Eve event clocks are metadata, not ordering. A new event from a worker
  // whose clock moved backwards must still renew the exact active lease.
  await harness.record({
    eventAt: firstEveEventAt - 30_000,
    eventId: "evt_runtime_step_0001",
    eventType: "step.started",
    eveSessionId,
    leaseId: first.leaseId,
    receivedAt: startedAt + 60_000,
  });
  expect(scalar(firstRow?.expiresAt)).toBe(startedAt + 60_000 + 5 * 60_000);

  // Replaying an event after another event was accepted must be fenced by its
  // durable id, not merely by comparing it with the latest id or timestamp.
  await harness.record({
    eventAt: firstEveEventAt,
    eventId: "evt_runtime_started_0001",
    eventType: "session.started",
    eveSessionId,
    leaseId: first.leaseId,
    receivedAt: startedAt + 90_000,
  });
  expect(scalar(firstRow?.expiresAt)).toBe(startedAt + 60_000 + 5 * 60_000);

  const terminalAt = startedAt + eveClockOffsetMs + 1_000;
  await harness.record({
    eventAt: terminalAt,
    eventId: "evt_runtime_waiting_0001",
    eventType: "session.waiting",
    eveSessionId,
    leaseId: first.leaseId,
    receivedAt: terminalAt + 100,
  });
  expect(firstRow?.releasedAt).toBeDefined();

  const secondStartedAt = startedAt + 2_000;
  const secondEveEventAt = secondStartedAt + eveClockOffsetMs + 100;
  const second = await harness.admit(actor("alice"), secondStartedAt);
  if (!second.leaseId) throw new Error("Second runtime lifecycle admission did not return a lease");
  await harness.record({
    eventAt: secondEveEventAt,
    eventId: "evt_runtime_started_0002",
    eventType: "turn.started",
    eveSessionId,
    leaseId: second.leaseId,
    receivedAt: secondStartedAt + 200,
  });
  const secondRow = harness.rows.find(
    (row) => row.id === second.leaseId || row.leaseId === second.leaseId,
  );
  expect(secondRow?.releasedAt ?? undefined).toBeUndefined();

  // A delayed terminal explicitly scoped to the previous lease cannot release
  // the current lease, even when its event clock appears newer.
  await harness.record({
    eventAt: secondEveEventAt + 60_000,
    eventId: "evt_runtime_waiting_replay",
    eventType: "session.waiting",
    eveSessionId,
    leaseId: first.leaseId,
    receivedAt: secondStartedAt + 300,
  });
  expect(secondRow?.releasedAt ?? undefined).toBeUndefined();
  await harness.record({
    eventAt: secondEveEventAt - 60_000,
    eventId: "evt_runtime_waiting_0002",
    eventType: "session.waiting",
    eveSessionId,
    leaseId: second.leaseId,
    receivedAt: secondStartedAt + 600,
  });
  expect(secondRow?.releasedAt).toBeDefined();
}

async function verifyCompactRuntimeLifecycle(harness: {
  rows: Row[];
  admit(at: number, eveSessionId: string): Promise<Decision>;
  record(input: {
    eventAt: number;
    eventId: string;
    eventType: string;
    eveSessionId: string;
    receivedAt: number;
  }): Promise<unknown>;
}): Promise<void> {
  const startedAt = Date.parse("2032-01-01T00:00:00.000Z");
  const eveSessionId = "wrun_compaction";
  const admitted = await harness.admit(startedAt, eveSessionId);
  if (!admitted.leaseId) throw new Error("Compaction admission did not return a lease");
  const row = harness.rows.find(
    (candidate) => candidate.id === admitted.leaseId || candidate.leaseId === admitted.leaseId,
  );

  // A pre-existing waiting tail does not identify this compaction lease.
  await harness.record({
    eventAt: startedAt - 60_000,
    eventId: "evt_compact_old_waiting",
    eventType: "session.waiting",
    eveSessionId,
    receivedAt: startedAt + 100,
  });
  expect(row?.releasedAt ?? undefined).toBeUndefined();

  // The compaction lifecycle marker selects the already-bound compact lease;
  // its following session boundary can then release only that lease.
  await harness.record({
    eventAt: startedAt - 120_000,
    eventId: "evt_compact_requested",
    eventType: "compaction.requested",
    eveSessionId,
    receivedAt: startedAt + 200,
  });
  expect(row?.lastRuntimeEventId).toBe("evt_compact_requested");
  await harness.record({
    eventAt: startedAt - 180_000,
    eventId: "evt_compact_waiting",
    eventType: "session.waiting",
    eveSessionId,
    receivedAt: startedAt + 300,
  });
  expect(row?.releasedAt).toBeDefined();
}

describe("Eve durable paid-operation admission", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode}/postgres serializes concurrency and bounds the per-user paid-operation rate`, async () => {
      const { port } = postgresAdmissionHarness(mode, true);
      await verifyAdmissionLifecycle(
        (value) => port.admit({ actor: value, operation: "create", requestedAt: new Date() }),
        (value, leaseId) => port.release({ actor: value, leaseId, releasedAt: new Date() }),
        "pro",
        10,
      );
    });

    test(`${mode}/convex serializes concurrency and bounds the per-user paid-operation rate`, async () => {
      const harness = convexAdmissionHarness(mode, true);
      await verifyAdmissionLifecycle(harness.admit, harness.release, "pro", 10);
    });

    test(`${mode}/postgres binds and renews session leases while fencing replayed terminals`, async () => {
      const harness = postgresAdmissionHarness(mode, true);
      await verifySessionLeaseLifecycle({
        rows: harness.admissionRows,
        admit: (value, at) =>
          harness.port.admit({ actor: value, operation: "create", requestedAt: new Date(at) }),
        bind: (value, leaseId, eveSessionId, at) =>
          harness.port.bindSession({
            actor: value,
            boundAt: new Date(at),
            eveSessionId,
            leaseId,
          }),
        touch: (value, eveSessionId, at) =>
          harness.port.touchSession({ actor: value, eveSessionId, touchedAt: new Date(at) }),
        releaseSession: (value, eveSessionId, at, leaseId) =>
          harness.port.releaseSession({
            actor: value,
            eveSessionId,
            ...(leaseId === undefined ? {} : { leaseId }),
            releasedAt: new Date(at),
          }),
      });
    });

    test(`${mode}/convex binds and renews session leases while fencing replayed terminals`, async () => {
      const harness = convexAdmissionHarness(mode, true);
      await verifySessionLeaseLifecycle({
        rows: harness.admissions,
        admit: (value, at) => harness.admit(value, at),
        bind: (value, leaseId, eveSessionId, at) => harness.bind(value, leaseId, eveSessionId, at),
        touch: (value, eveSessionId, at) => harness.touch(value, eveSessionId, at),
        releaseSession: async (value, eveSessionId, at, leaseId) =>
          (await harness.releaseSession(value, eveSessionId, at, leaseId)).released,
      });
    });

    test(`${mode}/postgres binds, renews, and replay-fences leases from Eve runtime events`, async () => {
      const harness = postgresAdmissionHarness(mode, true);
      await verifyRuntimeEventLifecycle({
        rows: harness.admissionRows,
        admit: (value, at) =>
          harness.port.admit({ actor: value, operation: "create", requestedAt: new Date(at) }),
        record: (input) =>
          harness.port.recordRuntimeEvent({
            ...input,
            eventAt: new Date(input.eventAt),
            receivedAt: new Date(input.receivedAt),
          }),
      });
    });

    test(`${mode}/convex binds, renews, and replay-fences leases from Eve runtime events`, async () => {
      const harness = convexAdmissionHarness(mode, true);
      await verifyRuntimeEventLifecycle({
        rows: harness.admissions,
        admit: harness.admit,
        record: harness.recordRuntimeEvent,
      });
    });

    test(`${mode}/postgres associates control events with only the active compaction lease`, async () => {
      const harness = postgresAdmissionHarness(mode, true);
      await verifyCompactRuntimeLifecycle({
        rows: harness.admissionRows,
        admit: (at, eveSessionId) =>
          harness.port.admit({
            actor: actor("alice"),
            eveSessionId,
            operation: "compact",
            requestedAt: new Date(at),
          }),
        record: (input) =>
          harness.port.recordRuntimeEvent({
            ...input,
            eventAt: new Date(input.eventAt),
            receivedAt: new Date(input.receivedAt),
          }),
      });
    });

    test(`${mode}/convex associates control events with only the active compaction lease`, async () => {
      const harness = convexAdmissionHarness(mode, true);
      await verifyCompactRuntimeLifecycle({
        rows: harness.admissions,
        admit: (at, eveSessionId) => harness.admit(actor("alice"), at, eveSessionId, "compact"),
        record: harness.recordRuntimeEvent,
      });
    });

    test(`${mode}/postgres keeps no-billing Eve usable under the durable 10/minute sponsored quota`, async () => {
      const postgres = postgresAdmissionHarness(mode, false);
      await verifyAdmissionLifecycle(
        (value) =>
          postgres.port.admit({ actor: value, operation: "create", requestedAt: new Date() }),
        (value, leaseId) =>
          postgres.port.release({ actor: value, leaseId, releasedAt: new Date() }),
        "sponsored",
        10,
      );
    });

    test(`${mode}/convex keeps no-billing Eve usable under the durable 10/minute sponsored quota`, async () => {
      const convex = convexAdmissionHarness(mode, false);
      await verifyAdmissionLifecycle(convex.admit, convex.release, "sponsored", 10);
    });

    test(`${mode} preserves typed unsupported denial when sponsored policy is disabled`, async () => {
      const postgres = postgresAdmissionHarness(mode, false, false);
      expect(
        await postgres.port.admit({
          actor: actor("alice"),
          operation: "create",
          requestedAt: new Date(),
        }),
      ).toEqual({ ok: false, code: "EVE_ENTITLEMENT_UNSUPPORTED" });
      const convex = convexAdmissionHarness(mode, false, false);
      expect(await convex.admit(actor("alice"))).toMatchObject({
        ok: false,
        code: "EVE_ENTITLEMENT_UNSUPPORTED",
      });
    });
  }
});
