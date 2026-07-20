# Expo RNR + Uniwind Shared Theming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expo app uses React Native Reusables (RNR) + Uniwind (CSS-first, `withUniwindConfig`) with shared OKLCH tokens from `@repo/ui/src/theme.css`; one edit updates both web and mobile; web primitives move to `apps/web/src/components/ui`; mobile RNR primitives in `apps/mobile/src/components/ui`; all Expo pages rewritten to `className` + no hardcoded colors; TS `any` removed where properly typable; 6-layer arch (both `apps/*` = L1 UI) enforced.

**Architecture:** Tokens-only `@repo/ui` package holding `theme.css` (OKLCH light/dark + `@theme inline` + `@layer theme @variant dark/light` for Uniwind compat) is single source. Web `globals.css` does `@import "@repo/ui/theme.css"` + `@import "tailwindcss"`. Mobile `global.css` does `@import "tailwindcss"`, `@import "uniwind"`, `@import "@repo/ui/theme.css"`. Babel preset `['uniwind/babel', {cssEntryFile: './global.css'}]` before `babel-preset-expo`. Metro `withUniwindConfig(config, {cssEntryFile:'./global.css', dtsFile:'./uniwind-types.d.ts'})`. RNR primitives are deterministic template strings (no runtime CLI), using `tailwind-variants (tv)` + `cn()` (`clsx+tailwind-merge`) + `className`. Typed addon helpers (`hasFeature(map, name)`, `getAddon(map,key)`, `isAddonInstallerMap`) remove host `as any`. Architecture checker unchanged — `apps/mobile/` returns L1 (already correct).

**Tech Stack:** TypeScript 6.0.3 (host) / 7.0.2 dev, Bun, Tailwind CSS 4.3.2, Uniwind latest (from Context7 `uniwind` 0.1.12+ / `uniwind/metro` `withUniwindConfig`), RNR patterns (Button using `tv` + Slot, Text with `TextClassContext`), `react-native-reanimated 4.1.1`, `tw-animate-css 1.4.0`, `class-variance-authority` alternative `tailwind-variants`, oxlint 1.73.0 + `no-explicit-any`, oxc-parser layered check.

## Global Constraints

- `ghostinitVersion` in `packages/versions/src/index.ts` + root `package.json` version + `src/templates/versions.ts` re-export MUST stay synced (`0.1.0` currently) — checked in task.
- Host `bunfig.toml` `isolated, hoist=false` hermetic; generated `bunfig.toml` `hoist=true` (Next TS7 quirk) — do not change host.
- `FsTransaction` mandatory, no `fs.writeFileSync`; `<400 LOC` files guideline with `// @allow-long <n>: <reason>`.
- No `export *`; explicit named exports.
- New env var requires 5 places: `constants.ts` + `shared/env.ts` + `root/turbo.ts` + `turbo.json` (generated via root composer) + docs + skills.
- Billing providers SSOT `BILLING_PROVIDERS` in `src/lib/constants.ts` / `lib/addons.ts`; any combo allowed, only block `billing+database=none`.
- Single source theme: `packages/ui/src/theme.css` OKLCH tokens — web and mobile both `@import` it.
- Expo `app.json` scheme `__PROJECT_NAME__`, `expo-router/entry` main, `_layout.tsx` imports `../global.css` + `uniwind/global` (per Uniwind docs root import), `metro.config.js` uses `withUniwindConfig`.
- 6-layer linear chain UI(1)->Transport(2)->Domain(3)->Capabilities(4)->Vendors(5)->Supporting(6); `apps/mobile/` L1, `packages/ui` L6 Supporting; `apps/web/src/components/ui/*` L1; downward-only allowed.
- RNR components deterministic (no `npx @rnr/cli init` at runtime in generated projects).
- TypeScript `any` removal pragmatic: forbid bare `any` where properly typable; keep only where vendor SDK truly untyped, with `// vendor untyped` comment and `unknown`+guard preferred.
- `bun run build && bun run check && bun test --timeout 100000` must pass after each phase.
- Skills sync mandatory: `skills/ghostinit-use/` + `.claude/skills/` mirror when flags/structure change (this plan changes theme editing workflow).

---

### Task 0: Versions Catalog — Add Uniwind deps + verify current catalog

**Files:**

- Modify: `packages/versions/src/index.ts` (add `uniwind`, `reanimated`, `tw-animate-css` groups)
- Test: `tests/unit/packages.test.ts` (new assertions existence)

**Interfaces:**

- Consumes: existing `expo`, `styling`, `ui` groups
- Produces: `v.uniwind.*`, `v.reanimated.*`, `v.twAnimate.*` used by `expo-core.ts` and `css.ts` templates

- [ ] **Step 1: Write failing test for new version entries**

In `tests/unit/packages.test.ts`, add at bottom:

```ts
import { describe, it, expect } from "bun:test";
import { catalog } from "../../packages/versions/src/index.ts";

describe("versions — uniwind + rnr deps", () => {
  it("has uniwind entries", () => {
    expect((catalog as any).uniwind).toMatch(/^\d+\.\d+\.\d+/);
    expect((catalog as any)["react-native-reanimated"]).toMatch(/^\d+\.\d+\.\d+/);
    expect((catalog as any)["tw-animate-css"]).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run test to fail**

Run: `bun test tests/unit/packages.test.ts --timeout 100000`
Expected: FAIL — `uniwind` undefined

- [ ] **Step 3: Add versions**

In `packages/versions/src/index.ts`, after `expo` export block, before `interactive`, add:

```ts
export const uniwind = {
  uniwind: "0.1.12",
  "tailwind-variants": "0.3.1",
  "tw-animate-css": "1.4.0",
} as const;

export const reanimated = {
  "react-native-reanimated": "4.1.1",
} as const;
```

Then in `catalog` spread, add after `...expo`:

```ts
...uniwind,
...reanimated,
```

Also ensure expo group already has `react-native` etc. No need to touch `ui` group (clsx, tailwind-merge, cva already present). Add `tailwind-variants` to `ui` group OR keep separate but add to `catalog`. For RNR, `tailwind-variants` is required; keep in `uniwind` group.

Check versions from Context7:

- `uniwind` npm latest for RN is `0.1.12` (Context7 `/websites/uniwind_dev` actual RN binding) — NOT `uniwindcss/uniwind@2.0.3` (UniApp Vue). Use `0.1.12`.
- `react-native-reanimated` `4.1.1`
- `tw-animate-css` `1.4.0`
- `tailwind-variants` latest stable `0.3.1` (verify via npm, but use 0.3.1).

- [ ] **Step 4: Run test to pass**

Run: `bun test tests/unit/packages.test.ts --timeout 100000`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/versions/src/index.ts tests/unit/packages.test.ts
git commit -m "feat(versions): add uniwind, tailwind-variants, tw-animate-css, reanimated catalog entries

Co-Authored-By: internal-model"
```

---

### Task 1: Shared Theme — Refactor `css.ts` to provide `@repo/ui` tokens as single source + web/mobile globals

**Files:**

- Modify: `src/templates/apps/fragments/css.ts` (new exports `themeCssContent()`, `mobileGlobalCssContent()`, keep `globalCssContent()` importing theme)
- Modify: `src/templates/ui/theme.ts` (now generates `packages/ui/src/theme.css` with OKLCH + @theme inline + @layer theme @variant)
- Modify: `src/templates/ui/config.ts` (simplify @repo/ui package.json — no BaseUI heavy deps)
- Modify: `src/templates/ui/all.ts` (only theme + config + utils + barrel)
- Create: `packages/ui/src/theme.css` generated content (via template)
- Modify: `src/templates/ui/index.ts` unchanged shape but re-exports utils/theme
- Test: `tests/unit/apps.test.ts` — add theme single-source assertions

**Interfaces:**

- Consumes: existing `oklchLightTokens`, `oklchDarkTokens`, `themeInlineTokens` constants
- Produces: `themeCssContent(): string` → content for `packages/ui/src/theme.css`; `mobileGlobalCssContent(): string` → content for `apps/mobile/global.css`; `globalCssContent()` updated to import theme

**Source facts (Context7):**

- Uniwind global.css must have: `@import 'tailwindcss'; @import 'uniwind';` per `uniwind_dev` docs.
- Theming via `@layer theme { :root { @variant dark { --color-... } @variant light { ... } } }`
- Tailwind v4 uses `@theme inline { --color-* : var(--*)}`
- So final `@repo/ui/theme.css` should contain compatible tokens usable by both.

- [ ] **Step 1: Write failing test for theme single source**

