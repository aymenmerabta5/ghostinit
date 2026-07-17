import { file, type TemplateFile } from "../shared.js";

export function testFiles(_runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [playwrightConfig(), e2eSmokeTest(), webSmokeTest(_runtime)];
}

function playwrightConfig(): TemplateFile {
  return file(
    "apps/web/playwright.config.ts",
    `import { defineConfig, devices } from "@playwright/test";\n\nexport default defineConfig({\n  testDir: "./e2e",\n  fullyParallel: true,\n  forbidOnly: !!process.env.CI,\n  retries: process.env.CI ? 2 : 0,\n  workers: process.env.CI ? 1 : undefined,\n  reporter: "list",\n  use: {\n    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",\n    trace: "on-first-retry",\n  },\n  projects: [\n    { name: "chromium", use: { ...devices["Desktop Chrome"] } },\n  ],\n});\n`,
  );
}

function e2eSmokeTest(): TemplateFile {
  return file(
    "apps/web/e2e/smoke.spec.ts",
    `import { test, expect } from "@playwright/test";\n\ntest("homepage has correct title", async ({ page }) => {\n  await page.goto("/");\n  await expect(page).toHaveTitle(/GhostInit/);\n});\n`,
  );
}

function webSmokeTest(runtime: "node" | "bun"): TemplateFile {
  return file(
    "apps/web/tests/smoke.test.ts",
    runtime === "bun"
      ? `import { describe, it, expect } from "bun:test";\n\ndescribe("web smoke", () => {\n  it("has a landing page export", () => {\n    expect(typeof fetch).toBe("function");\n  });\n});\n`
      : `import { describe, it, expect } from "vitest";\n\ndescribe("web smoke", () => {\n  it("has a landing page export", () => {\n    expect(typeof fetch).toBe("function");\n  });\n});\n`,
  );
}
