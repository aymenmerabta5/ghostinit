import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import {
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

type Mode = "monorepo" | "single";
type Platform = "desktop" | "mobile";

function generated(mode: Mode, platform: Platform): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `${platform}-accessibility`,
      runtime: "bun",
      mode,
      framework: "nextjs",
      database: "postgres",
      preset: "saas",
      billing: ["stripe"],
      features: [],
      apps: [platform],
    } satisfies Partial<ProjectConfig>),
  );
}

function pathFor(mode: Mode, platform: Platform, path: string): string {
  return mode === "monorepo" ? `apps/${platform}/${path}` : path;
}

function source(files: readonly TemplateFile[], path: string): string {
  const match = files.find((candidate) => candidate.path === path);
  expect(match, `missing generated file: ${path}`).toBeDefined();
  return match?.content ?? "";
}

function expectTypescriptToParse(files: readonly TemplateFile[], label: string): void {
  const errors = files
    .filter(({ path }) => /\.tsx?$/.test(path))
    .flatMap(({ path, content }) =>
      parseSync(path, content).errors.map((error) => `${label}: ${path}: ${error.message}`),
    );
  expect(errors).toEqual([]);
}

function oklchLuminance([lightness, chroma, hue]: readonly number[]): number {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = Math.max(0, Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  const green = Math.max(0, Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  const blue = Math.max(0, Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: readonly number[], second: readonly number[]): number {
  const [lighter, darker] = [oklchLuminance(first), oklchLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function emittedColor(theme: string, appearance: "light" | "dark", token: string) {
  const block = new RegExp(`(?:^|\\n)\\.${appearance} \\{([^}]+)\\}`).exec(theme)?.[1];
  expect(block, `missing ${appearance} theme block`).toBeDefined();
  const values = [...(block ?? "").matchAll(new RegExp(`--${token}: oklch\\(([^)]+)\\);`, "g"))];
  expect(values, `${appearance} --${token} must be declared exactly once`).toHaveLength(1);
  const value = values[0]?.[1] ?? "";
  expect(value, `${appearance} --${token} must be opaque numeric OKLCH`).toMatch(
    /^\d*\.?\d+ \d*\.?\d+ \d*\.?\d+$/,
  );
  const [lightness, chroma, hue] = value.split(" ").map(Number);
  return [lightness, chroma, hue] as const;
}

describe("generated desktop and Expo accessibility contract", () => {
  test("Expo identity read failures render a shared alert and retry both identity reads", async () => {
    const files = generated("monorepo", "mobile");
    const root = "apps/mobile/src/features/settings";
    for (const failedRead of ["session", "application"] as const) {
      let sessionRetries = 0;
      let applicationRetries = 0;
      const ui = generatedFormHarness(
        ["queries.ts", "settings-screen.tsx"]
          .map((name) => source(files, `${root}/${name}`))
          .join("\n"),
        ["SettingsScreen"],
        {
          identityClient: {
            useSession: () => ({
              isPending: false,
              error: failedRead === "session" ? new Error("Session unavailable") : null,
              data: { user: { id: "user-1" }, session: { id: "session-1" } },
              refetch: async () => {
                sessionRetries += 1;
              },
            }),
          },
          useQueryClient: () => ({}),
          currentQueryAuthScope: () => ({ userId: "user-1", sessionId: "session-1" }),
          authScopedQueryKey: (_scope: unknown, key: unknown) => key,
          orpc: { me: { queryOptions: () => ({ queryKey: ["me"] }) } },
          useQuery: () => ({
            isPending: false,
            data: undefined,
            error:
              failedRead === "application" ? new Error("Application identity unavailable") : null,
            refetch: async () => {
              applicationRetries += 1;
            },
          }),
          ActivityIndicator: "ActivityIndicator",
          View: "View",
          Text: "Text",
          Link: "Link",
        },
      );
      const tree = ui.render("SettingsScreen");
      const alert = elements(tree).find((node) => node.type === "Alert");
      expect(alert?.props.accessibilityRole).toBe("alert");
      expect(alert?.props.variant).toBe("destructive");
      expect(elements(tree).find((node) => node.type === "AlertTitle")).toBeDefined();
      expect(elements(tree).find((node) => node.type === "AlertDescription")).toBeDefined();
      expect(textContent(tree)).toContain("genericDescription");
      expect(textContent(tree)).not.toContain("native.signInRequired");
      const retry = elements(tree).find((node) => node.type === "Button");
      expect(retry).toBeDefined();
      (retry!.props.onPress as () => void)();
      await flush();
      expect(sessionRetries).toBe(1);
      expect(applicationRetries).toBe(1);
    }
  });

  test("Expo identity feedback uses the shared React Native Reusables alert", () => {
    const files = generated("monorepo", "mobile");
    for (const path of ["identity-workspace", "admin-users", "settings"]) {
      const content = files
        .filter((entry) => entry.path.startsWith(`apps/mobile/src/features/${path}/`))
        .map((entry) => entry.content)
        .join("\n");
      expect(content, path).toMatch(
        /import \{[^}]*AlertDescription[^}]*\} from "@\/components\/ui\/alert"/,
      );
      expect(content, path).toContain("<Alert");
      expect(content, path).toContain("<AlertDescription>");
      expect(content, path).toContain('accessibilityRole="alert"');
      expect(content, path).not.toMatch(/<View\b[^>]*accessibilityRole=["']alert["']/);
    }
  });

  test("both applications consume only their resolved UI contract and adapter", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const platform of ["desktop", "mobile"] as const) {
        const files = generated(mode, platform);
        const isDesktop = platform === "desktop";
        const cssPath = pathFor(
          mode,
          platform,
          isDesktop ? "src/renderer/index.css" : "global.css",
        );
        const rootPath = pathFor(
          mode,
          platform,
          isDesktop ? "src/renderer/main.tsx" : "app/_layout.tsx",
        );
        const adapter = isDesktop ? "electron" : "expo";
        const css = source(files, cssPath);
        const root = source(files, rootPath);

        const imports = css.match(/^@import .+;$/gm) ?? [];
        expect(imports).toEqual(
          isDesktop
            ? [expect.stringContaining(`/adapters/${adapter}/v1.css`)]
            : ['@import "uniwind";', expect.stringContaining(`/adapters/${adapter}/v1.css`)],
        );
        expect(css).not.toContain("@theme");
        expect(root).toContain("designSystemContract");
        expect(root).toContain(`/${adapter}/v1`);
        expect(
          files.some(
            ({ path }) =>
              path ===
              pathFor(
                mode,
                platform,
                isDesktop ? "src/renderer/styles/theme.css" : "src/styles/theme.css",
              ),
          ),
        ).toBe(false);
      }
    }
  });

  test("Electron forms use approved semantic controls with complete error relationships", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "desktop");
      const prefix = mode === "monorepo" ? "apps/desktop/" : "";
      const componentRoot =
        mode === "monorepo" ? `${prefix}src/renderer/components/ui` : "src/components/ui";
      const paths = new Set(files.map(({ path }) => path));
      for (const component of ["button", "field", "input", "label"]) {
        expect(paths.has(`${componentRoot}/${component}.tsx`), component).toBe(true);
      }

      const routeSources = files
        .filter(({ path }) => path.startsWith(`${prefix}src/renderer/features/`))
        .map(({ content }) => content);
      const forms = routeSources.filter((content) => /<(?:form[. ]|Form )/.test(content));
      expect(forms.length).toBeGreaterThanOrEqual(6);
      for (const content of forms) {
        expect(content).not.toContain(
          'className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"',
        );
      }
      const fieldRoot = componentRoot.replace(/\/ui$/, "/form-fields");
      const fields = generatedFormHarness(
        [
          source(files, `${fieldRoot}/field-shared.ts`),
          source(files, `${fieldRoot}/text-field.tsx`),
        ].join("\n"),
        ["TextField"],
        {
          Input: "Input",
          Field: "Field",
          FieldLabel: "FieldLabel",
          FieldDescription: "FieldDescription",
          FieldError: "FieldError",
          useFieldContext: () => ({
            name: "code",
            state: { value: "123", meta: { errors: ["Enter six digits"] } },
            handleChange() {},
            handleBlur() {},
          }),
        },
      );
      const rendered = elements(
        fields.render("TextField", { label: "Code", description: "Six digits" }),
      );
      const control = rendered.find((node) => node.type === "Input")!;
      expect(control.props["aria-invalid"]).toBe(true);
      expect(rendered.find((node) => node.type === "FieldLabel")?.props.htmlFor).toBe(
        control.props.id,
      );
      expect(rendered.find((node) => node.type === "FieldDescription")?.props.id).toBe(
        control.props["aria-describedby"],
      );
      expect(rendered.find((node) => node.type === "FieldError")?.props.id).toBe(
        control.props["aria-errormessage"],
      );
      const twoFactor = source(
        files,
        `${prefix}src/renderer/features/auth/components/two-factor-form.tsx`,
      );
      expect(twoFactor).toContain('name="code"');
      expect(twoFactor).toContain("<field.OtpField");
      expect(twoFactor).toContain('label={t("twoFactor.codeLabel")}');
      expect(twoFactor).toContain('description={t("twoFactor.codeDescription")}');

      const button = source(files, `${componentRoot}/button.tsx`);
      const input = source(files, `${componentRoot}/input.tsx`);
      const field = source(files, `${componentRoot}/field.tsx`);
      expect(button).toContain("@base-ui/react/button");
      expect(button).toContain('default: "h-10 px-4 py-2"');
      expect(button).toContain('sm: "h-9 px-3 text-sm"');
      expect(button).toContain('icon: "size-10 p-0"');
      expect(button).toContain("motion-reduce:transition-none");
      expect(button).toContain("aria-busy={loading || undefined}");
      expect(button).toContain("disabled={disabled || loading}");
      expect(input).toContain("h-10");
      expect(input).toContain("bg-card");
      expect(input).toContain("shadow-control");
      expect(input).toContain("focus-visible:ring-2");
      expect(input).toContain("aria-[invalid=true]:border-destructive");
      expect(field).toContain('aria-live="polite"');
      expectTypescriptToParse(files, `${mode}/desktop`);
    }
  });

  test("Expo tabs and dialogs expose native semantics and deterministic dismissal", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "mobile");
      const prefix = mode === "monorepo" ? "apps/mobile/" : "";
      const tabs = ["tabs.tsx", "tabs-context.ts", "tabs-trigger.tsx"]
        .map((name) => source(files, `${prefix}src/components/ui/${name}`))
        .join("\n");
      const dialog = ["dialog.tsx", "dialog-context.ts", "dialog-content.tsx"]
        .map((name) => source(files, `${prefix}src/components/ui/${name}`))
        .join("\n");

      expect(tabs).toContain('accessibilityRole="tablist"');
      expect(tabs).toContain('accessibilityRole="tab"');
      expect(tabs).toContain("accessibilityState={{");
      expect(tabs).toContain("selected: isActive");
      expect(tabs).toContain("const isDisabled = disabled === true");
      expect(tabs).toContain("disabled: isDisabled");
      expect(tabs).toContain("min-h-11 min-w-11");
      expect(tabs).toContain('role="tabpanel"');

      expect(dialog).toContain("React.createContext");
      expect(dialog).toContain("if (!open) return null");
      expect(dialog).toContain("<Pressable");
      expect(dialog).toContain('accessibilityRole="button"');
      expect(dialog).toContain("accessibilityLabel=");
      expect(dialog).toContain('accessibilityLabel="Close dialog"');
      expect(dialog).toContain("accessibilityViewIsModal");
      expect(dialog).toContain("AccessibilityInfo.sendAccessibilityEvent");
      expect(dialog).not.toContain("AccessibilityInfo.setAccessibilityFocus");
      expect(dialog).toContain("BackHandler.addEventListener");
      expect(dialog).toContain("onAccessibilityEscape={close}");
      expect(dialog).not.toContain('event.key === "Escape"');
      expect(dialog).toContain("AccessibilityInfo.isReduceMotionEnabled");
      expect(dialog).toContain('animationType={reduceMotion ? "none" : "fade"}');
      expect(dialog).toContain("onRequestClose={close}");

      const billing = source(files, `${prefix}src/features/billing/mutations.ts`);
      expect(billing).toContain('import * as Linking from "expo-linking"');
      expect(billing).toContain("billingReturnUrl");
      expect(billing).toContain("EXPO_PUBLIC_APP_URL");
      expect(billing).not.toContain("Linking.createURL");
      expect(billing).toContain("Linking.openURL");
      expect(billing).not.toContain("{ Linking }");
      expectTypescriptToParse(files, `${mode}/mobile`);
    }
  });

  test("native controls meet touch targets, responsive bounds, and logical-direction rules", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "mobile");
      const prefix = mode === "monorepo" ? "apps/mobile/" : "";
      const button = source(files, `${prefix}src/components/ui/button.tsx`);
      const header = source(files, `${prefix}src/features/app-shell/header.tsx`);
      const auth = source(files, `${prefix}src/features/auth/components/auth-frame.tsx`);
      expect(button).toContain('sm: "min-h-11 px-3"');
      expect(button).toContain('icon: "size-11"');
      expect(header).toContain('<Button variant="ghost" size="sm"');
      expect(header).toContain('<Button size="icon" variant="secondary"');
      expect(header).not.toContain("<Pressable");
      expect(auth).toContain("w-full max-w-[32rem] self-center");

      const nativeSources = files
        .filter(
          ({ path }) =>
            path.startsWith(`${prefix}app/`) ||
            path.startsWith(`${prefix}src/components/`) ||
            path.startsWith(`${prefix}src/features/`),
        )
        .map(({ content }) => content)
        .join("\n");
      expect(nativeSources).not.toMatch(/\b(?:ml|mr|pl|pr)-/);
      expect(nativeSources).not.toContain("text-left");
      expect(nativeSources).toContain("text-start");
    }
  });

  test("shared OKLCH text and action pairs meet WCAG AA in light and dark themes", () => {
    const textPairs = [
      ["foreground", "background"],
      ["card-foreground", "card"],
      ["popover-foreground", "popover"],
      ["muted-foreground", "background"],
      ["muted-foreground", "card"],
      ["muted-foreground", "muted"],
      ["muted-foreground", "popover"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["accent-foreground", "accent"],
      ["destructive-foreground", "destructive"],
      ["destructive", "card"],
      ["success", "card"],
      ["warning", "card"],
      ["code-foreground", "code"],
      ["sidebar-foreground", "sidebar"],
      ["sidebar-primary-foreground", "sidebar-primary"],
      ["sidebar-accent-foreground", "sidebar-accent"],
    ] as const;
    const boundaryPairs = [
      ["input", "card"],
      ["ring", "background"],
      ["ring", "card"],
      ["ring", "popover"],
      ["sidebar-ring", "sidebar"],
    ] as const;
    for (const mode of ["monorepo", "single"] as const) {
      for (const platform of ["desktop", "mobile"] as const) {
        const files = generated(mode, platform);
        const theme = source(
          files,
          mode === "monorepo"
            ? "packages/ui/src/styles/theme.css"
            : "src/platform/ui/styles/theme.css",
        );
        expect(theme).not.toMatch(/#(?:000|fff)\b/i);
        expect(theme).not.toMatch(/oklch\((?:0|1) 0 0\)/);
        for (const appearance of ["light", "dark"] as const) {
          for (const [foreground, background] of textPairs) {
            expect(
              contrastRatio(
                emittedColor(theme, appearance, foreground),
                emittedColor(theme, appearance, background),
              ),
              `${mode}/${platform}/${appearance}: ${foreground} on ${background}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
          for (const [boundary, background] of boundaryPairs) {
            expect(
              contrastRatio(
                emittedColor(theme, appearance, boundary),
                emittedColor(theme, appearance, background),
              ),
              `${mode}/${platform}/${appearance}: ${boundary} against ${background}`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });
});
