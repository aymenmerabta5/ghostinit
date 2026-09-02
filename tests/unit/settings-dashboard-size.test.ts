import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { analyzeProject } from "../../src/lib/architecture";
import type { ProjectConfig } from "../../src/lib/config";
import { generateProjectFiles } from "../../src/templates/default";

function config(mode: "monorepo" | "single", api = true): ProjectConfig {
  return {
    name: "settings-size",
    runtime: "bun",
    version: "0.1.0",
    mode,
    preset: "custom",
    billing: [],
    features: [],
    database: "postgres",
    framework: "tanstack-start",
    apps: ["web"],
    auth: true,
    api,
    email: true,
  };
}

function lineCount(content: string): number {
  return content.split(/\r?\n/).length;
}

function formattedLineCount(path: string, content: string): number {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
}

describe("generated settings and single-dashboard file budgets", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} TanStack settings uses small cohesive feature files`, () => {
      const root = mode === "monorepo" ? "apps/web/src" : "src";
      const files = generateProjectFiles(config(mode), { dryRun: false });
      const settings = files.filter(
        ({ path }) =>
          path === `${root}/routes/settings.tsx` || path.startsWith(`${root}/features/settings/`),
      );
      expect(settings.map(({ path }) => path).sort()).toEqual(
        [
          `${root}/features/settings/danger-zone-section.tsx`,
          `${root}/features/settings/mutations.ts`,
          `${root}/features/settings/passkey-card.tsx`,
          `${root}/features/settings/passkey-list.tsx`,
          `${root}/features/settings/password-card.tsx`,
          `${root}/features/settings/profile-card.tsx`,
          `${root}/features/settings/queries.ts`,
          `${root}/features/settings/schema.ts`,
          `${root}/features/settings/security-navigation-section.tsx`,
          `${root}/features/settings/session-list.tsx`,
          `${root}/features/settings/sessions-card.tsx`,
          `${root}/features/settings/settings-controller.tsx`,
          `${root}/features/settings/two-factor-card.tsx`,
          `${root}/features/settings/types.ts`,
          `${root}/features/settings/use-two-factor-settings.ts`,
          `${root}/routes/settings.tsx`,
        ].sort(),
      );
      for (const generated of settings) {
        const limit = generated.path.endsWith("/routes/settings.tsx") ? 120 : 150;
        expect(
          formattedLineCount(generated.path, generated.content),
          generated.path,
        ).toBeLessThanOrEqual(limit);
        expect(generated.content, generated.path).not.toContain("@allow-long");
        expect(parseSync(generated.path, generated.content).errors, generated.path).toEqual([]);
      }
      const route = settings.find(({ path }) => path.endsWith("/routes/settings.tsx"))!.content;
      const controller = settings.find(({ path }) =>
        path.endsWith("/settings-controller.tsx"),
      )!.content;
      const passkeyCard = settings.find(({ path }) => path.endsWith("/passkey-card.tsx"))!.content;
      const sessionList = settings.find(({ path }) => path.endsWith("/session-list.tsx"))!.content;
      expect(route).toContain('from "@/features/settings/settings-controller"');
      expect(route).not.toContain("useAppForm({");
      expect(route).not.toContain("identityClient.");
      expect(controller).toContain('import { PasskeyCard } from "./passkey-card"');
      expect(controller).toContain("<PasskeyCard />");
      expect(passkeyCard).toContain('from "./passkey-list"');
      expect(sessionList).toContain("userAgent?: string | null");
      expect(sessionList).toContain("ipAddress?: string | null");
    });

    test(`${mode} API-disabled settings omits the session transport slice`, () => {
      const root = mode === "monorepo" ? "apps/web/src" : "src";
      const files = generateProjectFiles(config(mode, false), { dryRun: false });
      expect(files.some(({ path }) => path === `${root}/features/settings/sessions-card.tsx`)).toBe(
        false,
      );
      expect(files.some(({ path }) => path === `${root}/features/settings/session-list.tsx`)).toBe(
        false,
      );
      expect(
        files.find(({ path }) => path === `${root}/features/settings/queries.ts`)?.content,
      ).not.toContain("@/lib/orpc");
      expect(
        files.find(({ path }) => path === `${root}/routes/settings.tsx`)?.content,
      ).not.toContain("SessionsCard");
    });
  }

  test("single TanStack dashboard delegates to bounded feature components", () => {
    const files = generateProjectFiles(config("single"), { dryRun: false });
    const dashboard = files.filter(
      ({ path }) =>
        path === "src/routes/dashboard.tsx" || path.startsWith("src/features/dashboard/"),
    );
    expect(dashboard).toHaveLength(4);
    for (const generated of dashboard) {
      const limit = generated.path === "src/routes/dashboard.tsx" ? 120 : 150;
      expect(lineCount(generated.content), generated.path).toBeLessThanOrEqual(limit);
      expect(parseSync(generated.path, generated.content).errors, generated.path).toEqual([]);
    }
    const route = dashboard.find(({ path }) => path === "src/routes/dashboard.tsx")!.content;
    expect(route).toContain('from "@/features/dashboard/dashboard-overview"');
    expect(route).not.toContain("useSurfaceTranslations");
  });

  test("monorepo TanStack dashboard delegates to bounded control-plane sections", () => {
    const files = generateProjectFiles(config("monorepo"), { dryRun: false });
    const dashboard = files.filter(
      ({ path }) =>
        path === "apps/web/src/routes/dashboard.tsx" ||
        path.startsWith("apps/web/src/features/dashboard/"),
    );
    expect(dashboard).toHaveLength(11);
    for (const generated of dashboard) {
      const orchestrator =
        generated.path.endsWith("/routes/dashboard.tsx") ||
        generated.path.endsWith("/dashboard-view.tsx") ||
        generated.path.endsWith("/architecture-status.tsx") ||
        generated.path.endsWith("/identity-actions.tsx");
      expect(lineCount(generated.content), generated.path).toBeLessThanOrEqual(
        orchestrator ? 120 : 150,
      );
      expect(generated.content, generated.path).not.toContain("@allow-long");
      expect(parseSync(generated.path, generated.content).errors, generated.path).toEqual([]);
    }
    const route = dashboard.find(
      ({ path }) => path === "apps/web/src/routes/dashboard.tsx",
    )!.content;
    expect(route).toContain('from "@/features/dashboard/dashboard-view"');
    expect(route).not.toContain("useSurfaceTranslations");
  });

  test("monorepo Next dashboard delegates to the bounded control-plane sections", () => {
    const files = generateProjectFiles(
      { ...config("monorepo"), framework: "nextjs" },
      { dryRun: false },
    );
    const dashboard = files.filter(
      ({ path }) =>
        path === "apps/web/src/app/dashboard/page.tsx" ||
        path.startsWith("apps/web/src/features/dashboard/"),
    );
    expect(dashboard).toHaveLength(11);
    for (const generated of dashboard) {
      const orchestrator =
        generated.path.endsWith("/app/dashboard/page.tsx") ||
        generated.path.endsWith("/dashboard-view.tsx") ||
        generated.path.endsWith("/architecture-status.tsx") ||
        generated.path.endsWith("/identity-actions.tsx");
      expect(lineCount(generated.content), generated.path).toBeLessThanOrEqual(
        orchestrator ? 120 : 150,
      );
      expect(parseSync(generated.path, generated.content).errors, generated.path).toEqual([]);
      expect(generated.content, generated.path).not.toContain("@tanstack/react-router");
      expect(generated.content, generated.path).not.toContain("<Link to=");
    }
    const page = dashboard.find(
      ({ path }) => path === "apps/web/src/app/dashboard/page.tsx",
    )!.content;
    expect(page).toContain('from "@/features/dashboard/dashboard-view"');
    expect(page).toContain('redirect("/sign-in")');
  });

  test("TanStack settings keeps remote clients only in root data adapters", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ghostinit-settings-architecture-"));
    try {
      const files = generateProjectFiles(config("single"), { dryRun: false }).filter(
        ({ path }) =>
          path === "src/routes/settings.tsx" || path.startsWith("src/features/settings/"),
      );
      for (const generated of files) {
        const absolute = join(projectRoot, ...generated.path.split("/"));
        mkdirSync(join(absolute, ".."), { recursive: true });
        writeFileSync(absolute, generated.content);
      }
      const findings = await analyzeProject(projectRoot);
      expect(
        findings.filter(
          ({ file, id }) =>
            file.includes("features/settings") &&
            [
              "feature-imports-data-access-outside-adapter",
              "feature-presentation-imports-data-access",
              "client-imports-server-only",
            ].includes(id),
        ),
      ).toEqual([]);

      const adapters = files
        .filter(({ path }) => /features\/settings\/(?:queries|mutations)\.ts$/.test(path))
        .map(({ content }) => content)
        .join("\n");
      expect(adapters).toContain('from "@/lib/auth-client"');
      expect(adapters).toContain('from "@/lib/orpc"');
      for (const generated of files.filter(({ path }) => path.endsWith(".tsx"))) {
        expect(generated.content, generated.path).not.toMatch(
          /from "@(?:tanstack\/react-query|\/lib\/(?:auth-client|orpc))"/,
        );
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