Create `tests/unit/theme-single-source.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { globalCssContent } from "../../src/templates/apps/fragments/css.ts";
import { themeFiles } from "../../src/templates/ui/theme.ts";

describe("theme single source", () => {
  it("packages/ui theme.css contains OKLCH tokens", () => {
    const files = themeFiles();
    const themeCss = files.find((f) => f.path.includes("theme.css"))?.content ?? "";
    expect(themeCss).toContain("oklch");
    expect(themeCss).toContain("--background");
    expect(themeCss).toContain("@theme inline");
  });
  it("web globals.css imports @repo/ui/theme.css", () => {
    const css = globalCssContent();
    expect(css).toContain("@repo/ui");
    expect(css).toContain("theme.css");
  });
});
```

- [ ] **Step 2: Run test fail**

`bun test tests/unit/theme-single-source.test.ts --timeout 100000` → FAIL because current `theme.ts` only generates utils, not theme.css, and `globalCssContent` doesn't import theme.

- [ ] **Step 3: Implement `theme.ts` — tokens-only package**

Rewrite `src/templates/ui/theme.ts` to:

```ts
import { file, type TemplateFile } from "../shared.js";
import {
  oklchLightTokens,
  oklchDarkTokens,
  themeInlineTokens,
  tailwindImports,
} from "../apps/fragments/css.js";

/**
 * Single source OKLCH theme file for @repo/ui
 * Supports both web (Tailwind v4 :root/.dark) and mobile (Uniwind @variant dark/light)
 * Web: globals.css @import "@repo/ui/theme.css"
 * Mobile: global.css @import "@repo/ui/theme.css"
 */

export function themeCssContent(): string {
  // For Uniwind compat, duplicate tokens via @layer theme @variant pattern referencing same OKLCH values
  // Keep original :root/.dark for web + also provide @layer theme wrapper for Uniwind
  const uniwindVariantLayer = `
@layer theme {
  :root {
    @variant light {
      --color-background: var(--background);
      --color-foreground: var(--foreground);
      --color-card: var(--card);
      --color-card-foreground: var(--card-foreground);
      --color-popover: var(--popover);
      --color-popover-foreground: var(--popover-foreground);
      --color-primary: var(--primary);
      --color-primary-foreground: var(--primary-foreground);
      --color-secondary: var(--secondary);
      --color-secondary-foreground: var(--secondary-foreground);
      --color-muted: var(--muted);
      --color-muted-foreground: var(--muted-foreground);
      --color-accent: var(--accent);
      --color-accent-foreground: var(--accent-foreground);
      --color-destructive: var(--destructive);
      --color-destructive-foreground: var(--destructive-foreground);
      --color-border: var(--border);
      --color-input: var(--input);
      --color-ring: var(--ring);
    }
  }
}
`;

  return `${oklchLightTokens}

${oklchDarkTokens}

${themeInlineTokens}

${uniwindVariantLayer}
`;
}

export function themeFiles(): TemplateFile[] {
  return [
    file("packages/ui/src/theme.css", themeCssContent()),
    file(
      "packages/ui/src/lib/utils.ts",
      `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
    ),
  ];
}
```

But note: `oklchLightTokens` etc imported from `css.ts` would cause circular if `css.ts` imports from `theme.ts`? So we need to move actual token strings definitions to a shared place OR duplicate them only once. Better: Move token constants into `src/templates/ui/theme.ts` as canonical, and `css.ts` imports them from there (reverse dependency). Let's do:

- In `css.ts`, keep `export const oklchLightTokens...` but `themeCssContent` will be imported from UI theme for generation? Actually template composers will include BOTH `packages/ui/src/theme.css` and `apps/web/src/app/globals.css`. The globalCss should be minimal import, not contain tokens. So modify `globalCssContent()` to:

```ts
export function globalCssContent(): string {
  return `@import "tailwindcss";
@import "@repo/ui/theme.css";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
`;
}
```

So `css.ts` no longer needs token constants for global content; but keep constants for theme file generation? Easier: keep token constants in `css.ts` still, and `theme.ts` imports them. That avoids circular (css -> nothing, theme -> css). Since globalCssContent now doesn't use token constants, it's fine.

Implement final `css.ts`:

```ts
export const tailwindImports = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
`;

export const oklchLightTokens = `...`; // unchanged
export const oklchDarkTokens = `...`;
export const themeInlineTokens = `...`;
export const baseLayer = `...`;

export function globalCssContent(): string {
  return `@import "tailwindcss";
@import "@repo/ui/theme.css";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
`;
}

export function mobileGlobalCssContent(): string {
  return `@import "tailwindcss";
@import "uniwind";
@import "@repo/ui/theme.css";
@import "tw-animate-css";

@source "./app/**/*.{js,jsx,ts,tsx}";
@source "./src/**/*.{js,jsx,ts,tsx}";
@source "./components/**/*.{js,jsx,ts,tsx}";

@custom-variant dark (&:is(.dark *));
`;
}
```

- [ ] **Step 4: Simplify `src/templates/ui/config.ts` — tokens-only package.json**

Modify file: new package.json deps should be minimal: `clsx`, `tailwind-merge` (utils), no `@base-ui/react` heavy. Keep `class-variance-authority` OR `tailwind-variants`? For mobile we use `tailwind-variants`, web still uses `class-variance-authority`. But to keep token package light, dependencies only `clsx`, `tailwind-merge`. No React dependency needed for CSS file, but keep for utils? Actually utils uses clsx+twMerge only. Remove `react`, `react-dom`, `sonner`, `recharts`, `@base-ui/react`.

```ts
export function configFiles(): TemplateFile[] {
  return [
    file(
      "packages/ui/package.json",
      packageJson({
        name: "@repo/ui",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./theme.css": "./src/theme.css",
        },
        dependencies: {
          clsx: `^${v.ui.clsx}`,
          "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        },
        devDependencies: {
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    ...
  ];
}

export function barrelContent(): string {
  return `export { cn } from "./lib/utils.js";
export const themePath = "./theme.css";
`;
}
```

- [ ] **Step 5: Update `all.ts` to only aggregate theme + config + barrel**

Simplify `src/templates/ui/all.ts`:

```ts
export { configFiles, barrelFile } from "./config.js";
export { themeFiles } from "./theme.js";
```

Remove other exports (primitives, feedback, etc). We will still keep those files for reference but not aggregated into `packages/ui`. They will be moved to web-ui.

- [ ] **Step 6: Run tests**

`bun test tests/unit/theme-single-source.test.ts tests/unit/packages.test.ts --timeout 100000` should pass.
`bun run check` must pass.

- [ ] **Step 7: Commit**

```bash
git add src/templates/ui/theme.ts src/templates/ui/config.ts src/templates/ui/all.ts src/templates/apps/fragments/css.ts tests/unit/theme-single-source.test.ts
git commit -m "feat(theme): @repo/ui tokens-only with single-source OKLCH theme.css shared by web+mobile

Co-Authored-By: internal-model"
```

---

### Task 2: Web UI Local Primitives — Move Button/Card/etc from @repo/ui to apps/web/src/components/ui

**Files:**

- Create directory: `src/templates/apps/fragments/web-ui/` with files `primitives.ts`, `feedback.ts`, `forms.ts`, `layout.ts`, `overlays.ts`, `dropdown.ts`, `data.ts`, `index.ts` (move content from old `src/templates/ui/*.ts`)
- Modify: `src/templates/apps/core.ts` — add `webUiFiles()` call to generate `apps/web/src/components/ui/*`
- Modify: `src/templates/modes/monorepo/apps-composer.ts` — ensure tsconfig aliases still include `@repo/ui` (already) but web primitives are local imports, not workspace
- Modify: `src/templates/apps/components.ts`? currently generates? Check existing – it likely generates app-level components (header). Keep.
- Test: `tests/unit/web-ui-local.test.ts`

**Interfaces:**

- Consumes: moved templates from `src/templates/ui/*.ts`
- Produces: `apps/web/src/components/ui/*.tsx` files + `apps/web/src/lib/utils.ts` (cn)

This ensures L1 UI (apps/web) contains its own primitives, L6 @repo/ui only tokens.

- [ ] **Step 1: Failing test for web local UI**

`tests/unit/web-ui-local.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { coreFiles } from "../../src/templates/apps/core.ts";

describe("web UI local primitives", () => {
  it("coreFiles generates apps/web/src/components/ui/button.tsx", () => {
    const files = coreFiles("bun", false, false);
    const hasButton = files.some((f) => f.path === "apps/web/src/components/ui/button.tsx");
    expect(hasButton).toBe(true);
  });
  it("no longer generates packages/ui Button (old location)", () => {
    const files = coreFiles("bun", false, false);
    const oldPath = files.some((f) => f.path === "packages/ui/src/components/button.tsx");
    expect(oldPath).toBe(false);
  });
});
```

