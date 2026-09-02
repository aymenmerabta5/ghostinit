import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";

function generateDesktop(mode: Mode): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `desktop-button-${mode}`,
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: "nextjs",
      database: "postgres",
      apps: ["desktop"],
      preset: "saas",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: true,
      analytics: false,
      eve: false,
      i18n: false,
      pdf: false,
      billing: [],
      features: [],
      messaging: false,
      storage: false,
      notifications: false,
      featureFlags: "none",
      jobs: false,
    } satisfies ProjectConfig),
    { dryRun: true },
  );
}

function source(files: readonly TemplateFile[], path: string): string {
  const match = files.find((candidate) => candidate.path === path);
  expect(match, `missing generated file: ${path}`).toBeDefined();
  return match?.content ?? "";
}

function declaredVariants(button: string): ReadonlySet<string> {
  const block = /variant:\s*\{([\s\S]*?)\n\s*\},\n\s*size:/.exec(button)?.[1];
  expect(block, "button variant block").toBeDefined();
  return new Set(
    [...(block ?? "").matchAll(/^\s*([a-z][a-zA-Z]*):/gm)].map((match) => match[1] ?? ""),
  );
}

describe("generated desktop Button variants", () => {
  test("types and styles every destructive identity action in monorepo and single output", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateDesktop(mode);
      const appRoot = mode === "monorepo" ? "apps/desktop/" : "";
      const componentRoot =
        mode === "monorepo" ? `${appRoot}src/renderer/components/ui` : "src/components/ui";
      const buttonPath = `${componentRoot}/button.tsx`;
      const workspacePath = `${appRoot}src/renderer/routes/workspace.tsx`;
      const settingsPath = `${appRoot}src/renderer/routes/settings.tsx`;
      const button = source(files, buttonPath);
      const workspace = source(files, workspacePath);
      const settings = source(files, settingsPath);

      for (const [path, content] of [
        [buttonPath, button],
        [workspacePath, workspace],
        [settingsPath, settings],
      ] as const) {
        expect(parseSync(path, content).errors, path).toEqual([]);
      }

      expect(button).toContain("VariantProps<typeof buttonVariants>");
      expect(button).toContain(
        'destructive: "border border-destructive/50 bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"',
      );

      const variants = declaredVariants(button);
      const usedVariants = [...`${workspace}\n${settings}`.matchAll(/\bvariant="([a-z-]+)"/g)];
      for (const match of usedVariants) {
        expect(
          variants.has(match[1] ?? ""),
          `${mode}: unsupported Button variant ${match[1]}`,
        ).toBe(true);
      }

      expect(
        workspace.match(/<Button\b[^>]*\bvariant="destructive"/g),
        `${mode}: workspace sites`,
      ).toHaveLength(2);
      expect(
        settings.match(/<Button\b[^>]*\bvariant="destructive"/g),
        `${mode}: settings sites`,
      ).toHaveLength(2);
      expect(workspace).toContain(
        'variant="destructive" disabled={pending || !activeOrganizationId} onClick={() => activeOrganizationId && void run(() => removeMember.mutateAsync',
      );
      expect(workspace).toContain(
        'variant="destructive" disabled={pending} onClick={() => void run(() => cancelInvitation.mutateAsync',
      );
      expect(settings).toContain(
        'variant="destructive" disabled={!twoFactorPassword} onClick={() => void run(async () => { const result = await authClient.twoFactor.disable',
      );
      expect(settings).toContain(
        'variant="destructive" disabled={!deletePassword} onClick={() => void run(async () => { const result = await authClient.deleteUser',
      );
    }
  });
});
