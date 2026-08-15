import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
import type { RootSecrets } from "../../root.js";

type DatabaseVal = "postgres" | "convex" | "none" | undefined;

/**
 * Which public env prefixes a project actually consumes.
 *
 * The public prefix is framework-specific: @repo/config builds on
 * `@t3-oss/env-nextjs` (implicit NEXT_PUBLIC_) for Next.js and `@t3-oss/env-core`
 * with `clientPrefix: "VITE_"` for TanStack Start, and declares exactly ONE of
 * those families. EXPO_PUBLIC_ only exists when a mobile app is generated.
 *
 * These files used to emit all three families unconditionally, so a Next-only
 * project shipped 8 VITE_ and 8 EXPO_PUBLIC_ variables in both .env.example and
 * .env.local that nothing reads — the env files disagreed with the schema that
 * validates them.
 */
export interface EnvAudience {
  framework?: "nextjs" | "tanstack-start" | string;
  hasMobile?: boolean;
  hasDesktop?: boolean;
}

const DEFAULT_AUDIENCE: EnvAudience = { framework: "nextjs", hasMobile: false, hasDesktop: false };

/** The web framework's own public prefix. */
export function webPublicPrefix(framework?: string): "NEXT_PUBLIC_" | "VITE_" {
  return framework === "tanstack-start" ? "VITE_" : "NEXT_PUBLIC_";
}

/** Every public prefix this project consumes, web first. */
export function publicPrefixes(audience: EnvAudience = DEFAULT_AUDIENCE): string[] {
  const prefixes: string[] = [webPublicPrefix(audience.framework)];
  if (audience.hasMobile) prefixes.push("EXPO_PUBLIC_");
  if (audience.hasDesktop) prefixes.push("DESKTOP_");
  return prefixes;
}

/** `PREFIX_NAME=value` for each prefix the project actually consumes. */
export function publicVarLines(audience: EnvAudience, name: string, value: string): string[] {
  return publicPrefixes(audience).map((prefix) => `${prefix}${name}=${value}`);
}

function postgresExampleLines(projectName: string): string[] {
  return [
    "# Postgres (used when --database postgres)",
    "POSTGRES_USER=postgres",
    `POSTGRES_PASSWORD=${ENV_PLACEHOLDERS.POSTGRES_PASSWORD}`,
    "POSTGRES_HOST=localhost",
    "POSTGRES_PORT=5432",
    `POSTGRES_DB=${projectName}`,
    "DATABASE_SSL=false",
    "DATABASE_POOL_SIZE=20",
  ];
}
function postgresLocalLines(projectName: string, secrets: RootSecrets): string[] {
  return [
    "# Postgres (used when --database postgres)",
    "POSTGRES_USER=postgres",
    `POSTGRES_PASSWORD=${secrets.postgresPassword}`,
    "POSTGRES_HOST=localhost",
    "POSTGRES_PORT=5432",
    `POSTGRES_DB=${projectName}`,
    "DATABASE_SSL=false",
    "DATABASE_POOL_SIZE=20",
  ];
}
function convexExampleLinesFull(audience: EnvAudience): string[] {
  return [
    "# Convex (used when --database convex) — set via `npx convex dev` or dashboard",
    `CONVEX_DEPLOYMENT=${ENV_PLACEHOLDERS.CONVEX_DEPLOYMENT}`,
    `CONVEX_URL=${ENV_PLACEHOLDERS.CONVEX_URL}`,
    ...publicVarLines(audience, "CONVEX_URL", ENV_PLACEHOLDERS.NEXT_PUBLIC_CONVEX_URL),
    `CONVEX_SITE_URL=${ENV_PLACEHOLDERS.CONVEX_SITE_URL}`,
    "# SITE_URL used by @convex-dev/better-auth crossDomain",
    `SITE_URL=${ENV_PLACEHOLDERS.SITE_URL}`,
  ];
}
function convexLocalLinesFull(audience: EnvAudience): string[] {
  return [
    "# Convex (used when --database convex) — set via `npx convex dev` or dashboard",
    "# CONVEX_DEPLOYMENT is set by the convex CLI; the URLs come from the .env.local that `convex dev` writes",
    `CONVEX_DEPLOYMENT=dev:example-123`,
    `CONVEX_URL=https://example-123.convex.cloud`,
    ...publicVarLines(audience, "CONVEX_URL", "https://example-123.convex.cloud"),
    `CONVEX_SITE_URL=https://example-123.convex.site`,
    `SITE_URL=http://localhost:3000`,
  ];
}

