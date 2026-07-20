import { describe, it, expect } from "bun:test";
import { monorepoFiles } from "../../src/templates/modes/monorepo/index.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";

describe("web+mobile generation RNR+Uniwind - shared theme single source", () => {
  it("generates shared theme, global.css, babel metro with uniwind, RNR components", () => {
    const config = {
      name: "demo",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      billing: [],
      features: [],
      apps: ["web", "mobile"],
    } as unknown as ProjectConfig;
    const files = monorepoFiles(config, {}, { dryRun: false });
    const paths = files.map((f) => f.path);

    // Shared theme single source
    expect(paths).toContain("packages/ui/src/theme.css");
    expect(paths).toContain("apps/web/src/app/globals.css");
    expect(paths).toContain("apps/mobile/global.css");
    expect(paths).toContain("apps/mobile/babel.config.js");
    expect(paths).toContain("apps/mobile/metro.config.js");
    expect(paths).toContain("apps/mobile/src/lib/utils.ts");
    expect(paths).toContain("apps/mobile/src/components/ui/button.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/text.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/card.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/input.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/badge.tsx");
    expect(paths).toContain("apps/web/src/components/ui/button.tsx");

    const theme = files.find((f) => f.path === "packages/ui/src/theme.css")?.content ?? "";
    expect(theme).toContain("oklch");
    expect(theme).toContain("--background");
    expect(theme).toContain("@theme inline");

    const webGlobal = files.find((f) => f.path === "apps/web/src/app/globals.css")?.content ?? "";
    expect(webGlobal).toContain('@import "@repo/ui/theme.css"');
    expect(webGlobal).toContain('@import "tailwindcss"');

    const mobileGlobal = files.find((f) => f.path === "apps/mobile/global.css")?.content ?? "";
    expect(mobileGlobal).toContain('@import "@repo/ui/theme.css"');
    expect(mobileGlobal).toContain('@import "tailwindcss"');
    expect(mobileGlobal).toContain('@import "uniwind"');
    expect(mobileGlobal).toContain("@source");

    const babel = files.find((f) => f.path === "apps/mobile/babel.config.js")?.content ?? "";
    expect(babel).toContain("uniwind/babel");
    expect(babel).toContain("cssEntryFile");
    expect(babel).toContain("global.css");
    expect(babel.indexOf("uniwind")).toBeLessThan(babel.indexOf("babel-preset-expo"));

    const metro = files.find((f) => f.path === "apps/mobile/metro.config.js")?.content ?? "";
    expect(metro).toContain("withUniwindConfig");
    expect(metro).toContain("global.css");
    expect(metro).toContain("dtsFile");

    const marketing =
      files.find((f) => f.path.includes("apps/mobile") && f.path.includes("index.tsx"))?.content ??
      "";
    expect(marketing).toContain("components/ui/button");
    expect(marketing).toContain("className");
    expect(marketing.includes("StyleSheet.create")).toBe(false);
    expect(marketing.includes("#111827")).toBe(false);

    const dashboard =
      files.find((f) => f.path.includes("apps/mobile") && f.path.includes("dashboard"))?.content ??
      "";
    expect(dashboard).toContain("bg-background");
    expect(dashboard.includes("StyleSheet.create")).toBe(false);
  });
});
