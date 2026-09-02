import { expect, test } from "bun:test";
import { SQL } from "bun";
import {
  startIsolatedE2EPostgres,
  startRejectingE2EPostgresAuthentication,
} from "./e2e-postgres.js";

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
