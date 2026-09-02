import type { ResolvedProjectConfig } from "../domain/project/config.js";

const CORE_ENVIRONMENT_KEYS = new Set([
  "NODE_ENV",
  "RUNTIME",
  "APP_NAME",
  "SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "VITE_APP_URL",
  "EXPO_PUBLIC_APP_URL",
  "DESKTOP_API_URL",
  "NEXT_PUBLIC_*",
  "VITE_*",
  "EXPO_PUBLIC_*",
  "DESKTOP_*",
  "ELECTRON_*",
  "ELECTRON_IS_DEV",
]);

function hasTarget(config: ResolvedProjectConfig, target: string): boolean {
  return config.apps.some((app) => app.target === target);
}

function targetConsumesEnvironmentKey(key: string, config: ResolvedProjectConfig): boolean {
  if (key.startsWith("NEXT_PUBLIC_")) return hasTarget(config, "nextjs");
  if (key.startsWith("VITE_")) {
    return hasTarget(config, "tanstack-start") || hasTarget(config, "electron");
  }
  if (key.startsWith("EXPO_PUBLIC_")) return hasTarget(config, "expo");
  if (key.startsWith("DESKTOP_") || key.startsWith("ELECTRON_")) {
    return hasTarget(config, "electron");
  }
  return true;
}

function environmentKeyIsEnabled(key: string, config: ResolvedProjectConfig): boolean {
  const capabilities = config.capabilities;
  const upper = key.toUpperCase();
  if (!targetConsumesEnvironmentKey(upper, config)) return false;
  const provider = (["stripe", "chargily", "paddle", "polar"] as const).find((candidate) =>
    upper.includes(candidate.toUpperCase()),
  );
  if (provider) {
    return capabilities.billing.enabled && capabilities.billing.providers.includes(provider);
  }
  if (upper === "MAINTENANCE_MODE" || upper === "MAINTENANCE_BYPASS_TOKEN") {
    return hasTarget(config, "nextjs");
  }
  if (CORE_ENVIRONMENT_KEYS.has(upper)) return true;
  if (upper === "BETTER_AUTH_SECRET") {
    return capabilities.auth || capabilities.featureFlags.enabled;
  }
  if (
    upper.includes("BETTER_AUTH") ||
    upper.includes("GITHUB") ||
    upper.includes("GOOGLE") ||
    upper === "TRUSTED_PROXY"
  ) {
    return capabilities.auth;
  }
  if (upper.includes("POSTGRES") || upper.startsWith("DATABASE_")) {
    return config.backend !== false && config.backend.database === "postgres";
  }
  if (upper.includes("CONVEX")) {
    return config.backend !== false && config.backend.database === "convex";
  }
  if (upper.includes("RESEND") || upper.startsWith("EMAIL_")) return capabilities.email;
  if (upper === "AI_GATEWAY_API_KEY" || upper.startsWith("EVE_")) return capabilities.eve;
  if (upper === "NOTIFICATION_TOKEN_ENCRYPTION_KEY") return capabilities.notifications;
  if (upper.startsWith("JOB_")) return capabilities.jobs.enabled;
  if (
    /^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)POSTHOG_/.test(upper) ||
    /^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)?ANALYTICS_DISABLED$/.test(upper)
  ) {
    return capabilities.analytics || capabilities.featureFlags.enabled;
  }
  if (upper.includes("POSTHOG") || upper === "FEATURE_FLAG_TIMEOUT_MS") {
    return capabilities.analytics || capabilities.featureFlags.enabled;
  }
  if (upper.includes("UPSTASH") || upper.includes("REDIS")) {
    return capabilities.cache.enabled || (capabilities.auth && capabilities.transport);
  }
  if (upper.startsWith("STORAGE_") || upper.startsWith("S3_") || upper === "UPLOADS_DIR") {
    return capabilities.storage || capabilities.messaging;
  }
  if (upper.includes("_WS_") || upper === "WS_URL") return capabilities.messaging;
  if (upper.includes("API_URL")) return capabilities.transport;
  throw new Error(
    `[ghostinit] Generated environment key ${key} has no capability or target ownership rule`,
  );
}