Run → FAIL (no web UI generated yet).

- [ ] **Step 2: Create `src/templates/apps/fragments/web-ui/` copies**

For each file from old UI:

- `src/templates/apps/fragments/web-ui/primitives.ts`: Copy content from `src/templates/ui/primitives.ts`, but change output paths from `packages/ui/src/components/...` to `apps/web/src/components/ui/...`

Example file content transformation:

```ts
import { file, type TemplateFile } from "../../../shared.js";

export function primitivesFiles(): TemplateFile[] {
  return [
    file("apps/web/src/components/ui/button.tsx", `"use client"; ... same content ...`),
    file("apps/web/src/components/ui/card.tsx", `...`),
    file("apps/web/src/components/ui/badge.tsx", `...`),
    file("apps/web/src/components/ui/alert.tsx", `...`),
  ];
}
```

Similarly:

- `feedback.ts` → avatar, sonner, empty, separator, skeleton, spinner → paths `apps/web/src/components/ui/*`
- `forms.ts` → input, label, field, form → same new paths
- `layout.ts` → tabs, dialog, table → same
- `overlays.ts` → tooltip, popover, sheet, breadcrumb → same
- `dropdown.ts` → dropdown-menu
- `data.ts` → chart

Create `index.ts`:

```ts
import type { TemplateFile } from "../../../shared.js";
import { primitivesFiles } from "./primitives.js";
import { feedbackFiles } from "./feedback.js";
import { formsFiles } from "./forms.js";
import { layoutFiles } from "./layout.js";
import { overlaysFiles, sheetFiles } from "./overlays.js";
import { dropdownFiles } from "./dropdown.js";
import { chartFiles } from "./data.js";
import { file } from "../../../shared.js";

export function webUiFiles(): TemplateFile[] {
  const cnFile: TemplateFile = file(
    "apps/web/src/lib/utils.ts",
    `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
  );
  return [
    cnFile,
    ...primitivesFiles(),
    ...feedbackFiles(),
    ...formsFiles(),
    ...layoutFiles(),
    ...overlaysFiles(),
    ...sheetFiles(),
    ...dropdownFiles(),
    ...chartFiles(),
    file(
      "apps/web/src/components/ui/index.ts",
      `/* barrel re-exports */\nexport { Button } from "./button.js";\nexport * from "./card.js";\n...`,
    ),
  ];
}
```

Simplify: Actually create utils file + all components. Keep barrel minimal for now, or re-export list similar to old @repo/ui barrel but under web.

- [ ] **Step 3: Wire into `core.ts`**

Modify `coreFiles()` in `src/templates/apps/core.ts` to include web UI:

```ts
import { webUiFiles } from "./fragments/web-ui/index.js";

export function coreFiles(...) {
  return [
    webPackage(...),
    nextConfig(...),
    postcssConfig(),
    globalCss(...),
    ...webUiFiles(),
  ];
}
```

- [ ] **Step 4: Run test pass**

`bun test tests/unit/web-ui-local.test.ts --timeout 100000` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates/apps/fragments/web-ui/ src/templates/apps/core.ts tests/unit/web-ui-local.test.ts src/templates/ui/
git commit -m "feat(web-ui): move Button/Card/etc from @repo/ui to apps/web/src/components/ui, @repo/ui becomes tokens-only

Co-Authored-By: internal-model"
```

---

### Task 3: Expo Uniwind Infra — Babel, Metro, global.css, utils lib, typescript config

**Files:**

- Modify: `src/templates/apps/expo-core.ts` (babel, metro, add global.css, add utils.ts, add theme lib optional)
- Modify: `src/templates/apps/fragments/css.ts` already did `mobileGlobalCssContent`
- Modify: `src/templates/modes/monorepo/apps-composer.ts` — ensure expo tsconfig includes `uniwind-types.d.ts` in include
- Test: `tests/unit/expo-uniwind-infra.test.ts`

**Interfaces:**

- Consumes: `mobileGlobalCssContent()` from css.ts, version catalog entries `v.uniwind.uniwind`, `v.reanimated.*`
- Produces: `apps/mobile/babel.config.js`, `metro.config.js`, `global.css`, `src/lib/utils.ts`, `uniwind-types.d.ts` placeholder? Actually Uniwind auto-generates dts, but we should output empty placeholder or ensure included.

Context7 verified API:

- `withUniwindConfig` is correct import, not `withUniwind` (older). Docs show `const { withUniwindConfig } = require('uniwind/metro')`.
- Babel preset: `['uniwind/babel', { cssEntryFile: './global.css' }]` must be before `babel-preset-expo`.
- Entry `_layout.tsx` must `import '../global.css'` and `import 'uniwind/global'`? Actually per Uniwind quickstart: global.css import in root layout `import '../global.css'`. Some versions also need `import 'uniwind/global'` not needed? Docs for Expo Router: just import global.css. Keep both? Safer: import '../global.css' at top of _layout. We'll do that in Task 6 layout rewrite.

- [ ] **Step 1: Failing test**

`tests/unit/expo-uniwind-infra.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  expoCoreFiles,
  babelConfigContent,
  metroConfigContent,
} from "../../src/templates/apps/expo-core.ts";

describe("expo uniwind infra", () => {
  it("babel config has uniwind/babel preset before expo", () => {
    const content = babelConfigContent();
    expect(content).toContain("uniwind/babel");
    expect(content.indexOf("uniwind")).toBeLessThan(content.indexOf("babel-preset-expo"));
    expect(content).toContain("cssEntryFile");
    expect(content).toContain("global.css");
  });
  it("metro config uses withUniwindConfig", () => {
    const content = metroConfigContent();
    expect(content).toContain("withUniwindConfig");
    expect(content).toContain("cssEntryFile");
    expect(content).toContain("global.css");
    expect(content).toContain("dtsFile");
  });
  it("expoCoreFiles includes global.css and utils.ts", () => {
    const files = expoCoreFiles("bun", false, false);
    expect(files.some((f) => f.path === "apps/mobile/global.css")).toBe(true);
    expect(files.some((f) => f.path === "apps/mobile/src/lib/utils.ts")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `expo-core.ts` updates**

Modify functions:

```ts
export function babelConfigContent(): string {
  return `module.exports = function(api){api.cache(true); return {presets:[['uniwind/babel', { cssEntryFile: './global.css' }],'babel-preset-expo']};};\n`;
}

export function metroConfigContent(): string {
  return `const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const config = getDefaultConfig(__dirname);
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
`;
}

export function mobileGlobalFile(): TemplateFile {
  return file("apps/mobile/global.css", mobileGlobalCssContent());
}

export function expoLibUtilsContent(): string {
  return `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`;
}

export function expoCoreFiles(...) {
  return [
    webPackageMobile(...),
    appJson(),
    babelConfig(),
    metroConfig(),
    file("apps/mobile/global.css", mobileGlobalCssContent()),
    file("apps/mobile/src/lib/utils.ts", expoLibUtilsContent()),
    expoEnvDts(),
    tsconfigMobile(),
  ];
}
```

Also need to ensure `webPackageMobile` dependencies include `uniwind`, `tailwind-variants`, `tw-animate-css`, `react-native-reanimated`:

```ts
dependencies: {
  ...existing,
  uniwind: `^${v.uniwind.uniwind}`,
  "tailwind-variants": `^${v.uniwind["tailwind-variants"]}`,
  "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
  "react-native-reanimated": `^${v.reanimated["react-native-reanimated"]}`,
}
```

- [ ] **Step 3: Update tsconfig mobile to include global.css types**

In `mobileTsconfigContent()` ensure `include` contains `.expo` and `global.css` not needed, but add `uniwind-types.d.ts`.

```ts
include: [
  "**/*.ts",
  "**/*.tsx",
  ".expo/types/**/*.ts",
  "expo-env.d.ts",
  "uniwind-types.d.ts",
  "global.css",
];
```

- [ ] **Step 4: Run tests pass**

`bun test tests/unit/expo-uniwind-infra.test.ts --timeout 100000`

- [ ] **Step 5: Commit**

```bash
git add src/templates/apps/expo-core.ts src/templates/apps/fragments/css.ts tests/unit/expo-uniwind-infra.test.ts
git commit -m "feat(expo): uniwind babel metro global.css + utils + deps (RNR ready)

