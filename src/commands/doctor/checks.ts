import { getPlainSecret } from "./env.js";

export interface Check {
  name: string;
  ok: boolean;
  message: string;
  meta?: Record<string, unknown>;
}

export function isNonEmptyValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function checkPresence(name: string, value: unknown): Check {
  const present = isNonEmptyValue(value);
  return {
    name: name.toLowerCase(),
    ok: present,
    message: present ? `${name} is set` : `${name} not set`,
  };
}

export function checkSecretStrength(name: string, lengthInput?: number | string): Check {
  const length = typeof lengthInput === "string" ? Number.parseInt(lengthInput, 10) : lengthInput;
  if (typeof length !== "number" || Number.isNaN(length) || length < 32) {
    return { name: "secret-strength", ok: false, message: `${name} is missing or too short` };
  }
  return { name: "secret-strength", ok: true, message: `${name} length looks strong enough` };
}

export function buildPostgresUrl(vars: Record<string, string>): string {
  const user = vars.POSTGRES_USER ?? process.env.POSTGRES_USER ?? "postgres";
  const password =
    getPlainSecret("POSTGRES_PASSWORD") ??
    vars.POSTGRES_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    "";
  const host = vars.POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? "localhost";
  const port = vars.POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? "5432";
  const db =
    vars.POSTGRES_DB ??
    process.env.POSTGRES_DB ??
    vars.APP_NAME ??
    process.env.APP_NAME ??
    "ghostinit";
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export async function checkDatabase(vars: Record<string, string>): Promise<Check> {
  const url = getPlainSecret("DATABASE_URL") ?? vars.DATABASE_URL ?? process.env.DATABASE_URL;
  if (isNonEmptyValue(url)) {
    try {
      new URL(url as string);
      return { name: "database-url", ok: true, message: "DATABASE_URL looks valid" };
    } catch {
      return { name: "database-url", ok: false, message: "DATABASE_URL is not a valid URL" };
    }
  }

  const required = ["POSTGRES_USER", "POSTGRES_HOST", "POSTGRES_DB"];
  const missing = required.filter((key) => !isNonEmptyValue(vars[key] ?? process.env[key]));
  if (missing.length > 0) {
    return {
      name: "database-url",
      ok: false,
      message: `Database config missing: ${missing.join(", ")}`,
    };
  }

  try {
    new URL(buildPostgresUrl(vars));
    return { name: "database-url", ok: true, message: "PostgreSQL configuration looks valid" };
  } catch {
    return { name: "database-url", ok: false, message: "Built PostgreSQL URL is not a valid URL" };
  }
}

export async function checkDatabaseConnectivity(
  vars: Record<string, string>,
  logger: { debug: (msg: string, meta?: Record<string, unknown>) => void },
): Promise<Check | undefined> {
  const hasUrl = isNonEmptyValue(
    getPlainSecret("DATABASE_URL") ?? vars.DATABASE_URL ?? process.env.DATABASE_URL,
  );
  const hasParts =
    isNonEmptyValue(vars.POSTGRES_HOST ?? process.env.POSTGRES_HOST) ||
    isNonEmptyValue(vars.POSTGRES_USER ?? process.env.POSTGRES_USER);
  if (!hasUrl && !hasParts) return undefined;

  let connectionString: string | undefined;
  const rawDbUrl = getPlainSecret("DATABASE_URL") ?? vars.DATABASE_URL ?? process.env.DATABASE_URL;
  if (isNonEmptyValue(rawDbUrl)) {
    connectionString = rawDbUrl as string;
  } else {
    const rawVars: Record<string, string> = {
      POSTGRES_USER: vars.POSTGRES_USER ?? process.env.POSTGRES_USER ?? "postgres",
      POSTGRES_PASSWORD:
        getPlainSecret("POSTGRES_PASSWORD") ??
        vars.POSTGRES_PASSWORD ??
        process.env.POSTGRES_PASSWORD ??
        "",
      POSTGRES_HOST: vars.POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? "localhost",
      POSTGRES_PORT: vars.POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? "5432",
      POSTGRES_DB: vars.POSTGRES_DB ?? process.env.POSTGRES_DB ?? vars.APP_NAME ?? "ghostinit",
      APP_NAME: vars.APP_NAME ?? process.env.APP_NAME ?? "ghostinit",
    };
    try {
      connectionString = buildPostgresUrl(rawVars);
    } catch {
      return {
        name: "database-connectivity",
        ok: false,
        message: "Cannot build connection string for connectivity check",
      };
    }
  }

  try {
    type PgPool = {
      connect: () => Promise<{ query: (sql: string) => Promise<unknown>; release: () => void }>;
      end: () => Promise<void>;
    };
    type PgModule = { Pool: new (opts: Record<string, unknown>) => PgPool };

    let pgMod: PgModule | undefined;
    try {
      // @ts-ignore - pg optional
      pgMod = (await import("pg")) as unknown as PgModule;
    } catch {
      pgMod = undefined;
    }

    if (!pgMod) {
      return {
        name: "database-connectivity",
        ok: true,
        message: "pg not installed, skipping connectivity check (install @repo/database to enable)",
        meta: { skipped: true },
      };
    }

    const pool = new pgMod.Pool({
      connectionString,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 2000,
      max: 1,
    });

    let client: { query: (sql: string) => Promise<unknown>; release: () => void } | undefined;
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      await pool.end();
      return {
        name: "database-connectivity",
        ok: true,
        message: "Database reachable (SELECT 1 ok)",
      };
    } catch (err) {
      try {
        client?.release();
      } catch {}
      try {
        await pool.end();
      } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug("Database connectivity check failed", { cause: msg });
      return {
        name: "database-connectivity",
        ok: false,
        message: `Database unreachable: ${msg.slice(0, 200)}`,
        meta: { optional: true },
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "database-connectivity",
      ok: false,
      message: `Connectivity check error: ${msg.slice(0, 200)}`,
      meta: { optional: true },
    };
  }
}
