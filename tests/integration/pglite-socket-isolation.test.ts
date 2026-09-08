import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { PGliteWireClient, remainsPending } from "../helpers/pglite-wire.js";

const scheduleSql =
  'select "id", "job_id", "expression", "timezone", "enabled", "payload", "max_attempts", "next_run_at", "created_at", "updated_at" from "job_schedules" where ("job_schedules"."enabled" = $1 and "job_schedules"."next_run_at" <= $2) order by "job_schedules"."next_run_at" asc, "job_schedules"."id" asc limit $3';
const workerSql =
  'select "id", "state", "lease_expires_at" from "job_runs" where ("job_runs"."state" = $1 and "job_runs"."lease_expires_at" <= $2) order by "job_runs"."lease_expires_at" asc, "job_runs"."id" asc limit $3';
const dueAt = "2030-01-01T00:00:00.000Z";
const countSql = "select count(*) from wire_writes";

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} did not finish within 5 seconds`)),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SocketCase {
  readonly port: number;
  readonly server: PGLiteSocketServer;
  connect(): Promise<PGliteWireClient>;
}

async function waitForServer(
  server: PGLiteSocketServer,
  condition: (stats: ReturnType<PGLiteSocketServer["getStats"]>) => boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (!condition(server.getStats())) {
    if (Date.now() >= deadline) throw new Error(`${label}: server condition timed out`);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

async function expectQueued(server: PGLiteSocketServer, promise: Promise<unknown>): Promise<void> {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await waitForServer(
    server,
    (stats) => {
      if (settled)
        throw new Error("Competing query settled before server-observed queue admission");
      return stats.queuedQueries === 1;
    },
    "competing query admission",
  );
  expect(await remainsPending(promise)).toBe(true);
}

test("PGlite socket keeps unnamed protocol cycles and transactions owned across real clients", async () => {
  const database = await PGlite.create();
  let safeToCloseDatabase = true;
  await database.exec(`
    create type job_run_state as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
    create table job_schedules (id uuid primary key, job_id text, expression text, timezone text, enabled boolean not null, payload jsonb, max_attempts integer, next_run_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table job_runs (id uuid primary key, state job_run_state not null, lease_expires_at timestamptz);
    create table wire_writes (value integer not null);
    insert into job_schedules values ('00000000-0000-0000-0000-000000000001','probe','* * * * *','UTC',true,'{}',3,'2000-01-01','2000-01-01','2000-01-01');
    insert into job_runs values ('00000000-0000-0000-0000-000000000002','running','2000-01-01');
  `);
  const runCase = async (
    label: string,
    work: (context: SocketCase) => Promise<void>,
    Constructor = PGLiteSocketServer,
  ) => {
    await database.exec("truncate wire_writes");
    const server = new Constructor({
      db: database,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 32,
    });
    await server.start();
    const port = Number(server.getServerConn().split(":").at(-1));
    const clients: PGliteWireClient[] = [];
    const failures: unknown[] = [];
    try {
      await work({
        port,
        server,
        connect: async () => {
          const client = new PGliteWireClient(port);
          clients.push(client);
          await client.start();
          return client;
        },
      });
    } catch (error) {
      failures.push(error);
    }
    try {
      await bounded(Promise.all(clients.map((client) => client.close())), `${label} clients`);
    } catch (error) {
      failures.push(error);
    }
    try {
      await bounded(server.stop(), `${label} server cleanup`);
    } catch (error) {
      safeToCloseDatabase = false;
      failures.push(error);
    }
    if (failures.length) throw new AggregateError(failures, label);
  };
  const isolatedCycle = async ({ connect, server }: SocketCase) => {
    const scheduler = await connect(),
      worker = await connect();
    await scheduler.parse(scheduleSql);
    expect(database.isInTransaction()).toBe(false);
    const workerParsed = worker.parse(workerSql);
    await expectQueued(server, workerParsed);
    const schedules = await scheduler.execute(["true", dueAt, "100"]);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.[4]).toBe("t");
    await workerParsed;
    const jobs = await worker.execute(["running", dueAt, "100"]);
    expect(jobs[0]?.[1]).toBe("running");
  };
  try {
    await runCase("ESM unnamed boolean/enum isolation", isolatedCycle);
    await runCase(
      "disconnect after Parse releases the next client",
      async ({ connect, server }) => {
        const a = await connect(),
          b = await connect();
        await a.parse(scheduleSql);
        const waiting = b.parse(workerSql);
        await expectQueued(server, waiting);
        await a.close();
        await waiting;
        expect((await b.execute(["running", dueAt, "100"]))[0]?.[1]).toBe("running");
      },
    );
    await runCase(
      "disconnect before Sync rolls back an executed implicit write",
      async ({ connect, server }) => {
        const a = await connect(),
          b = await connect();
        await a.parse("insert into wire_writes values ($1)");
        await a.writeBeforeSync(["7"]);
        const waiting = b.query(countSql);
        await expectQueued(server, waiting);
        await a.close();
        expect(await waiting).toEqual([["0"]]);
      },
    );
    await runCase(
      "disconnecting a queued non-owner cannot roll back the owner",
      async ({ connect, server }) => {
        const a = await connect(),
          b = await connect();
        await a.query("BEGIN");
        await a.query("insert into wire_writes values (8)");
        const waiting = b.parse(scheduleSql);
        await expectQueued(server, waiting);
        await b.close();
        await expect(waiting).rejects.toThrow("connection closed");
        await waitForServer(
          server,
          (stats) => stats.activeConnections === 1 && stats.queuedQueries === 0,
          "queued client removal",
        );
        expect(database.isInTransaction()).toBe(true);
        expect(await a.query(countSql)).toEqual([["1"]]);
        await a.query("ROLLBACK");
        expect(await a.query(countSql)).toEqual([["0"]]);
      },
    );
    for (const finish of ["COMMIT", "ROLLBACK"]) {
      await runCase(
        `explicit transaction retains ownership until ${finish}`,
        async ({ connect, server }) => {
          const a = await connect(),
            b = await connect();
          await a.query("BEGIN");
          await a.parse("insert into wire_writes values ($1)");
          await a.execute(["9"]);
          expect(database.isInTransaction()).toBe(true);
          const waiting = b.query(countSql);
          await expectQueued(server, waiting);
          await a.query(finish);
          expect(await waiting).toEqual([[finish === "COMMIT" ? "1" : "0"]]);
        },
      );
    }
    await runCase(
      "failed explicit extended query disconnect rolls back before releasing",
      async ({ connect, server }) => {
        const a = await connect(),
          b = await connect();
        await a.query("BEGIN");
        await a.parse("select $1::integer");
        await expect(a.bindBeforeSync(["not-an-integer"])).rejects.toMatchObject({ code: "22P02" });
        const waiting = b.query("select 1");
        await expectQueued(server, waiting);
        await a.close();
        expect(await waiting).toEqual([["1"]]);
        expect(database.isInTransaction()).toBe(false);
      },
    );
    await runCase(
      "stop waits for an in-flight owner and rollback before database close",
      async ({ connect, server }) => {
        const a = await connect();
        const original = database.execProtocolRawStream.bind(database);
        let entered!: () => void, release!: () => void;
        const executing = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let hold = true,
          stopping: Promise<void> | undefined;
        database.execProtocolRawStream = async (message, options) => {
          await original(message, options);
          if (message[0] === 69 && hold) {
            hold = false;
            entered();
            await gate;
          }
        };
        try {
          await a.parse("insert into wire_writes values ($1)");
          const write = a.writeBeforeSync(["10"]);
          await bounded(executing, "in-flight write");
          await write;
          await a.close();
          stopping = server.stop();
          expect(await remainsPending(stopping)).toBe(true);
          release();
          await bounded(stopping, "in-flight stop");
          const result = await database.query<{ count: number }>(countSql);
          expect(Number(result.rows[0]?.count)).toBe(0);
        } finally {
          release();
          database.execProtocolRawStream = original;
          if (stopping) await bounded(stopping, "final in-flight stop");
        }
      },
    );
    const require = createRequire(import.meta.url);
    const cjs = require("@electric-sql/pglite-socket") as {
      PGLiteSocketServer: typeof PGLiteSocketServer;
    };
    await runCase("CJS unnamed boolean/enum isolation", isolatedCycle, cjs.PGLiteSocketServer);
    await runCase("normal concurrent pools preserve both query result types", async ({ port }) => {
      const options = {
        host: "127.0.0.1",
        port,
        user: "postgres",
        database: "postgres",
        max: 4,
        connectionTimeoutMillis: 4_000,
        query_timeout: 4_000,
      };
      const scheduler = new Pool(options),
        worker = new Pool(options);
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 100 }, () => [
            scheduler
              .query(scheduleSql, [true, dueAt, 100])
              .then((result) => expect(result.rows[0]?.enabled).toBe(true)),
            worker
              .query(workerSql, ["running", dueAt, 100])
              .then((result) => expect(result.rows[0]?.state).toBe("running")),
          ]).flat(),
        );
        expect(results.filter((result) => result.status === "rejected")).toEqual([]);
        expect(scheduler.options.max).toBe(4);
        expect(worker.options.max).toBe(4);
      } finally {
        await bounded(Promise.all([scheduler.end(), worker.end()]), "pool cleanup");
      }
    });
  } finally {
    if (safeToCloseDatabase) await database.close();
  }
}, 60_000);