export function coreEnvExampleLines(
  projectName: string,
  database?: DatabaseVal | string,
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
  const base = [
    "# GhostInit env — placeholders for .env.example",
    `BETTER_AUTH_SECRET=${ENV_PLACEHOLDERS.BETTER_AUTH_SECRET}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    ...publicVarLines(audience, "APP_URL", "http://localhost:3000"),
    ...publicVarLines(audience, "API_URL", "http://localhost:3000"),
    `APP_NAME=${projectName}`,
  ];
  const db = (database as DatabaseVal) ?? "postgres";
  if (db === "convex") {
    base.push(...convexExampleLinesFull(audience));
  } else if (db === "none") {
    base.push("# Database disabled (--database none) — no Postgres or Convex vars");
  } else {
    base.push(...postgresExampleLines(projectName));
    // For postgres mode still show convex placeholder as commented optional? For DX we show both? But production ready we show only postgres to avoid confusion.
    // Keep convex as commented reference when postgres to help migration.
    base.push("# Optional Convex if you switch to --database convex");
    base.push(`# CONVEX_URL=${ENV_PLACEHOLDERS.CONVEX_URL}`);
  }
  base.push("TRUSTED_PROXY=false");
  base.push("");
  base.push("# OAuth — optional, set to enable social login (google, github)");
  base.push(`GOOGLE_CLIENT_ID=${ENV_PLACEHOLDERS.GOOGLE_CLIENT_ID}`);
  base.push(`GOOGLE_CLIENT_SECRET=${ENV_PLACEHOLDERS.GOOGLE_CLIENT_SECRET}`);
  base.push(`GITHUB_CLIENT_ID=${ENV_PLACEHOLDERS.GITHUB_CLIENT_ID}`);
  base.push(`GITHUB_CLIENT_SECRET=${ENV_PLACEHOLDERS.GITHUB_CLIENT_SECRET}`);
  return base;
}
export function coreEnvLocalLines(
  projectName: string,
  secrets: RootSecrets,
  database?: DatabaseVal | string,
  audience: EnvAudience = DEFAULT_AUDIENCE,
): string[] {
  const base = [
    `BETTER_AUTH_SECRET=${secrets.authSecret}`,
    "BETTER_AUTH_URL=http://localhost:3000",
    ...publicVarLines(audience, "APP_URL", "http://localhost:3000"),
    ...publicVarLines(audience, "API_URL", "http://localhost:3000"),
    `APP_NAME=${projectName}`,
  ];
  const db = (database as DatabaseVal) ?? "postgres";
  if (db === "convex") {
    base.push(...convexLocalLinesFull(audience));
  } else if (db === "none") {
    base.push("# Database disabled (--database none)");
  } else {
    base.push(...postgresLocalLines(projectName, secrets));
  }
  base.push("TRUSTED_PROXY=false");
  base.push("");
  base.push("# OAuth — optional, set to enable social login (google, github)");
  base.push(`GOOGLE_CLIENT_ID=${ENV_PLACEHOLDERS.GOOGLE_CLIENT_ID}`);
  base.push(`GOOGLE_CLIENT_SECRET=${ENV_PLACEHOLDERS.GOOGLE_CLIENT_SECRET}`);
  base.push(`GITHUB_CLIENT_ID=${ENV_PLACEHOLDERS.GITHUB_CLIENT_ID}`);
  base.push(`GITHUB_CLIENT_SECRET=${ENV_PLACEHOLDERS.GITHUB_CLIENT_SECRET}`);
  return base;
}

export function convexEnvExampleLines(): string[] {
  return [
    "# Convex deployment",
    `CONVEX_DEPLOYMENT=${ENV_PLACEHOLDERS.CONVEX_DEPLOYMENT}`,
    `CONVEX_URL=${ENV_PLACEHOLDERS.CONVEX_URL}`,
    `NEXT_PUBLIC_CONVEX_URL=${ENV_PLACEHOLDERS.NEXT_PUBLIC_CONVEX_URL}`,
    `CONVEX_SITE_URL=${ENV_PLACEHOLDERS.CONVEX_SITE_URL}`,
    `SITE_URL=${ENV_PLACEHOLDERS.SITE_URL}`,
  ];
}
export function convexEnvLocalLines(): string[] {
  return [
    "# Convex deployment — generated by `npx convex dev`",
    `CONVEX_DEPLOYMENT=dev:example-123`,
    `CONVEX_URL=https://example-123.convex.cloud`,
    `NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud`,
    "VITE_CONVEX_URL=https://example-123.convex.cloud",
    "EXPO_PUBLIC_CONVEX_URL=https://example-123.convex.cloud",
    `CONVEX_SITE_URL=https://example-123.convex.site`,
    `SITE_URL=http://localhost:3000`,
  ];
}
export function resendExampleLines(projectName: string): string[] {
  return [
    `RESEND_API_KEY=${ENV_PLACEHOLDERS.RESEND_API_KEY}`,
    "EMAIL_FROM=noreply@example.com",
    `EMAIL_FROM_NAME=${projectName}`,
    "",
  ];
}
export function resendLocalLines(projectName: string, secrets: RootSecrets): string[] {
  return [
    // Resend issues this key — fall back to the placeholder rather than inventing
    // one, so an unconfigured project fails loudly at the vendor boundary.
    `RESEND_API_KEY=${secrets.resendApiKey ?? ENV_PLACEHOLDERS.RESEND_API_KEY}`,
    "EMAIL_FROM=noreply@example.com",
    `EMAIL_FROM_NAME=${projectName}`,
    "",
  ];
}
