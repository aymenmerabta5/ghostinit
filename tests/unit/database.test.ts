import { describe, it, expect } from "bun:test";
import { databasePackage } from "../../src/templates/database";
import { convexDatabaseFiles } from "../../src/templates/database/convex";
import { databaseComposerFiles } from "../../src/templates/modes/monorepo/database-composer";
import {
  serverDbIndexSingle,
  serverDbIndexSingleNone,
} from "../../src/templates/modes/single/server/db";

describe("database package template", () => {
  it("configures pool max and idleTimeoutMillis", () => {
    const files = databasePackage();
    const index = files.find((f) => f.path === "packages/database/src/index.ts")?.content ?? "";
    expect(index).toContain("max: env.DATABASE_POOL_SIZE ?? 20");
    expect(index).toContain("idleTimeoutMillis: 30000");
    expect(index).toContain("encodeURIComponent(user)");
    expect(index).toContain("encodeURIComponent(db)");
    expect(index).toContain("rejectConnectionStringTlsOverrides(connectionString)");
    expect(index).toContain('normalized.startsWith("ssl")');
    expect(index).toContain('normalized === "uselibpqcompat"');
  });

  it("enables ssl when DATABASE_SSL is true", () => {
    const files = databasePackage();
    const index = files.find((f) => f.path === "packages/database/src/index.ts")?.content ?? "";
    expect(index).toContain('env.DATABASE_SSL === "true"');
  });

  it("keeps single-mode Postgres TLS, credential encoding, and pool bounds in parity", () => {
    const index = serverDbIndexSingle();

    expect(index).toContain("encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '')");
    expect(index).toContain("process.env.DATABASE_SSL === 'true'");
    expect(index).toContain("rejectUnauthorized: true");
    expect(index).toContain("DATABASE_SSL_CA");
    expect(index).toContain("idleTimeoutMillis: 30_000");
    expect(index).toContain("configuredPoolSize > 100");
    expect(index).toContain("rejectConnectionStringTlsOverrides(connectionString)");
    expect(index).toContain("normalized.startsWith('ssl')");
  });
});

describe("Convex database health", () => {
  it("executes a bounded deployment query and fails closed", () => {
    const files = convexDatabaseFiles("demo", "bun", "monorepo");
    const paths = files.map((entry) => entry.path);
    const health = files.find((entry) => entry.path === "convex/health.ts")?.content ?? "";
    const client =
      files.find((entry) => entry.path === "packages/database/src/index.ts")?.content ?? "";

    expect(paths).toContain("convex/health.ts");
    expect(health).toContain("export const check = query");
    expect(client).toContain('makeFunctionReference<"query"');
    expect(client).toContain('("health:check")');
    expect(client).toContain("HEALTH_CHECK_TIMEOUT_MS = 5_000");
    expect(client).toContain("Promise.race([operation, deadline])");
    expect(client).toContain("convexClient.query(deploymentHealthQuery, {})");
    expect(client).toContain("ok: isDeploymentHealthy(result)");
    expect(client).toContain("ok: false");
    expect(client).not.toContain("return { ok: true, url");
  });
});

describe("database=none contracts", () => {
  it("emits an import-compatible, fail-closed monorepo database without unsafe syntax", () => {
    const files = databaseComposerFiles("demo", "bun", undefined, "none");
    const emitted = files.map(({ content }) => content).join("\n");
    const disabled =
      files.find(({ path }) => path === "packages/database/src/disabled.ts")?.content ?? "";
    const index =
      files.find(({ path }) => path === "packages/database/src/index.ts")?.content ?? "";
    const schema =
      files.find(({ path }) => path === "packages/database/src/schema/index.ts")?.content ?? "";

    expect(emitted).not.toMatch(/:\s*any\b|\bas unknown as\b|@ts-ignore/);
    expect(disabled).toContain("readonly [property: string]: never");
    expect(disabled).toContain("return new Proxy");
    expect(disabled).toContain("database is disabled (--database none)");
    expect(index).toContain('export const db = disabledDatabaseValue("db")');
    expect(index).toContain("twoFactors");
    expect(index).toContain("organizationRoles");
    expect(schema).not.toContain('from "./auth.js"');
  });

  it("emits the same typed fail-closed client contract in single mode", () => {
    const content = serverDbIndexSingleNone();

    expect(content).not.toMatch(/:\s*any\b|\bas unknown as\b|@ts-ignore/);
    expect(content).toContain("readonly [property: string]: never");
    expect(content).toContain("new Proxy(disabledDatabaseTarget");
    expect(content).toContain("database is disabled (--database none)");
    expect(content).toContain("export const convexClient = null");
  });
});