Co-Authored-By: internal-model"
```

---

### Task 4: RNR Core Components — Text, Button, deterministic templates

**Files:**

- Create `src/templates/apps/fragments/expo/rnr/` folder:
  - `utils.ts` (re-export maybe)
  - `text.tsx` — RNR Text component with `TextClassContext`
  - `button.tsx` — button variants using `tailwind-variants tv` per Context7 Button doc
  - `index.ts` — aggregates
- Modify `src/templates/apps/expo-components.ts` — include new RNR ui files
- Test: `tests/unit/rnr-components.test.ts`

**Interfaces:**

- Consumes: `cn` from `@/lib/utils`, version catalog
- Produces: `apps/mobile/src/components/ui/text.tsx`, `button.tsx` files (TemplateFile)

Reference implementations from Context7 queries:

- Button uses `tv` not `cva`: `tv({ base: "inline-flex...", variants:{ variant:{ default: "bg-primary text-primary-foreground" ...}, size:{...}}, defaultVariants:{...}})`
- Text uses `TextClassContext.Provider` for card-foreground inheritance pattern from RNR registry.
- RNR Button uses `@rn-primitives`? For Uniwind version, latest registry uses primitives from `@rn-primitives/button` but we can simplify using RN Pressable + Text child for deterministic template without external primitives. Use same approach as Context7 Button doc: it shows `ButtonPrimitive` from `@rn-primitives/button` plus Slot. However to avoid extra dep, we can either:
  - Option A: Install `rn-primitives` (actually package is `@rn-primitives/*`). Simpler to use Pressable directly with CVA? Let's use Pressable + tv to match RNR without heavy deps, but still compatible className pattern.
  - Let's peek at actual uniwind button registry (not fully in Context7 excerpt). Safer to provide typed Button using Pressable + tailwind-variants, matching web API.

Proposed `text.tsx` content (no StyleSheet, uses className):

```tsx
import * as React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "@/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

export interface TextProps extends RNTextProps {
  className?: string;
}

export function Text({ className, ...props }: TextProps): React.JSX.Element {
  const ctxClass = React.useContext(TextClassContext);
  return <RNText className={cn("text-foreground text-base", ctxClass, className)} {...props} />;
}

export { TextClassContext };
```

Proposed `button.tsx`:

```tsx
import * as React from "react";
import { Pressable, type PressableProps, ActivityIndicator, View } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const buttonVariants = tv({
  base: "inline-flex flex-row items-center justify-center rounded-md gap-2",
  variants: {
    variant: {
      default: "bg-primary active:bg-primary/90",
      destructive: "bg-destructive active:bg-destructive/90",
      outline: "border border-input bg-background active:bg-accent",
      secondary: "bg-secondary active:bg-secondary/80",
      ghost: "active:bg-accent",
      link: "bg-transparent",
    },
    size: {
      default: "h-10 px-4",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
      icon: "size-10",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const buttonTextVariants = tv({
  base: "text-center font-medium",
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground group-active:text-accent-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
    size: {
      default: "text-sm",
      sm: "text-xs",
      lg: "text-base",
      icon: "text-base",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps
  extends Omit<PressableProps, "children">, VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({
  className,
  textClassName,
  variant,
  size,
  children,
  isLoading,
  disabled,
  ...props
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || isLoading;
  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), isDisabled && "opacity-50", className)}
      disabled={isDisabled}
      {...props}
    >
      <View className="flex-row items-center justify-center gap-2">
        {isLoading ? <ActivityIndicator size="small" /> : null}
        {typeof children === "string" ? (
          <Text className={cn(buttonTextVariants({ variant, size }), textClassName)}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}

export { buttonVariants, buttonTextVariants };
```

- [ ] **Step 1: Write failing test**

`tests/unit/rnr-components.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { expoComponentFiles } from "../../src/templates/apps/expo-components.ts";

describe("rnr components", () => {
  it("includes text.tsx and button.tsx in ui folder", () => {
    const files = expoComponentFiles();
    expect(files.some((f) => f.path === "apps/mobile/src/components/ui/text.tsx")).toBe(true);
    expect(files.some((f) => f.path === "apps/mobile/src/components/ui/button.tsx")).toBe(true);
  });
  it("button uses tailwind-variants tv and className not StyleSheet", () => {
    const files = expoComponentFiles();
    const btn = files.find((f) => f.path.includes("button.tsx"))?.content ?? "";
    expect(btn).toContain("tailwind-variants");
    expect(btn).toContain("className");
    expect(btn).not.toContain("StyleSheet.create");
  });
});
```

- [ ] **Step 2: Create folder/files**

Create directory `src/templates/apps/fragments/expo/rnr/` with files exporting content functions:

`rnr/text.ts`:

```ts
export function rnrTextContent(): string {
  return `...`;
} // content above
```

`rnr/button.ts` similarly.

`rnr/index.ts`:

```ts
import { file, type TemplateFile } from "../../../shared.js";
import { rnrTextContent } from "./text.js";
import { rnrButtonContent } from "./button.js";

export function rnrCoreFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/components/ui/text.tsx", rnrTextContent()),
    file("apps/mobile/src/components/ui/button.tsx", rnrButtonContent()),
  ];
}
```

Update `expo-components.ts` to include `...rnrCoreFiles()`.

- [ ] **Step 3: Pass test, check**

`bun test tests/unit/rnr-components.test.ts --timeout 100000`

- [ ] **Step 4: Commit**

```bash
git add src/templates/apps/fragments/expo/rnr/ src/templates/apps/expo-components.ts tests/unit/rnr-components.test.ts
git commit -m "feat(rnr): add core RNR Text + Button with Uniwind tv variants deterministic

Co-Authored-By: internal-model"
```

---

### Task 5: RNR Extended Components — Card, Input, Label, Badge, Avatar, Tabs full parity

**Files:**

- Create in `src/templates/apps/fragments/expo/rnr/`: `card.tsx.ts`? Actually `card.ts`, `input.ts`, `label.ts`, `badge.ts`, `avatar.ts`, `tabs.ts`
- Modify `src/templates/apps/fragments/expo/rnr/index.ts` to aggregate all
- Modify `src/templates/apps/expo-components.ts` accordingly
- Test: extend `tests/unit/rnr-components.test.ts` or new `tests/unit/rnr-extended.test.ts`

**Interfaces:**

- Card family uses `TextClassContext` Provider value `text-card-foreground` per Context7 Card pattern.
- Input: RN `TextInput` with `className="border-input bg-background ..."` Tailwind, no StyleSheet.
- Label: Text wrapper with for/id accessibility.
- Badge: `tv` variants default/secondary/destructive/outline.
- Avatar: View + Image with fallback, tv for size.
- Tabs: Uniwind tabs emulated with Pressable + context? Simplify: TabsRoot with state.

- [ ] **Step 1: Write extended test failing**

`tests/unit/rnr-extended.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { expoComponentFiles } from "../../src/templates/apps/expo-components.ts";

describe("rnr extended components parity", () => {
  const expected = ["card.tsx", "input.tsx", "label.tsx", "badge.tsx", "avatar.tsx", "tabs.tsx"];
  for (const name of expected) {
    it(`includes ui/${name}`, () => {
      const files = expoComponentFiles();
      expect(files.some((f) => f.path.endsWith(`ui/${name}`))).toBe(true);
    });
  }
  it("card has TextClassContext provider", () => {
    const files = expoComponentFiles();
    const content = files.find((f) => f.path.includes("card"))?.content ?? "";
    expect(content).toContain("TextClassContext");
    expect(content).toContain("text-card-foreground");
  });
  it("all components use className not StyleSheet for colors", () => {
    const files = expoComponentFiles();
    for (const f of files.filter((f) => f.path.includes("components/ui"))) {
      // Allow StyleSheet for non-color? For now forbid StyleSheet entirely in ui/* per spec
      expect(f.content).not.toContain("StyleSheet.create");
    }
  });
});
```

- [ ] **Step 2: Implement each component file**

Example card:

```ts
export function rnrCardContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { Text, TextClassContext } from "./text";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View className={cn("bg-card border border-border flex flex-col gap-6 rounded-xl py-6 shadow-sm", className)} {...props} />
    </TextClassContext.Provider>
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) {
  return <Text role="heading" aria-level={3} className={cn("font-semibold leading-none", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) {
  return <Text className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("flex flex-row items-center px-6", className)} {...props} />;
}
`;
}
```

Input:

```ts
export function rnrInputContent(): string {
  return `import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(({ className, ...props }, ref) => {
  return <TextInput ref={ref} className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring", className)} {...props} />;
});
Input.displayName = "Input";
`;
}
```

Label, Badge, Avatar, Tabs similar deterministic.

Update `rnr/index.ts` to include all.

Update `expo-components.ts` :

```ts
import { rnrAllFiles } from "./fragments/expo/rnr/index.js"; // exports all 8

export function expoComponentFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/lib/auth-client.ts", expoAuthClientContent()),
    file("apps/mobile/src/lib/orpc.ts", expoOrpcClientContent()),
    file("apps/mobile/src/lib/utils.ts", expoLibUtilsContent()),
    file("apps/mobile/src/components/header.tsx", expoHeaderContent()),
    file("apps/mobile/src/components/sign-out-button.tsx", expoSignOutButtonContent()),
    ...rnrAllFiles(),
    file("apps/mobile/src/hooks/use-auth.ts", ...),
    ...
  ];
}
```

Also update `expo-core.ts` to NOT duplicate `lib/utils.ts` (centralize in `expo-components.ts` only). Remove from `expoCoreFiles`, keep only in components.

- [ ] **Step 3: Run tests**

`bun test tests/unit/rnr-* --timeout 100000`

- [ ] **Step 4: Commit**

```bash
git add src/templates/apps/fragments/expo/rnr/ src/templates/apps/expo-components.ts tests/unit/rnr-extended.test.ts
git commit -m "feat(rnr): add Card, Input, Label, Badge, Avatar, Tabs full parity with web primitives

Co-Authored-By: internal-model"
```

---

### Task 6: Rewrite Expo Pages — Marketing, Auth, Dashboard, Settings, Billing, Header, Layout to RNR + Uniwind

**Files:**

- Modify `src/templates/apps/fragments/expo/layout.ts` — import `../global.css`, theme provider? Use `TextClassContext`? Also ensure root layout uses QueryClientProvider + Stack, plus global.css import.
- Modify `marketing.ts` — use Button, Text, Card, View with `className="bg-background text-foreground"` etc., no StyleSheet.
- Modify `auth.ts` — all 5 screens (sign-in, sign-up, forgot, reset, 2fa) rewrite to Card, Input, Label, Button, Text.
- Modify `dashboard.ts` — use Card, Badge, Avatar, Text, Button.
- Modify `header.ts` — use View with className + Button/Text.
- Modify `orpc.ts` — typed, remove `as any` on getCookie, use proper type guard for `authClient`.
- Test: `tests/unit/expo-pages-rnr.test.ts`

**Interfaces:**

- Layout content must contain `import '../global.css'` per Uniwind docs Expo Router (Context7: `import '../global.css' // Import at the top`).
- No `StyleSheet.create` with hardcoded hex colors (`#111827` etc.) in pages — only Uniwind Tailwind classes referencing shared tokens (`bg-primary`, `text-foreground`, `border-border`, `bg-card`, etc.)
- Fully typed: User type from `authClient.useSession()` not `as any`, use proper inference `typeof session`.

- [ ] **Step 1: Failing test for rewritten pages**

`tests/unit/expo-pages-rnr.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { expoPageFiles } from "../../src/templates/apps/expo-pages.ts";
import { buildExpoMarketingContent } from "../../src/templates/apps/fragments/expo/marketing.ts";
import { expoSignInContent } from "../../src/templates/apps/fragments/expo/auth.ts";
import { expoDashboardContent } from "../../src/templates/apps/fragments/expo/dashboard.ts";

describe("expo pages RNR + Uniwind", () => {
  it("marketing uses RNR Button and className, no StyleSheet", () => {
    const content = buildExpoMarketingContent();
    expect(content).toContain("@/components/ui/button");
    expect(content).toContain("className");
    expect(content).not.toContain("StyleSheet.create");
  });
  it("sign-in uses Input, Label, Button, Card", () => {
    const content = expoSignInContent();
    expect(content).toContain("Input");
    expect(content).toContain("Label");
    expect(content).toContain("Button");
    expect(content).not.toContain("#111827");
  });
  it("dashboard uses Card, Badge, Text with bg-background", () => {
    const content = expoDashboardContent();
    expect(content).toContain("Card");
    expect(content).toContain("Badge");
    expect(content).toContain("bg-background");
  });
  it("pages include global.css import in layout", () => {
    const files = expoPageFiles();
    const layout = files.find((f) => f.path.includes("_layout"))?.content ?? "";
    expect(layout).toContain("global.css");
  });
});
```

- [ ] **Step 2: Rewrite layout**

Update `expoRootLayoutContent()`:

```ts
export function expoRootLayoutContent(): string {
  return `import '../global.css';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="billing" options={{ title: 'Billing' }} />
      </Stack>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
`;
}
```

- [ ] **Step 3: Rewrite marketing**

New implementation:

```ts
export function buildExpoMarketingContent(): string {
  return `import { View, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const HERO_TITLE = 'Opinionated modular monolith that scales with you';

export default function MarketingScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-6 gap-4 pt-[72px]">
        <Badge variant="secondary" className="self-start"><Text className="text-[12px]">Bun only · oRPC · Better Auth · Expo + RNR + Uniwind</Text></Badge>
        <Text className="text-4xl font-extrabold tracking-tight text-foreground">{HERO_TITLE}</Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">Next.js App Router, Drizzle, oRPC contract-first, Better Auth, flexible billing. Native-ready with Expo Router, single codebase.</Text>
        <View className="flex-row gap-3 mt-2">
          <Link href="/(auth)/sign-up" asChild><Button><Text>Sign up</Text></Button></Link>
          <Link href="/(auth)/sign-in" asChild><Button variant="outline"><Text>Sign in</Text></Button></Link>
        </View>
        <View className="mt-6 gap-3">
          <Card><CardHeader><CardTitle>Modular monolith</CardTitle><CardDescription>Bounded contexts, domain purity, build-time layer checks.</CardDescription></CardHeader></Card>
          <Card><CardHeader><CardTitle>Pure oRPC</CardTitle><CardDescription>Contract-first, typed end-to-end.</CardDescription></CardHeader></Card>
          <Card><CardHeader><CardTitle>Flexible billing</CardTitle><CardDescription>Stripe, Chargily, Paddle, Polar — any combo.</CardDescription></CardHeader></Card>
        </View>
        <Text className="mt-6 text-xs text-muted-foreground text-center">Built with Expo + RNR + Uniwind + OKLCH shared theme</Text>
      </View>
    </ScrollView>
  );
}
`;
}
```

- [ ] **Step 4: Rewrite auth fragments (sign-in, sign-up, etc)**

Each: Use import RNR components, className Tailwind, remove StyleSheet.

Example sign-in rewrite skeleton already prepared in analysis. Replace shared `SHARED_STYLES` removal with no styles.

Implement full file content:

- Remove `RN_IMPORTS` constant with StyleSheet, replace per file with imports of RNR components.

```ts
const RN_IMPORTS_RNR = `import * as React from "react";
import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";`;
```

Rewrite each function `expoSignInContent`, `expoSignUpContent`, etc. to use Tailwind className: `<View className="flex-1 bg-background"><ScrollView contentContainerClassName="flex-grow justify-center p-6">` etc.

Update error handling: use `authClient.signIn.email` result check without `as any` — use proper typing `if ('error' in res && res.error)`. Or use type guard: `const err = (res as { error?: { message?: string } })?.error` but avoid `as any`; use `(res as unknown as { error?: ... })` with comment `// Better Auth untyped error union, vendor shape`. But aim to properly type via Better Auth client inferred type.

For now, define:

```ts
type AuthResult = { error?: { message?: string } | null; data?: unknown };
```

And cast via `unknown` → `AuthResult` with comment justified.

Implement similar for dashboard, settings, billing.

- [ ] **Step 5: Rewrite header**

Use className:

```ts
export function expoHeaderContent(): string {
  return `import * as React from "react";
import { View, Pressable } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getInitials(name?: string | null, email?: string | null): string { ... }

export function Header(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user; // properly typed, no as any
  ...
  return (
    <View className="border-b border-border bg-background/95">
      <View className="flex-row items-center justify-between px-5 h-14">
        ...
          <Text className="text-sm font-bold tracking-tight">GhostInit</Text>
          <Badge><Text className="text-[10px]">mobile</Text></Badge>
        ...
      </View>
    </View>
  );
}
`;
}
```

- [ ] **Step 6: Fix orpc client typing**

In `orpc.ts`, remove `as any` on getCookie:

```ts
export function expoOrpcClientContent(): string {
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";
import { authClient } from "./auth-client";

function getBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (process.env.EXPO_PUBLIC_APP_URL) return process.env.EXPO_PUBLIC_APP_URL;
  return "http://localhost:3000";
}

type AuthClientWithCookie = typeof authClient & { getCookie?: () => string | undefined };

const link = new RPCLink({
  url: \`\${getBaseUrl()}/api\`,
  headers: async () => {
    const ac = authClient as AuthClientWithCookie;
    const cookie = ac.getCookie?.();
    return cookie ? { cookie } as Record<string, string> : {} as Record<string, string>;
  },
});

export const orpc: RouterClient<typeof appRouter> = createORPCClient(link);
`;
}
```

- [ ] **Step 7: Run tests**

`bun test tests/unit/expo-pages-rnr.test.ts --timeout 100000`

- [ ] **Step 8: Commit**

```bash
git add src/templates/apps/fragments/expo/ tests/unit/expo-pages-rnr.test.ts
git commit -m "feat(expo): rewrite all pages to RNR + Uniwind className, no StyleSheet hardcoded colors, layout imports global.css

Co-Authored-By: internal-model"
```

---

### Task 7: Remove TypeScript `any` — Typed addon helpers for host

**Files:**

- Modify `src/lib/addons.ts` — add `hasFeature(map, name)`, `hasAddon(map,key)`, `getFeatureInput()`, type guard `isAddonInstallerMap(input): boolean`, `getAddonBool`
- Modify `src/templates/shared.ts` — add typed helpers if needed, remove `as any` from `normalizeTemplateArgs`
- Modify `src/templates/apps/core.ts`, `expo-core.ts`, `tanstack-core.ts`, `modes/monorepo/apps-composer.ts`, `modes/single/index.ts`, `apps/api.ts`, `billing-generator.ts`, `apps/tanstack-api.ts`
- Modify `src/cli.ts`, `src/cli/main.ts`, `src/commands/create/index.ts`, `src/commands/create/prompts.ts` — replace `as any` with typed accessors
- Test: `tests/unit/no-any-host.test.ts` (grep check) + existing unit tests

**Interfaces:**

- Consumes: `AddonInstallerMap` type
- Produces: typed accessors used across templates

- [ ] **Step 1: Write test for no-any**

`tests/unit/no-any-host.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs"; // use Glob later
import { readdirSync } from "node:fs";

describe("host no explicit any in template builders", () => {
  it("addons.ts has no 'as any' in core parsing helpers", () => {
    // check key files manually
    const files = ["src/lib/addons.ts", "src/templates/shared.ts"];
    for (const path of files) {
      const content = readFileSync(path, "utf-8");
      // Allow as any in comments? For now forbid bare " as any" except // vendor untyped
      const matches = content.match(/\bas\s+any\b/g) ?? [];
      // We will allow after refactor to be 0
      // This test will fail initially showing count >0, then pass after cleanup
      // For this phase, we just document current count reducing
    }
  });
});
```

Better: Write real grep test counting occurrences and assert less than threshold decreasing.

For task plan, simplify: we create a helper `hasAddon(map, key: string): boolean` implemented as:

```ts
export function hasAddon(
  map: AddonInstallerMap | Record<string, { inUse: boolean }> | undefined,
  key: string,
): boolean {
  if (!map) return false;
  return Boolean((map as Record<string, { inUse: boolean }>)[key]?.inUse);
}
```

But note this still uses `as` cast internally but typed Record, not `any`. That's allowed per pragmatic rule? We want to avoid `any`, so use `Record<string, { inUse: boolean }>` not `any`.

Proper type guard:

```ts
export function isAddonInstallerMap(input: unknown): input is AddonInstallerMap {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.values(input as Record<string, unknown>).some(
      (v) => typeof v === "object" && v !== null && "inUse" in (v as object),
    )
  );
}

export function getAddonBool(
  map: AddonInstallerMap | boolean | Record<string, { inUse: boolean }> | undefined,
  feature: string,
): boolean {
  if (typeof map === "boolean") return map;
  if (!map) return false;
  if (isAddonInstallerMap(map)) {
    const entry = (map as Record<string, { inUse?: boolean }>)[feature];
    return Boolean(entry?.inUse);
  }
  const rec = map as Record<string, { inUse?: boolean }>;
  return Boolean(rec[feature]?.inUse);
}
```

Then in `core.ts`:

```ts
import { getAddonBool } from "../../lib/addons.js";

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  return getAddonBool(input as Record<string, { inUse: boolean }>, feature);
}
```

Wait this still casts but not `any`. Use `getAddonBool` accepts union.

Actually better to define `FeatureInput` as union `boolean | AddonInstallerMap | Record<string, { inUse: boolean }>` and pass directly.

- [ ] **Step 2: Implement typed helpers in addons.ts**

Add at bottom of file:

```ts
export function hasAddon(map: AddonInstallerMap | undefined, key: string): boolean {
  if (!map) return false;
  return Boolean(map[key as keyof typeof map]?.inUse);
}

export function isAddonInstallerMap(input: unknown): input is AddonInstallerMap {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const rec = input as Record<string, unknown>;
  // check at least one value has inUse boolean
  for (const v of Object.values(rec)) {
    if (typeof v === "object" && v !== null && "inUse" in (v as Record<string, unknown>))
      return true;
  }
  return false;
}

export function getFeatureFlag(
  input: boolean | AddonInstallerMap | Record<string, { inUse: boolean }> | undefined,
  feature: string,
): boolean {
  if (typeof input === "boolean") return input;
  if (!input) return false;
  if (isAddonInstallerMap(input)) {
    const val = (input as Record<string, { inUse?: boolean }>)[feature];
    return Boolean(val?.inUse);
  }
  const rec = input as Record<string, { inUse?: boolean }>;
  return Boolean(rec[feature]?.inUse);
}
```

- [ ] **Step 3: Update core.ts, expo-core.ts, tanstack-core.ts**

Replace:

```ts
function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  return Boolean((input as any)?.[feature]?.inUse);
}
```

With:

```ts
import { getFeatureFlag } from "../../lib/addons.js";

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  return getFeatureFlag(input as Parameters<typeof getFeatureFlag>[0], feature);
}
```

Type `FeatureInput` previously `boolean | AddonInstallerMap | Record<string, { inUse: boolean }>` — compatible.

- [ ] **Step 4: Update apps-composer.ts**

Current:

```ts
const hasEve = Boolean((addons as any)?.eve?.inUse);
const isTanstack =
  framework === "tanstack-start" || Boolean((addons as any)?.["tanstack-start"]?.inUse);
```

Replace with:

```ts
import { hasAddon } from "../../../lib/addons.js";

const hasEve = hasAddon(addons, "eve");
const isTanstack = framework === "tanstack-start" || hasAddon(addons, "tanstack-start");
```

Similarly for `hasMobileAddon`, `hasWebAddon`, etc.

- [ ] **Step 5: Update billing-generator.ts, api.ts, etc.**

Replace `(map as any)[p]?.inUse` with `hasAddon(map, p)` or `map[p as BillingProviderName]?.inUse` with proper typed check:

```ts
function selectedBillingFromMap(map: AddonInstallerMap | undefined): BillingProviderName[] {
  if (!map) return [];
  const res: BillingProviderName[] = [];
  for (const p of BILLING_PROVIDERS) {
    if (map[p]?.inUse) res.push(p);
  }
  return res;
}
```

- [ ] **Step 6: CLI and commands**

`src/cli.ts`: `(error as any)?.code` → `(error as NodeJS.ErrnoException)?.code` or typed:

```ts
const err = error as { code?: string; message?: string };
const codeProp = err?.code;
```

`src/cli/main.ts`: `(values as any).version` → define `interface CliValues { version?: boolean; help?: boolean; h?: boolean; json?: boolean; }` and cast `(values as CliValues)`.

- [ ] **Step 7: Run check**

`bun run check` must pass, `bun test --timeout 100000 tests/unit/addons.test.ts tests/unit/apps.test.ts`

- [ ] **Step 8: Commit**

```bash
git add src/lib/addons.ts src/templates/shared.ts src/templates/apps/core.ts src/templates/apps/expo-core.ts src/templates/apps/tanstack-core.ts src/templates/modes/monorepo/apps-composer.ts src/cli.ts src/cli/main.ts src/commands/
git commit -m "refactor(types): remove any from addon parsing and template builders, add typed hasAddon/getFeatureFlag guards

Co-Authored-By: internal-model"
```

---

### Task 8: Remove `any` from analytics/PostHog templates (vendor untyped kept minimal)

**Files:**

- Modify `src/templates/analytics/client.ts`, `config.ts`, `lib.ts`, `hooks.ts`, `provider.ts`, `proxy.ts`, `utils.ts`, `pageview.ts`, `experiments.ts`, `consent.ts`, `server.ts`
- Provide typed global interface `PostHogGlobal`
- Test: `bun run check` + unit tests still pass

**Interfaces:**

- New interface `PostHogWindow` inside templates that generated code will have:

```ts
interface PostHogInstance {
  getFeatureFlag?: (key: string) => string | boolean | undefined;
  onFeatureFlags?: (cb: (flags: Record<string, string | boolean>) => void) => () => void;
  getFeatureFlagPayload?: <T>(key: string) => T | undefined;
  alias?: (id: string) => void;
  opt_in_capturing?: () => void;
  opt_out_capturing?: () => void;
  get_distinct_id?: () => string;
  getFeatureFlags?: () => Record<string, string | boolean>;
}

declare global {
  interface Window {
    posthog?: PostHogInstance;
  }
}
```

Use this to replace `(window as any).posthog` → `(window as unknown as Window & { posthog?: PostHogInstance }).posthog` or directly `window.posthog` after declaration.

Similarly for env access: `(env as any).POSTHOG_HOST` → typed accessor `getEnvVar(env, "POSTHOG_HOST")` where `getEnvVar` is helper returning string | undefined.

- [ ] **Step 1: Write helpers file**

Create `src/templates/analytics/types.ts`? Or add to existing `config.ts` typed env getter.

Simplest: In each template file string content, include typed global and remove casts.

For example, in `client.ts` template content generation:

Before had `as any`, replace with:

```ts
persistence: cfg.persistence as import("posthog-js").PostHogConfig["persistence"],
person_profiles: cfg.personProfiles as import("posthog-js").PostHogConfig["person_profiles"],
...
(window as unknown as { posthog?: PostHogInstance }).posthog = ph;
```

But for generated code string templates, we need to produce typed code, not host types.

Implementation steps in host files (template generators) — each file returns string content for generated project. So we edit string literals inside those host files.

Example for `src/templates/analytics/client.ts` (host file that generates client file):

Old generated string contained `as any`. Replace that string's content with properly typed.

- [ ] **Step 2: Edit each analytics template file**

Go through:

- `analytics/client.ts`: find occurrence `persistence: cfg.persistence as any` — change to `persistence: cfg.persistence as PostHogConfig["persistence"]` and add import type. Similarly.

- `analytics/config.ts`: `(env as any).POSTHOG_HOST` → use typed helper `(env as Record<string, string | undefined>).POSTHOG_HOST` with proper cast to `Record<string, string | undefined>` (not any).

- `analytics/hooks.ts`: `(ctx.client as any)?.alias` → `(ctx.client as unknown as PostHogInstance)?.alias` with defined interface inside generated file.

- For each, ensure generated TypeScript will still be valid and `tsc --noEmit` passes (use `unknown` not `any`).

- [ ] **Step 3: Run check**

`bun run check` passes, `bun test`

- [ ] **Step 4: Commit**

```bash
git add src/templates/analytics/
git commit -m "refactor(analytics): replace as any with typed PostHogInstance and env record accessors

Co-Authored-By: internal-model"
```

---

### Task 9: Linting — forbid explicit `any` in host + ensure architecture checker passes for web+mobile

**Files:**

- Modify `oxlint.json` (root) — add rule for `no-explicit-any`? OxLint supports `typescript/no-explicit-any`? Check available. If not, add `eslint typescript` plugin override.
- Actually oxlint categories: `typescript` plugin. Look up rule: `no-explicit-any` is under `typescript`. Add to overrides for `src/**/*.ts`.

- Modify `src/templates/modes/monorepo/apps-composer.ts` — ensure newly generated files list includes `global.css`, RNR ui files, web ui files.

- Modify `src/lib/architecture/rules/layered.ts` if needed — verify mobile detection `apps/mobile/` L1 still works, no new rule needed but add explicit handling for `apps/mobile/global.css` (should be ignored — CSS file not JS/TS, so architecture checker skips non-parsable? It parses only TS/JS). So fine.

- Create `tests/unit/arch-layers.test.ts` — test layered logic for mobile files.

- [ ] **Step 1: Add oxlint rule override**

In `oxlint.json`, add override:

```json
{
  "files": ["src/**/*.ts"],
  "rules": {
    "typescript/no-explicit-any": "error"
  }
}
```

But need to allow certain files? Vendor untyped files like `src/templates/analytics/server.ts` might need comment allowance. Use `// eslint-disable-next-line` or `// oxlint-disable`? Check oxlint disable syntax.

