import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { rnrDialogFiles } from "../../src/templates/apps/fragments/expo/rnr/dialog.js";
import { rnrTabsFiles } from "../../src/templates/apps/fragments/expo/rnr/tabs.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  const RAW_CONTROLS = new Set(["button", "input", "select", "textarea", "Pressable", "TextInput"]);
  const PRIMITIVE_CONTROL_ALLOWLIST: Readonly<Record<string, ReadonlySet<string>>> = {
    "button.tsx": new Set(["Pressable"]),
    "dialog.tsx": new Set(["Pressable"]),
    "input-group.tsx": new Set(["input", "textarea"]),
    "input.tsx": new Set(["input", "TextInput"]),
    "native-select.tsx": new Set(["select"]),
    "textarea.tsx": new Set(["textarea"]),
  };
  const EXTRACTED_NATIVE_PRIMITIVE_PATHS = new Set([
    "apps/mobile/src/components/ui/dialog-content.tsx",
    "apps/mobile/src/components/ui/tabs-trigger.tsx",
    "src/components/ui/dialog-content.tsx",
    "src/components/ui/tabs-trigger.tsx",
  ]);

  interface InventoryTarget {
    readonly label: string;
    readonly config: ProjectConfig;
  }

  function config(overrides: Partial<ProjectConfig>): ProjectConfig {
    return projectConfigSchema.parse({
      name: "raw-control-inventory",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      preset: "saas",
      cache: "redis",
      deploy: "none",
      auth: true,
      api: true,
      email: true,
      analytics: true,
      eve: true,
      i18n: true,
      pdf: true,
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
      billing: ["chargily", globalProvider],
      features: ["eve", "i18n"],
      database: "postgres",
      framework: "nextjs",
      apps: ["web", "mobile", "desktop"],
      ...overrides,
    });
  }

  const TARGETS: readonly InventoryTarget[] = [
    { label: "monorepo Next/Postgres all clients", config: config({}) },
    {
      label: "monorepo TanStack/Convex all clients",
      config: config({ framework: "tanstack-start", database: "convex" }),
    },
    {
      label: "single Next/Postgres web",
      config: config({ mode: "single", apps: ["web"] }),
    },
    {
      label: "single TanStack/Convex web",
      config: config({
        mode: "single",
        framework: "tanstack-start",
        database: "convex",
        apps: ["web"],
      }),
    },
    {
      label: "single desktop full capabilities",
      config: config({ mode: "single", apps: ["desktop"] }),
    },
    {
      label: "single desktop frontend-only",
      config: config({
        mode: "single",
        preset: "frontend",
        cache: "none",
        auth: false,
        api: false,
        email: false,
        analytics: false,
        eve: false,
        i18n: false,
        pdf: false,
        messaging: false,
        storage: false,
        notifications: false,
        featureFlags: "none",
        jobs: false,
        jobsUserFacingApi: false,
        billing: [],
        features: [],
        database: "none",
        apps: ["desktop"],
      }),
    },
  ];

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function primitiveAllows(path: string, control: string): boolean {
    if (EXTRACTED_NATIVE_PRIMITIVE_PATHS.has(path)) return control === "Pressable";
    if (!path.includes("/components/ui/")) return false;
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    return PRIMITIVE_CONTROL_ALLOWLIST[fileName]?.has(control) ?? false;
  }

  function rawControlDiagnostics(path: string, content: string): string[] {
    const parsed = parseSync(path, content);
    const diagnostics = parsed.errors.map((error) => `${path}: parse error: ${error.message}`);

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry);
        return;
      }
      if (!isObject(value)) return;
      if (value.type === "JSXOpeningElement" && isObject(value.name)) {
        const control = value.name.name;
        if (
          typeof control === "string" &&
          RAW_CONTROLS.has(control) &&
          !primitiveAllows(path, control)
        ) {
          const offset = typeof value.start === "number" ? value.start : 0;
          const line = content.slice(0, offset).split("\n").length;
          diagnostics.push(`${path}:${line}: raw <${control}> must use the shared UI primitive`);
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== "type" && key !== "start" && key !== "end") visit(child);
      }
    };

    if (parsed.errors.length === 0) visit(parsed.program);
    return diagnostics;
  }

  describe("generated raw interactive control inventory", () => {
    test("permits Pressable only at the reviewed extracted native primitive paths", () => {
      for (const root of ["apps/mobile/src", "src"]) {
        const primitives = [...rnrDialogFiles(root), ...rnrTabsFiles(root)].filter(({ path }) =>
          EXTRACTED_NATIVE_PRIMITIVE_PATHS.has(path),
        );
        expect(primitives).toHaveLength(2);
        for (const { path, content } of primitives) {
          expect(content, path).toContain("<Pressable");
          expect(rawControlDiagnostics(path, content), path).toEqual([]);
          expect(rawControlDiagnostics(path, "export const Probe = () => <input />;")).toEqual([
            `${path}:1: raw <input> must use the shared UI primitive`,
          ]);
        }
      }
    });

    test("rejects raw controls in adjacent modules and form-field adapters", () => {
      const probes = [
        ["apps/mobile/src/components/ui/dialog-extra.tsx", "Pressable"],
        ["apps/mobile/src/components/ui/nested/dialog-content.tsx", "Pressable"],
        ["apps/mobile/src/features/dialog-content.tsx", "Pressable"],
        ["apps/desktop/src/renderer/components/ui/dialog-content.tsx", "Pressable"],
        ["apps/mobile/src/components/ui/tabs.tsx", "Pressable"],
        ["src/components/ui/nested/tabs-trigger.tsx", "Pressable"],
        ["src/components/form-fields/dialog-content.tsx", "Pressable"],
        ["apps/desktop/src/renderer/components/form-fields/checkbox-field.tsx", "input"],
        ["src/components/form-fields/checkbox-field.tsx", "input"],
      ] as const;
      for (const [path, control] of probes) {
        expect(rawControlDiagnostics(path, `export const Probe = () => <${control} />;`)).toEqual([
          `${path}:1: raw <${control}> must use the shared UI primitive`,
        ]);
      }
    });

    for (const target of TARGETS) {
      test(`${target.label} permits native controls only inside primitive implementations`, () => {
        const diagnostics = generateProjectFiles(target.config, { dryRun: false })
          .filter(({ path }) => /\.(?:jsx|tsx)$/.test(path))
          .flatMap(({ path, content }) => rawControlDiagnostics(path, content));
        expect(diagnostics).toEqual([]);
      });
    }

    for (const target of TARGETS.filter(({ config }) => config.apps.includes("mobile"))) {
      test(`${target.label} keeps Expo on React Native Reusables without DOM or Base UI`, () => {
        const files = generateProjectFiles(target.config, { dryRun: false });
        const mobileFiles = files.filter(({ path }) => path.startsWith("apps/mobile/"));
        const combined = mobileFiles.map(({ content }) => content).join("\n");
        const source = (path: string): string =>
          mobileFiles.find((candidate) => candidate.path === path)?.content ?? "";

        expect(mobileFiles.length).toBeGreaterThan(0);
        expect(combined).not.toContain("@base-ui/react");
        expect(combined).not.toContain("@repo/ui/components");
        expect(combined).not.toContain("apps/web/");
        expect(combined).not.toMatch(/<(?:button|input|select|textarea)(?:\s|>)/);

        const button = source("apps/mobile/src/components/ui/button.tsx");
        const input = source("apps/mobile/src/components/ui/input.tsx");
        expect(button).toContain('from "react-native"');
        expect(button).toContain("<Pressable");
        expect(input).toContain('from "react-native"');
        expect(input).toContain("<TextInput");
      });
    }
  });
});