function filterLines(content: string, keep: (line: string) => boolean): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  return content.split(/\r?\n/).filter(keep).join(newline);
}

function sanitizeDotenv(content: string, config: ResolvedProjectConfig): string {
  return filterLines(content, (line) => {
    const key = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1];
    return key === undefined || environmentKeyIsEnabled(key, config);
  });
}

function removeUnusedNamedImport(
  content: string,
  moduleName: string,
  binding: string,
  usage: RegExp,
): string {
  const escapedModule = moduleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^import\\s*\\{([^}]*)\\}\\s*from\\s*(["'])${escapedModule}\\2;?\\r?\\n?`,
    "m",
  );
  const match = pattern.exec(content);
  if (!match) return content;
  const withoutImport = content.replace(pattern, "");
  usage.lastIndex = 0;
  if (usage.test(withoutImport)) return content;
  const specifiers = (match[1] ?? "")
    .split(",")
    .map((specifier) => specifier.trim())
    .filter(Boolean);
  const retained = specifiers.filter((specifier) => {
    const [imported, local] = specifier.split(/\s+as\s+/);
    return (local ?? imported) !== binding;
  });
  if (retained.length === 0) return withoutImport;
  const quote = match[2] ?? '"';
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  return content.replace(
    pattern,
    `import { ${retained.join(", ")} } from ${quote}${moduleName}${quote};${newline}`,
  );
}

function sanitizeConfigRuntime(content: string, config: ResolvedProjectConfig): string {
  const filtered = filterLines(content, (line) => {
    const key = /^\s*(?:readonly\s+)?([A-Z][A-Z0-9_]*)(?:\?)?:/.exec(line)?.[1];
    // `import.meta.env.DEV` is Vite runtime metadata, not an application
    // environment variable owned by a capability.
    return key === undefined || key === "DEV" || environmentKeyIsEnabled(key, config);
  });
  return removeUnusedNamedImport(filtered, "zod", "z", /\bz\s*\./g);
}

function sanitizeTurbo(content: string, config: ResolvedProjectConfig): string {
  const value = JSON.parse(content) as { globalEnv?: unknown } & Record<string, unknown>;
  if (Array.isArray(value.globalEnv)) {
    value.globalEnv = value.globalEnv.filter(
      (entry): entry is string =>
        typeof entry === "string" && environmentKeyIsEnabled(entry, config),
    );
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sanitizeTestEnvironment(content: string, config: ResolvedProjectConfig): string {
  let insideValues = false;
  return filterLines(content, (line) => {
    if (/^\s*const\s+testEnvironment\b/.test(line)) insideValues = true;
    if (!insideValues) return true;
    if (/^\s*};\s*$/.test(line)) {
      insideValues = false;
      return true;
    }
    const key = /^\s+([A-Z][A-Z0-9_]*)\s*:/.exec(line)?.[1];
    return key === undefined || environmentKeyIsEnabled(key, config);
  });
}

/** Apply one exhaustive environment-ownership policy across every legacy surface. */
export function sanitizeLegacyCapabilityEnvironment(
  path: string,
  content: string,
  config: ResolvedProjectConfig,
): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name === ".env" || name.startsWith(".env.")) return sanitizeDotenv(content, config);
  if (
    /^(?:packages\/config\/src|src\/lib\/env)\/(?:server-schema|server|next|vite|expo)\.ts$/.test(
      path,
    )
  ) {
    return sanitizeConfigRuntime(content, config);
  }
  if (path === "turbo.json") return sanitizeTurbo(content, config);
  if (path === "scripts/test-env.ts") return sanitizeTestEnvironment(content, config);
  return content;
}
