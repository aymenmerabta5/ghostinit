import { describe, expect, test } from "bun:test";
import { convexJobsPublicContent } from "../../../src/templates/adapters/jobs/convex-public.js";
import { convexJobsInternalContent } from "../../../src/templates/adapters/jobs/convex-internal.js";
import { convexJobActionContent } from "../../../src/templates/adapters/jobs/convex-action.js";

type Row = Record<string, unknown> & { _id: string };
type Input = Record<string, unknown>;
type Registration = { handler(context: Context, input: Input): Promise<unknown> };
type Filter = {
  eq(field: string, value: unknown): Filter;
  lte(field: string, value: number): Filter;
};
type Query = {
  withIndex(name: string, select: (filter: Filter) => Filter): Query;
  unique(): Promise<Row | null>;
  take(limit: number): Promise<Row[]>;
};
type Context = {
  actor: { _id: string } | null;
  db: {
    get(id: string): Promise<Row | null>;
    insert(table: string, fields: Input): Promise<string>;
    patch(id: string, fields: Input): Promise<void>;
    query(table: string): Query;
  };
  scheduler: { runAfter(delay: number, action: string, args: Input): Promise<void> };
  runMutation(name: string, input: Input): Promise<unknown>;
};

function harness() {
  const tables = new Map<string, Map<string, Row>>();
  const scheduled: Array<{ delay: number; action: string; args: Input }> = [];
  let clock = 1_000_000;
  let identifier = 0;
  class TestDate extends Date {
    static override now() {
      return clock;
    }
  }
  class ConvexError extends Error {
    constructor(readonly data: unknown) {
      super("Convex operation rejected");
    }
  }
  const table = (name: string) => {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    return rows;
  };
  const context: Context = {
    actor: { _id: "owner" },
    db: {
      async get(id) {
        for (const rows of tables.values()) {
          const row = rows.get(id);
          if (row) return structuredClone(row);
        }
        return null;
      },
      async insert(name, fields) {
        const id = `${name}:${++identifier}`;
        table(name).set(id, { ...structuredClone(fields), _id: id });
        return id;
      },
      async patch(id, fields) {
        for (const rows of tables.values()) {
          const row = rows.get(id);
          if (!row) continue;
          for (const [key, value] of Object.entries(fields)) {
            if (value === undefined) delete row[key];
            else row[key] = structuredClone(value);
          }
          return;
        }
        throw new Error("Cannot patch missing fixture row");
      },
      query(name) {
        const predicates: Array<(row: Row) => boolean> = [];
        const filter: Filter = {
          eq: (key, value) => {
            predicates.push((row) => row[key] === value);
            return filter;
          },
          lte: (key, value) => {
            predicates.push((row) => Number(row[key]) <= value);
            return filter;
          },
        };
        const matching = () =>
          [...table(name).values()]
            .filter((row) => predicates.every((accept) => accept(row)))
            .map((row) => structuredClone(row));
        const query: Query = {
          withIndex: (_index, select) => {
            select(filter);
            return query;
          },
          unique: async () => matching()[0] ?? null,
          take: async (limit) => matching().slice(0, limit),
        };
        return query;
      },
    },
    scheduler: {
      runAfter: async (delay, action, args) => {
        scheduled.push({ delay, action, args });
      },
    },
    runMutation: async (name, input) => {
      const handler = internalHandlers[name];
      if (!handler) throw new Error(`Unknown generated mutation ${name}`);
      return await handler.handler(context, input);
    },
  };
  const references = {
    jobsInternal: Object.fromEntries(
      ["claim", "heartbeat", "succeed", "fail"].map((name) => [name, name]),
    ),
    jobActions: { execute: "execute" },
  };
  const validators = new Proxy({}, { get: () => () => null });
  const registration = (value: Registration) => value;
  function load(source: string, exported: string): Record<string, Registration> {
    const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
      source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
    );
    return new Function(
      "v",
      "internal",
      "internalMutation",
      "internalAction",
      "mutation",
      "query",
      "requireActor",
      "ConvexError",
      "Date",
      executable + `\nreturn { ${exported} };`,
    )(
      validators,
      references,
      registration,
      registration,
      registration,
      registration,
      async (current: Context) => {
        if (!current.actor) throw new ConvexError({ code: "UNAUTHENTICATED" });
        return current.actor;
      },
      ConvexError,
      TestDate,
    ) as Record<string, Registration>;
  }
  const internalHandlers = load(
    convexJobsInternalContent(),
    "ensureDefinitions, claim, heartbeat, succeed, fail, tickSchedules",
  );
  const publicHandlers = load(convexJobsPublicContent(), "enqueue, get, result, cancel");
  const actions = load(convexJobActionContent(), "execute");
  return {
    context,
    scheduled,
    setNow: (value: number) => {
      clock = value;
    },
    internal: async (name: string, input: Input = {}) =>
      await internalHandlers[name]!.handler(context, input),
    public: async (name: string, input: Input) =>
      await publicHandlers[name]!.handler(context, input),
    execute: async (runId: string) => await actions.execute!.handler(context, { runId }),
  };
}