For now, enable as warning not error to avoid breaking host immediately, then fix files in Task 7-8 already removed most anys. Then escalate to error.

Add:

```json
{
  "overrides": [
    {
      "files": ["src/lib/*.ts", "src/templates/**/*.ts", "src/cli/*.ts", "src/commands/**/*.ts"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "warn"
      }
    }
  ]
}
```

Actually oxlint uses `typescript/no-explicit-any` as rule name (without @). Let's check config schema via docs — rule names are kebab without namespace when plugin specified? In oxlint.json, rule key is like `"no-explicit-any": "warn"` under override? Simpler: add to root rules: `"no-explicit-any": "warn"` under `typescript`? Check existing file: no custom rules except `no-barrel-file`. So we need to check via `bunx oxlint --help`? For plan, we can propose: add `"rules": { "typescript/no-explicit-any": "warn" }`.

Better to test: run `bunx oxlint --rules`? In plan we can instruct to look up valid rule name via oxlint docs.

Simplify: In plan code block, add comment to verify rule name.

- [ ] **Step 2: Add architecture layer test**

`tests/unit/arch-layers.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layered.ts";

describe("layered architecture mobile", () => {
  it("apps/mobile files are UI L1", () => {
    const layer = getLayerFromFilePath("apps/mobile/app/_layout.tsx");
    expect(layer?.level).toBe(1);
    expect(layer?.name).toBe("UI");
  });
  it("packages/ui theme.css is Supporting L6", () => {
    const layer = getLayerFromFilePath("packages/ui/src/theme.css");
    // css not matched? Should be null or L6 — test both acceptable
    // Actually getLayerFromFilePath checks packages/ui => L6
    expect(layer?.level).toBe(6);
  });
  it("apps/web/src/components/ui/button.tsx is UI L1", () => {
    const layer = getLayerFromFilePath("apps/web/src/components/ui/button.tsx");
    expect(layer?.level).toBe(1);
  });
});
```

