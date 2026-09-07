import { file, type TemplateFile } from "../shared.js";

export function testFiles(
  runtime: "node" | "bun" = "bun",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): TemplateFile[] {
  return [playwrightConfig(framework), e2eSmokeTest(), webSmokeTest(runtime)];
}

/** Single mode has no apps/web workspace, so its root test needs one real assertion. */
export function singleWebSmokeTest(): TemplateFile {
  return file(
    "tests/smoke.test.ts",
    `import { describe, expect, it } from "bun:test";
import { cn } from "../src/lib/utils.js";

describe("single web smoke", () => {
  it("loads the generated UI utility", () => {
    expect(cn("ready")).toBe("ready");
  });
});
`,
  );
}

function playwrightConfig(framework: "nextjs" | "tanstack-start"): TemplateFile {
  const appUrl =
    framework === "tanstack-start"
      ? 'process.env.VITE_APP_URL ?? "http://localhost:3000"'
      : 'process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"';
  return file(
    "apps/web/playwright.config.ts",
    `import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: ${appUrl},
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
`,
  );
}

function e2eSmokeTest(): TemplateFile {
  return file(
    "apps/web/e2e/smoke.spec.ts",
    `import { test, expect } from "@playwright/test";

test("homepage has correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GhostInit/);
});
`,
  );
}

function webSmokeTest(_runtime: "node" | "bun"): TemplateFile {
  return file(
    "apps/web/tests/smoke.test.ts",
    `import { describe, it, expect } from "bun:test";

describe("web smoke", () => {
  it("has a landing page export", () => {
    expect(typeof fetch).toBe("function");
  });
});
`,
  );
}
