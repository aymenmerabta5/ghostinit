import { describe, expect, test } from "bun:test";
import type { BillingProviderName, FrameworkName } from "../../src/lib/addons.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const baseConfig = {
  name: "capability-ui",
  runtime: "bun" as const,
  version: "0.1.0",
  mode: "single" as const,
  database: "postgres" as const,
  apps: ["web"] as const,
  preset: "custom" as const,
  auth: true,
  api: true,
  email: false,
  analytics: true,
  features: [],
};

function generate(framework: FrameworkName, billing: BillingProviderName[]) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      ...baseConfig,
      framework,
      billing,
    }),
  );
}

function read(files: ReturnType<typeof generateProjectFiles>, path: string): string {
  return files.find((file) => file.path === path)?.content ?? "";
}

describe("single-mode capability-aware UI generation", () => {
  test("keeps the PostHog provider imports limited to the APIs it consumes", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const provider = read(
        generate(framework, []),
        "src/components/analytics/posthog-provider.tsx",
      );

      expect(provider, framework).toContain(
        'import { getPostHogClient, initPostHogClient, isAnalyticsEnabled } from "../../lib/analytics";',
      );
      expect(provider, framework).not.toContain("getAnalyticsConfig");
    }
  });

  test("omits multi-provider billing UI dependencies from every global-only panel", () => {
    for (const provider of ["stripe", "paddle", "polar"] as const) {
      const tabs = read(
        generate("nextjs", [provider]),
        "src/features/billing/components/billing-tabs.tsx",
      );

      expect(tabs, provider).toContain(
        `import { ${provider[0].toUpperCase()}${provider.slice(1)}Panel }`,
      );
      expect(tabs, provider).not.toContain("@/components/ui/badge");
      expect(tabs, provider).not.toContain("@/components/ui/alert");
      expect(tabs, provider).not.toContain("const hasGlobal");
      expect(tabs, provider).not.toContain("const hasChargily");
      expect(tabs, provider).not.toContain("useSurfaceTranslations");
      expect(tabs, provider).not.toContain("const t =");
    }
  });

  test("emits local-market and dual-market UI only for matching selections", () => {
    const chargilyOnly = read(
      generate("nextjs", ["chargily"]),
      "src/features/billing/components/billing-tabs.tsx",
    );
    expect(chargilyOnly).toContain('from "@/components/ui/alert"');
    expect(chargilyOnly).toContain("const isChargilyAlone");
    expect(chargilyOnly).toContain('t("algeriaMarketTitle")');
    expect(chargilyOnly).toContain('t("algeriaMarketDescription")');
    expect(chargilyOnly).toContain('import { useSurfaceTranslations } from "@/lib/translations";');
    expect(chargilyOnly).toContain('const t = useSurfaceTranslations("billing")');
    expect(chargilyOnly).not.toContain("@/components/ui/badge");
    expect(chargilyOnly).not.toContain("const hasGlobal");

    const dualMarket = read(
      generate("nextjs", ["chargily", "stripe"]),
      "src/features/billing/components/billing-tabs.tsx",
    );
    expect(dualMarket).toContain('from "@/components/ui/badge"');
    expect(dualMarket).toContain("const hasGlobal");
    expect(dualMarket).toContain('t("dualMarketTitle")');
    expect(dualMarket).toContain('t("dualMarketDescription", { providers:');
  });
});
