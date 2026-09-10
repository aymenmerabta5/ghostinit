import { expect, test } from "bun:test";
import { SQL } from "bun";
import {
  startIsolatedE2EPostgres,
  startRejectingE2EPostgresAuthentication,
} from "./e2e-postgres.js";

import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";

interface PostgreSqlProbeClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}
const { Client } = createRequire(import.meta.url)("pg") as {
  Client: new (options: { connectionString: string }) => PostgreSqlProbeClient;
};

test("embedded E2E PostgreSQL serves real SQL and preserves fatal 28P01 auth failures", async () => {
  const postgres = await startIsolatedE2EPostgres();
  const sql = new SQL(postgres.environment.DATABASE_URL ?? "");
  try {
    await sql`create table e2e_probe (value integer not null)`;
    await sql`insert into e2e_probe (value) values (42)`;
    const rows = await sql`select value from e2e_probe`;
    expect(rows[0]?.value).toBe(42);
    expect(String((await sql`select version() as version`)[0]?.version)).toContain(
      "PostgreSQL 18.3",
    );
  } finally {
    try {
      await sql.close();
    } finally {
      await postgres.close();
    }
  }

  const rejectingPostgres = await startRejectingE2EPostgresAuthentication();
  const rejectedSql = new SQL(rejectingPostgres.environment.DATABASE_URL ?? "");
  try {
    let failure: unknown;
    try {
      await rejectedSql`select 1`;
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      name: "PostgresError",
      errno: "28P01",
      severity: "FATAL",
    });
  } finally {
    try {
      await rejectedSql.close();
    } finally {
      await rejectingPostgres.close();
    }
  }
});

test("embedded PostgreSQL bounds its shared cache and preserves defaults and transaction behavior", async () => {
  const defaultStartParams = [...PGlite.defaultStartParams];
  const postgres = await startIsolatedE2EPostgres();
  const connectionString = postgres.environment.DATABASE_URL ?? "";
  const client = new Client({ connectionString });
  const observer = new Client({ connectionString });
  try {
    await client.connect();
    expect(PGlite.defaultStartParams).toEqual(defaultStartParams);
    expect((await client.query("SHOW shared_buffers")).rows[0]?.shared_buffers).toBe("16MB");
    expect(
      (await client.query("SELECT pg_size_bytes(current_setting('shared_buffers'))::text AS bytes"))
        .rows[0]?.bytes,
    ).toBe("16777216");
    expect((await client.query("SHOW work_mem")).rows[0]?.work_mem).toBe("4MB");
    for (let index = 0; index < defaultStartParams.length; index += 1) {
      if (defaultStartParams[index] !== "-c") continue;
      const setting = defaultStartParams[index + 1];
      expect(setting).toBeDefined();
      const separator = setting!.indexOf("=");
      expect(separator).toBeGreaterThan(0);
      const name = setting!.slice(0, separator);
      const value = setting!.slice(separator + 1);
      const expected = value === "false" ? "off" : value === "true" ? "on" : value;
      const result = await client.query("SELECT current_setting($1) AS value", [name]);
      expect(result.rows[0]?.value, name).toBe(expected);
    }
    await client.query(
      "CREATE TABLE cache_budget_accounts (id integer PRIMARY KEY, balance integer NOT NULL CHECK (balance >= 0))",
    );
    await client.query("INSERT INTO cache_budget_accounts VALUES (1, 1000), (2, 500)");
    await client.query("BEGIN");
    await client.query("UPDATE cache_budget_accounts SET balance = balance - 100 WHERE id = 1");
    await client.query("UPDATE cache_budget_accounts SET balance = balance + 100 WHERE id = 2");
    await client.query("COMMIT");
    await observer.connect();
    expect(
      (await observer.query("SELECT id, balance FROM cache_budget_accounts ORDER BY id")).rows,
    ).toEqual([
      { id: 1, balance: 900 },
      { id: 2, balance: 600 },
    ]);
    await client.query("BEGIN");
    await client.query("UPDATE cache_budget_accounts SET balance = 0 WHERE id = 1");
    await client.query("ROLLBACK");
    expect(
      (await observer.query("SELECT balance FROM cache_budget_accounts WHERE id = 1")).rows[0]
        ?.balance,
    ).toBe(900);
    await observer.query("UPDATE cache_budget_accounts SET balance = balance + 1 WHERE id = 2");
    expect(
      (await client.query("SELECT balance FROM cache_budget_accounts WHERE id = 2")).rows[0]
        ?.balance,
    ).toBe(601);
  } finally {
    try {
      await observer.end();
    } finally {
      try {
        await client.end();
      } finally {
        await postgres.close();
      }
    }
  }
  expect(PGlite.defaultStartParams).toEqual(defaultStartParams);
});
