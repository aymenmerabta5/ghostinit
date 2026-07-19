/**
 * Chargily client init — server-only guard + env + config.
 */
// @ts-ignore - optional dep
import { ChargilyClient } from "@chargily/chargily-pay";
import type { SubscriptionStatus } from "../interface.js";

export type ChargilyMode = "test" | "live";

export interface ChargilyProviderConfig {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  mode?: ChargilyMode;
  CHARGILY_API_KEY?: string;
  CHARGILY_SECRET_KEY?: string;
  CHARGILY_MODE?: string;
  chargilyApiKey?: string;
}

export function ensureServerOnly(): void {
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  if (typeof g.window !== "undefined" || typeof g.document !== "undefined") {
    throw new Error("CHARGILY_SERVER_ONLY: @chargily/chargily-pay must ONLY be used server-side.");
  }
}

function getEnvValue(key: string, fallback?: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) return process.env[key] as string;
  } catch {}
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string> } };
    const v = g.process?.env?.[key];
    if (v) return v;
  } catch {}
  return fallback;
}

export function resolveChargilyConfig(config?: ChargilyProviderConfig | Record<string, unknown>) {
  const cfg = (config ?? {}) as ChargilyProviderConfig & Record<string, unknown>;
  const apiKey =
    (cfg.apiKey as string | undefined) ??
    (cfg.CHARGILY_API_KEY as string | undefined) ??
    (cfg.chargilyApiKey as string | undefined) ??
    getEnvValue("CHARGILY_API_KEY") ??
    "";
  const secretKey =
    (cfg.secretKey as string | undefined) ??
    (cfg.webhookSecret as string | undefined) ??
    (cfg.CHARGILY_SECRET_KEY as string | undefined) ??
    getEnvValue("CHARGILY_SECRET_KEY") ??
    getEnvValue("CHARGILY_WEBHOOK_SECRET") ??
    "";
  const modeRaw =
    (cfg.mode as string | undefined) ??
    (cfg.CHARGILY_MODE as string | undefined) ??
    getEnvValue("CHARGILY_MODE") ??
    "test";
  const mode: ChargilyMode = modeRaw === "live" ? "live" : "test";
  return { apiKey, secretKey, mode, getEnvValue };
}

export function getChargilyClient(
  config?: ChargilyProviderConfig | Record<string, unknown>,
): ChargilyClient {
  ensureServerOnly();
  const { apiKey, mode } = resolveChargilyConfig(config);
  if (!apiKey || apiKey.startsWith("REPLACE_WITH")) {
    if (getEnvValue("NODE_ENV") === "production") {
      throw new Error("CHARGILY_API_KEY missing. Set in .env.local server-only.");
    }
  }
  return new ChargilyClient({ api_key: apiKey || "test_placeholder_key", mode });
}

export function genId(prefix: string): string {
  try {
    const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID().slice(0, 8)}`;
  } catch {}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function mapChargilyStatusToDomain(status?: string): SubscriptionStatus {
  switch (status) {
    case "paid":
    case "completed":
      return "active";
    case "pending":
    case "processing":
    case "open":
      return "incomplete";
    case "failed":
      return "past_due";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "expired":
      return "expired";
    default:
      return "active";
  }
}

export { getEnvValue };
