/**
 * Paddle client init — MoR 5%+50c.
 */
export type PaddleConfig = {
  apiKey?: string;
  webhookSecret?: string;
  environment?: "sandbox" | "production";
};

function getEnv(key: string, fallback?: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) return process.env[key];
  } catch {}
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string> } };
    const v = g.process?.env?.[key];
    if (v) return v;
  } catch {}
  return fallback;
}

export function resolvePaddleConfig(config?: Record<string, unknown>): PaddleConfig {
  const cfg = (config ?? {}) as PaddleConfig & Record<string, unknown>;
  return {
    apiKey: (cfg.apiKey as string) ?? getEnv("PADDLE_API_KEY") ?? "",
    webhookSecret: (cfg.webhookSecret as string) ?? getEnv("PADDLE_WEBHOOK_SECRET") ?? "",
    environment:
      (cfg.environment as PaddleConfig["environment"]) ??
      (getEnv("PADDLE_ENVIRONMENT") as PaddleConfig["environment"]) ??
      "sandbox",
  };
}

export async function getPaddleClient(paddleConfig: PaddleConfig) {
  // @ts-ignore - optional dep
  const { Paddle, Environment } = await import("@paddle/paddle-node-sdk");
  const env =
    paddleConfig.environment === "production" ? Environment.production : Environment.sandbox;
  if (!paddleConfig.apiKey || paddleConfig.apiKey.startsWith("REPLACE_WITH")) {
    if (getEnv("NODE_ENV") === "production") {
      throw new Error("Paddle: PADDLE_API_KEY missing or placeholder.");
    }
  }
  return new Paddle(paddleConfig.apiKey || "pdl_test_apikey_placeholder", { environment: env });
}

export { getEnv };