describe("generated jobs execution operation", () => {
  test("executes queued handlers with durable results, replay safety, ownership, retry, and cancellation", async () => {
    const runtime = harness();
    await runtime.internal("ensureDefinitions");
    const input = { jobKey: "system.echo", requestKey: "once", payload: { page: 1 } };
    const queued = (await runtime.public("enqueue", input)) as {
      run: { id: string };
      created: boolean;
    };
    expect(queued.created).toBe(true);
    expect(runtime.scheduled).toHaveLength(1);
    expect(await runtime.execute(queued.run.id)).toEqual({ kind: "succeeded" });
    expect(await runtime.public("result", { runId: queued.run.id })).toMatchObject({
      state: "succeeded",
      result: { status: "ok", echoed: '{"page":1}' },
    });
    expect(await runtime.execute(queued.run.id)).toEqual({ kind: "not-claimable" });
    expect(await runtime.public("enqueue", input)).toMatchObject({
      created: false,
      run: { id: queued.run.id, attempt: 1 },
    });
    expect(runtime.scheduled).toHaveLength(1);
    runtime.context.actor = { _id: "intruder" };
    expect(await runtime.public("result", { runId: queued.run.id })).toBeNull();
    expect(await runtime.public("cancel", { runId: queued.run.id })).toBeNull();
    runtime.context.actor = null;
    await expect(runtime.public("enqueue", input)).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
    runtime.context.actor = { _id: "owner" };

    const cancelled = (await runtime.public("enqueue", { ...input, requestKey: "cancelled" })) as {
      run: { id: string };
    };
    await runtime.public("cancel", { runId: cancelled.run.id });
    expect(await runtime.execute(cancelled.run.id)).toEqual({ kind: "not-claimable" });
    expect(await runtime.public("result", { runId: cancelled.run.id })).toMatchObject({
      state: "cancelled",
      result: null,
    });

    const definition = await runtime.context.db.insert("jobDefinitions", {
      key: "retry",
      type: "missing-handler",
      enabled: true,
      defaultMaxAttempts: 2,
    });
    const retry = (await runtime.public("enqueue", {
      jobKey: "retry",
      requestKey: "retry",
      payload: { attempt: true },
    })) as { run: { id: string } };
    expect(await runtime.execute(retry.run.id)).toEqual({ kind: "queued", retryAt: 1_001_000 });
    expect(runtime.scheduled.at(-1)).toEqual({
      delay: 1000,
      action: "execute",
      args: { runId: retry.run.id },
    });
    await runtime.context.db.patch(definition, { type: "system.echo" });
    runtime.setNow(1_001_000);
    expect(await runtime.execute(retry.run.id)).toEqual({ kind: "succeeded" });
    expect(await runtime.public("get", { runId: retry.run.id })).toMatchObject({
      state: "succeeded",
      attempt: 2,
    });
  });
});