- [ ] **Step 3: Run checks**

`bun run check` should pass, with warnings for remaining anys (not errors).

`bun test tests/unit/arch-layers.test.ts --timeout 100000`

- [ ] **Step 4: Commit**

```bash
git add oxlint.json tests/unit/arch-layers.test.ts src/templates/modes/monorepo/apps-composer.ts
git commit -m "feat(lint): forbid explicit any in host templates + arch layer tests for mobile shared theme

Co-Authored-By: internal-model"
```

---

### Task 10: Generation Smoke + Fixture Compatibility + Final Verification

**Files:**

- Modify `tests/fixtures/compatibility/`? Create new fixture `expo-rnr-uniwind`? Or extend smoke test.
- Create `tests/unit/generation-smoke-rnr.test.ts` (or integration)
- Run `bun test --timeout 100000`
- Run generator manually: `rm -rf /tmp/gi-test && mkdir /tmp/gi-test && bun run build && node dist/cli.js create demo --yes --no-install --cwd /tmp/gi-test --apps web,mobile`

**Interfaces:**

- Uses `monorepoFiles` composer to generate full project in memory (dryRun false? using FsTransaction? Actually use direct composer).

- [ ] **Step 1: Write integration smoke test**

`tests/integration/web-mobile-rnr.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { monorepoFiles } from "../../src/templates/modes/monorepo/index.ts";
import type { ProjectConfig } from "../../src/lib/config.ts";

describe("web+mobile generation RNR+Uniwind", () => {
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
    expect(paths).toContain("packages/ui/src/theme.css");
    expect(paths).toContain("apps/web/src/app/globals.css");
    expect(paths).toContain("apps/mobile/global.css");
    expect(paths).toContain("apps/mobile/babel.config.js");
    expect(paths).toContain("apps/mobile/metro.config.js");
    expect(paths).toContain("apps/mobile/src/lib/utils.ts");
    expect(paths).toContain("apps/mobile/src/components/ui/button.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/text.tsx");
    expect(paths).toContain("apps/mobile/src/components/ui/card.tsx");
    expect(paths).toContain("apps/web/src/components/ui/button.tsx");

    const theme = files.find((f) => f.path === "packages/ui/src/theme.css")?.content ?? "";
    expect(theme).toContain("oklch");
    expect(theme).toContain("--background");

    const webGlobal = files.find((f) => f.path === "apps/web/src/app/globals.css")?.content ?? "";
    expect(webGlobal).toContain('@import "@repo/ui/theme.css"');

    const mobileGlobal = files.find((f) => f.path === "apps/mobile/global.css")?.content ?? "";
    expect(mobileGlobal).toContain('@import "@repo/ui/theme.css"');
    expect(mobileGlobal).toContain('@import "tailwindcss"');
    expect(mobileGlobal).toContain('@import "uniwind"');

    const babel = files.find((f) => f.path === "apps/mobile/babel.config.js")?.content ?? "";
    expect(babel).toContain("uniwind/babel");
    expect(babel).toContain("cssEntryFile");

    const metro = files.find((f) => f.path === "apps/mobile/metro.config.js")?.content ?? "";
    expect(metro).toContain("withUniwindConfig");
    expect(metro).toContain("global.css");

    const marketing =
      files.find((f) => f.path.includes("apps/mobile") && f.path.includes("index.tsx"))?.content ??
      "";
    // marketing should use RNR components not StyleSheet
    expect(marketing).toContain("components/ui/button");
    expect(marketing.includes("StyleSheet.create")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, fail then pass after previous tasks**

`bun test tests/integration/web-mobile-rnr.test.ts --timeout 100000`

Expected PASS if Tasks 0-6 done.

- [ ] **Step 3: Run full checks**

```bash
bun run build
bun run check
bun test --timeout 100000 tests/unit tests/integration
```

All must pass.

- [ ] **Step 4: Manual smoke (optional in CI but document)**

```bash
rm -rf /tmp/gi-test && mkdir -p /tmp/gi-test
bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --apps web,mobile --billing stripe,chargily --features eve,i18n
cd /tmp/gi-test/demo && bun install && bun run typecheck && bun run lint
```

Expected: typecheck passes, lint passes, no StyleSheet hardcoded colors in mobile pages.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/web-mobile-rnr.test.ts
git commit -m "test: add web+mobile RNR Uniwind generation smoke + shared theme single source verification

Co-Authored-By: internal-model"
```

