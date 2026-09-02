/**
 * Chargily client init — server-only guard + env + config.
 */
import { ChargilyClient } from "@chargily/chargily-pay";
import { randomUUID } from "node:crypto";
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
  if (
    Reflect.get(globalThis, "window") !== undefined ||
    Reflect.get(globalThis, "document") !== undefined
  ) {
    throw new Error("CHARGILY_SERVER_ONLY: @chargily/chargily-pay must ONLY be used server-side.");
  }
}

function getEnvValue(key: string, fallback?: string): string | undefined {
  try {
    return typeof process === "undefined" ? fallback : (process.env[key] ?? fallback);
  } catch {
    return fallback;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function resolveChargilyConfig(config?: ChargilyProviderConfig | Record<string, unknown>) {
  const cfg = config ?? {};
  const apiKey =
    optionalString(cfg.apiKey) ??
    optionalString(cfg.CHARGILY_API_KEY) ??
    optionalString(cfg.chargilyApiKey) ??
    getEnvValue("CHARGILY_API_KEY") ??
    "";
  const secretKey =
    optionalString(cfg.secretKey) ??
    optionalString(cfg.webhookSecret) ??
    optionalString(cfg.CHARGILY_SECRET_KEY) ??
    getEnvValue("CHARGILY_SECRET_KEY") ??
    getEnvValue("CHARGILY_WEBHOOK_SECRET") ??
    "";
  const modeRaw =
    optionalString(cfg.mode) ??
    optionalString(cfg.CHARGILY_MODE) ??
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
  if (!apiKey || apiKey.startsWith("REPLACE_WITH") || apiKey === "test_placeholder_key") {
    throw new Error(
      "CHARGILY_API_KEY missing or placeholder. Set a real key in .env.local server-only.",
    );
  }
  return new ChargilyClient({ api_key: apiKey, mode });
}

export function genId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
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
      return "incomplete";
  }
}

export { getEnvValue };
