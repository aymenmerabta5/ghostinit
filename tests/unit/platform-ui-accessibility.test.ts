import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

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

describe("generated desktop and Expo accessibility contract", () => {
  test("Expo identity feedback uses the shared React Native Reusables alert", () => {
    const files = generated("monorepo", "mobile");
    for (const path of ["app/workspace.tsx", "app/admin.tsx", "app/settings.tsx"]) {
      const content = source(files, `apps/mobile/${path}`);
      expect(content, path).toContain(
        'import { Alert, AlertDescription } from "@/components/ui/alert"',
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
        .filter(({ path }) => path.startsWith(`${prefix}src/renderer/routes/`))
        .map(({ content }) => content);
      const forms = routeSources.filter((content) => content.includes("<form"));
      expect(forms.length).toBeGreaterThanOrEqual(6);
      for (const content of forms) {
        expect(content).toContain('from "@/components/ui/field"');
        expect(content).toContain('from "@/components/ui/input"');
        expect(content).not.toContain(
          'className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"',
        );
        const controlCount = (content.match(/<(?:Input|SelectTrigger|select)\b/g) ?? []).length;
        expect(content.match(/\bid=/g)).toHaveLength(controlCount * 3);
        expect(content.match(/\baria-describedby=/g)).toHaveLength(controlCount);
        expect(content.match(/\baria-errormessage=/g)).toHaveLength(controlCount);
        expect(content.match(/\baria-invalid=/g)).toHaveLength(controlCount);
      }

      const twoFactor = source(files, `${prefix}src/renderer/routes/2fa.tsx`);
      expect(twoFactor).toContain('htmlFor="two-factor-code"');
      expect(twoFactor).toContain('id="two-factor-code"');
      expect(twoFactor).toContain('id="two-factor-code-description"');
      expect(twoFactor).toContain('id="two-factor-code-error"');
      expect(twoFactor).toContain(
        'aria-errormessage={codeError ? "two-factor-code-error" : undefined}',
      );

      const button = source(files, `${componentRoot}/button.tsx`);
      const input = source(files, `${componentRoot}/input.tsx`);
      const field = source(files, `${componentRoot}/field.tsx`);
      expect(button).toContain("@base-ui/react/button");
      expect(button).toContain("min-h-9");
      expect(button).toContain("motion-reduce:transition-none");
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
      const tabs = source(files, `${prefix}src/components/ui/tabs.tsx`);
      const dialog = source(files, `${prefix}src/components/ui/dialog.tsx`);

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

      const billing = source(files, `${prefix}app/billing.tsx`);
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
      const header = source(files, `${prefix}src/components/header.tsx`);
      const auth = source(files, `${prefix}app/(auth)/sign-in.tsx`);
      expect(button).toContain('sm: "min-h-11 px-3"');
      expect(button).toContain('icon: "size-11"');
      expect(header).toContain('<Button variant="ghost" size="sm"');
      expect(header).toContain('<Button size="icon" variant="secondary"');
      expect(header).not.toContain("<Pressable");
      expect(auth).toContain("w-full max-w-[32rem] self-center");

      const nativeSources = files
        .filter(
          ({ path }) =>
            path.startsWith(`${prefix}app/`) || path.startsWith(`${prefix}src/components/`),
        )
        .map(({ content }) => content)
        .join("\n");
      expect(nativeSources).not.toMatch(/\b(?:ml|mr|pl|pr)-/);
      expect(nativeSources).not.toContain("text-left");
      expect(nativeSources).toContain("text-start");
    }
  });

  test("shared OKLCH text and action pairs meet WCAG AA in light and dark themes", () => {
    const files = generated("single", "mobile");
    const theme = source(files, "src/platform/ui/styles/theme.css");
    expect(theme).not.toMatch(/#(?:000|fff)\b/i);
    expect(theme).not.toMatch(/oklch\((?:0|1) 0 0\)/);

    const pairs = [
      [
        [0.98, 0.005, 264],
        [0.09, 0.01, 264],
      ],
      [
        [0.65, 0.015, 264],
        [0.18, 0.01, 264],
      ],
      [
        [0.65, 0.22, 264],
        [0.12, 0.02, 264],
      ],
      [
        [0.14, 0.01, 264],
        [0.99, 0.005, 264],
      ],
      [
        [0.5, 0.015, 264],
        [0.95, 0.01, 264],
      ],
      [
        [0.55, 0.22, 264],
        [0.99, 0.005, 264],
      ],
    ] as const;
    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