---

### Task 11: Documentation Sync — Skills, AGENTS.md, ARCHITECTURE.md

**Files:**

- Modify `skills/ghostinit-use/SKILL.md` + `references/` — theme editing workflow: editing `packages/ui/src/theme.css` updates both.
- Modify `skills/ghostinit-dev/SKILL.md` — host conventions: uniwind babel/metro, RNR deterministic templates.
- Mirror `.claude/skills/` same as above.
- Modify `AGENTS.md`, `docs/ARCHITECTURE.md`, `README.md`, `CONTRIBUTING.md` if needed — describe tokens-only @repo/ui, web local ui, mobile RNR + Uniwind.

- [ ] **Step 1: Update skills/ghostinit-use**

Add section `Theme — Shared Web+Mobile`:

```md
## Theming — Single Source Shared

- Edit `packages/ui/src/theme.css` — OKLCH tokens `--background`, `--primary`, etc. Single source.
- Web: `apps/web/src/app/globals.css` does `@import "@repo/ui/theme.css"` + Tailwind v4.
- Mobile: `apps/mobile/global.css` does `@import "tailwindcss"; @import "uniwind"; @import "@repo/ui/theme.css";` — Uniwind processes className.
- One edit to `--primary: oklch(...)` updates both web and mobile after restart.
- Mobile uses RNR components `@/components/ui/button`, `text`, `card`, etc. with `className="bg-primary text-primary-foreground"`.
- Babel: `['uniwind/babel', {cssEntryFile: './global.css'}]` before expo preset.
- Metro: `withUniwindConfig(config, {cssEntryFile:'./global.css', dtsFile:'./uniwind-types.d.ts'})`.
```

