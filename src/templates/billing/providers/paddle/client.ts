/**
 * Paddle client init — MoR 5%+50c.
 */
export type PaddleConfig = {
  apiKey?: string;
  webhookSecret?: string;
  environment?: "sandbox" | "production";
};

export type PaddleSubscriptionStatus = "active" | "canceled" | "past_due" | "paused" | "trialing";

export interface PaddleCollection<T> extends AsyncIterable<T> {
  hasMore: boolean;
  next(): Promise<T[]>;
}

export interface PaddleCustomer {
  id: string;
  email?: string;
  customData?: Record<string, unknown> | null;
}

export interface PaddleSubscription {
  id: string;
  customData?: Record<string, unknown> | null;
  status?: PaddleSubscriptionStatus;
  currentBillingPeriod?: { endsAt?: string } | null;
  nextBilledAt?: string | null;
  items?: Array<{ price?: { id?: string; productId?: string } }>;
  customerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PaddleTransaction {
  id: string;
  checkout?: { url?: string | null } | null;
  customData?: Record<string, unknown> | null;
}

interface PaddlePortalSession {
  urls?: { general?: { overview?: string } };
}

interface PaddleClient {
  customers: {
    create(input: {
      email: string;
      name?: string | null;
      customData?: Record<string, unknown> | null;
    }): Promise<PaddleCustomer>;
    list(input?: { email?: string[]; perPage?: number }): PaddleCollection<PaddleCustomer>;
  };
  subscriptions: {
    list(input?: {
      customerId?: string[];
      perPage?: number;
      status?: PaddleSubscriptionStatus[];
    }): PaddleCollection<PaddleSubscription>;
  };
  transactions: {
    create(input: {
      items: Array<{ priceId: string; quantity: number }>;
      customerId?: string;
      collectionMode: "automatic" | "manual";
      customData?: Record<string, unknown>;
    }): Promise<PaddleTransaction>;
    list(input?: { customerId?: string[]; perPage?: number }): PaddleCollection<PaddleTransaction>;
  };
  customerPortalSessions: {
    create(customerId: string, subscriptionIds: string[]): Promise<PaddlePortalSession>;
  };
  webhooks: {
    unmarshal(requestBody: string, secret: string, signature: string): Promise<unknown>;
  };
}

interface PaddleSdkModule {
  Paddle: new (apiKey: string, options: { environment: unknown }) => PaddleClient;
  Environment: { production: unknown; sandbox: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaddleSdkModule(value: unknown): value is PaddleSdkModule {
  if (!isRecord(value) || typeof value.Paddle !== "function" || !isRecord(value.Environment)) {
    return false;
  }
  return "production" in value.Environment && "sandbox" in value.Environment;
}

function getEnv(key: string, fallback?: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) return process.env[key];
  } catch {}
  try {
    const processValue: unknown = Reflect.get(globalThis, "process");
    if (!isRecord(processValue) || !isRecord(processValue.env)) return fallback;
    const value = processValue.env[key];
    if (typeof value === "string" && value) return value;
  } catch {}
  return fallback;
}

export function resolvePaddleConfig(config?: Record<string, unknown>): PaddleConfig {
  const apiKey = typeof config?.apiKey === "string" ? config.apiKey : undefined;
  const webhookSecret =
    typeof config?.webhookSecret === "string" ? config.webhookSecret : undefined;
  const configuredEnvironment =
    config?.environment === "production" || config?.environment === "sandbox"
      ? config.environment
      : undefined;
  const environmentValue = configuredEnvironment ?? getEnv("PADDLE_ENVIRONMENT");
  return {
    apiKey: apiKey ?? getEnv("PADDLE_API_KEY") ?? "",
    webhookSecret: webhookSecret ?? getEnv("PADDLE_WEBHOOK_SECRET") ?? "",
    environment: environmentValue === "production" ? "production" : "sandbox",
  };
}

export async function getPaddleClient(paddleConfig: PaddleConfig): Promise<PaddleClient> {
  const loadedModule: unknown = await import("@paddle/paddle-node-sdk");
  if (!isPaddleSdkModule(loadedModule)) {
    throw new Error("Paddle: SDK module has an unexpected shape.");
  }
  const { Paddle, Environment } = loadedModule;
  const env =
    paddleConfig.environment === "production" ? Environment.production : Environment.sandbox;
  if (
    !paddleConfig.apiKey ||
    paddleConfig.apiKey.startsWith("REPLACE_WITH") ||
    paddleConfig.apiKey === "pdl_test_apikey_placeholder"
  ) {
    throw new Error("Paddle: PADDLE_API_KEY missing or placeholder. Set a real key.");
  }
  return new Paddle(paddleConfig.apiKey, { environment: env });
}

export { getEnv };
