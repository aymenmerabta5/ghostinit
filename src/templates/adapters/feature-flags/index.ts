import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { postHogFeatureFlagAdapterContent } from "./posthog.js";

export interface FeatureFlagAdapterRenderOptions {
  mode: ProjectMode;
}

function adapterPath(mode: ProjectMode): string {
  return mode === "monorepo"
    ? "packages/services/src/feature-flags/posthog.ts"
    : "src/server/services/feature-flags/posthog.ts";
}

export function featureFlagAdapterFiles({ mode }: FeatureFlagAdapterRenderOptions): TemplateFile[] {
  return [file(adapterPath(mode), postHogFeatureFlagAdapterContent(mode))];
}

export const FEATURE_FLAG_ADAPTER_ENV = Object.freeze({
  POSTHOG_API_KEY: {
    exampleLine: "POSTHOG_API_KEY=phc_REPLACE_WITH_POSTHOG_KEY",
    serverSchemaLine: "POSTHOG_API_KEY: z.string().min(1)",
    runtimeLine: "POSTHOG_API_KEY: process.env.POSTHOG_API_KEY",
    turboGlobalEnv: "POSTHOG_API_KEY",
    policy: "required server-side PostHog project key; never invent a value",
  },
  POSTHOG_HOST: {
    exampleLine: "POSTHOG_HOST=https://us.i.posthog.com",
    serverSchemaLine: "POSTHOG_HOST: z.string().url()",
    runtimeLine: "POSTHOG_HOST: process.env.POSTHOG_HOST",
    turboGlobalEnv: "POSTHOG_HOST",
  },
  FEATURE_FLAG_TIMEOUT_MS: {
    exampleLine: "FEATURE_FLAG_TIMEOUT_MS=2500",
    serverSchemaLine:
      "FEATURE_FLAG_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2500)",
    runtimeLine: "FEATURE_FLAG_TIMEOUT_MS: process.env.FEATURE_FLAG_TIMEOUT_MS",
    turboGlobalEnv: "FEATURE_FLAG_TIMEOUT_MS",
  },
});

export interface FeatureFlagAdapterIntegrationGuide {
  compositionImports: readonly string[];
  compositionFactory: string;
  dependencies: Readonly<Record<string, string>>;
  environment: typeof FEATURE_FLAG_ADAPTER_ENV;
  securityInvariant: string;
}

export function featureFlagAdapterIntegrationGuide({
  mode,
}: FeatureFlagAdapterRenderOptions): FeatureFlagAdapterIntegrationGuide {
  const path =
    mode === "monorepo"
      ? "@repo/services/feature-flags/posthog"
      : "@/server/services/feature-flags/posthog";
  return {
    compositionImports: [
      `import { createAuthenticatedFeatureFlagSubject, createPostHogFeatureFlagAdapter } from "${path}";`,
    ],
    compositionFactory:
      "createPostHogFeatureFlagAdapter({ apiKey: env.POSTHOG_API_KEY, host: env.POSTHOG_HOST, timeoutMs: env.FEATURE_FLAG_TIMEOUT_MS })",
    dependencies: {},
    environment: FEATURE_FLAG_ADAPTER_ENV,
    securityInvariant:
      "Build subjects from the authenticated server session or a verified signed anonymous cookie; remote flags never authorize access.",
  };
}