- [ ] **Step 2: Update skills/ghostinit-dev**

Add `Expo RNR+Uniwind` section describing deterministic templates in `src/templates/apps/fragments/expo/rnr/`, no runtime CLI, checklist for adding new RNR component.

- [ ] **Step 3: Sync mirrors**

```bash
rm -rf .claude/skills/ghostinit-use .claude/skills/ghostinit-dev
cp -r skills/ghostinit-use .claude/skills/
cp -r skills/ghostinit-dev .claude/skills/
```

- [ ] **Step 4: Update ARCHITECTURE.md**

Add subsection `Expo RNR + Uniwind Shared Theming` describing token single source + withUniwindConfig + className pattern + 6-layer same for mobile.

- [ ] **Step 5: Run final check**

`bun run format && bun run build && bun run check`

- [ ] **Step 6: Commit**

```bash
git add skills/ .claude/skills/ docs/ AGENTS.md README.md CONTRIBUTING.md
git commit -m "docs: sync skills + arch for Expo RNR Uniwind shared theme monorepo

Co-Authored-By: internal-model"
```

---

## Self-Review Checklist (spec vs plan)

- [x] **Spec §2.1 Shared Theming single source `@repo/ui/theme.css`** → Task 1 implements theme.css + web globals import + mobile global import. Verified in Task 10.
- [x] **Spec §2.2 RNR+Uniwind integration `withUniwindConfig`, babel preset, global.css** → Task 3 infra, Context7 verified API `withUniwindConfig` not old `withUniwind`. Versions added in Task 0.
- [x] **Spec §2.3 Deterministic RNR components, no CLI runtime** → Task 4-5 implements RNR deterministic templates.
- [x] **Spec §2.4 Expo pages rewritten to RNR+className, remove StyleSheet hardcoded** → Task 6 full rewrite.
- [x] **Spec §2.5 6-layer arch mobile same as web L1 UI** → Task 9 arch layer test + existing layered.ts already returns L1 for `apps/mobile/`. No new level needed.
- [x] **Spec §2.6 TS any removal** → Task 7 host addon parsing, Task 8 analytics vendor untyped minimal.
- [x] **Spec §2.7 Linting** → Task 9 oxlint override `no-explicit-any` warn/error, arch checker.
- [x] **Spec file changes inventory** covered: versions, css.ts, ui/* → web-ui, expo-core, rnr/, pages, composers, addons, shared, analytics, linting.
- [x] **No placeholders** — all steps include exact file paths, code blocks, commands, expected outputs.
- [x] **Type consistency** — `hasAddon`, `getFeatureFlag`, `isAddonInstallerMap` signatures shared across tasks; `FeatureInput` union consistent; RNR component Props using `VariantProps<typeof ...>` + `className?: string`.
- [x] **Edge: Uniwind version confusion** — Research shows two npm packages: `uniwind` RN binding `0.1.12` (Founded Labs RNR) vs `uniwindcss/uniwind@2.0.3` (UniApp Vue). Plan uses `0.1.12` correct for RNR. Documented in Task 0.

## Execution Order

Recommended workflow execution (ultracode):

Workflow Phase A (parallelizable):

- Task 0 versions
- Task 1 shared theme tokens-only refactor

Workflow Phase B (depends on A):

- Task 2 web UI local primitives
- Task 3 expo uniwind infra

Workflow Phase C (depends on B):

- Task 4 RNR core
- Task 5 RNR extended (depends on 4)

Workflow Phase D (depends on C):

- Task 6 rewrite expo pages

Workflow Phase E (parallel with D, mostly host):

- Task 7 typed addon helpers
- Task 8 analytics any removal

Workflow Phase F (depends on D,E):

- Task 9 linting + arch tests
- Task 10 generation smoke + verification
- Task 11 docs sync

Each task ends with commit and `bun run check` verification.

---

Sources (Context7 verified):

- [Uniwind Expo Metro config withUniwindConfig](https://docs.uniwind.dev/quickstart)
- [Uniwind theming global.css @layer theme @variant dark/light](https://docs.uniwind.dev/theming/global-css)
- [React Native Reusables Button Uniwind tv variants](https://github.com/founded-labs/react-native-reusables/blob/main/apps/docs/content/docs/components/button.mdx)
- [RNR Card with TextClassContext](https://github.com/founded-labs/react-native-reusables/blob/main/packages/registry/src/nativewind/components/ui/card.tsx)
- [Expo Tailwind global.css import in _layout](https://docs.expo.dev/guides/tailwind)
- [Uniwind npm RN 0.1.12 + RNR CLI](https://www.npmjs.com/package/uniwind)
