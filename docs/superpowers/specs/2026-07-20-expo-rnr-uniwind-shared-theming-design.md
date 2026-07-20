# Design Spec — Expo RNR + Uniwind, Shared Theming Monorepo, 6-Layer Arch, TS Strict

**Date:** 2026-07-20
**Status:** Approved
**Scope:** Host CLI templates + architecture checker + versions catalog + linting rules

---

## 1. Overview

### Problem
- Current Expo app uses raw `StyleSheet.create` with hardcoded colors, no shared theming with web
- Web uses Tailwind v4 + OKLCH tokens in `apps/web/src/app/globals.css`, but mobile has its own palette
- Editing colors requires touching two places; no single source of truth
- Expo pages are simple RN primitives without RNR design system
- Host codebase has scattered `as any` casts that degrade type safety
- Mobile app not structured with explicit 6-layer compliance (currently all `apps/mobile/` = UI L1, but no explicit package separation)

### Goal
- Expo uses **React Native Reusables (RNR) + Uniwind** (CSS-first Tailwind for RN, ~10x faster than NativeWind)
- **One token edit → both web + mobile updated** in monorepo (`--apps web,mobile`)
- Both web and mobile use same 6-layer architecture: UI (L1) importing shared packages (L2-L6)
- Remove unnecessary `any` usage across host repo; all templates fully typed
- Architecture linting enforces mobile compliance same as web

---

## 2. Architecture Decisions

### 2.1 Shared Theming — Single Source: `@repo/ui` Tokens Package

**Chosen:** Full refactor — `@repo/ui` becomes tokens-only package.

**Before:**
```
packages/ui/src/
  components/  (Button, Card, Badge, ... 15+ primitives) — web-only Radix/Base-UI
  lib/utils.ts (cn helper)
```

**After:**
```
packages/ui/src/
  theme.css    — OKLCH tokens (light + dark) with @theme inline mapping
  lib/utils.ts — cn() using clsx+twMerge (platform-agnostic)
  index.ts     — exports cn + re-exports theme.css path hint
  components/  REMOVED — moved to apps/web/src/components/ui/
```

Web primitives relocation:
- `apps/web/src/components/ui/` contains Button, Card, Badge, Input, Label, etc. (previously in `@repo/ui`)
- Template `core.ts` webPackage adds local ui primitives instead of importing from `@repo/ui`
- `@repo/ui` dependency kept for theme + cn()

Mobile primitives:
- `apps/mobile/src/components/ui/` contains RNR-based primitives using Uniwind className
- Full parity: Text, Button, Card, CardHeader/Content/Footer, Input, Label, Badge, Avatar, Tabs, Dialog (future), Sheet (future)

**Token single-source mechanism:**
- `packages/ui/src/theme.css` contains all OKLCH variables + `@theme inline` → Tailwind v4 magic
- Web: `apps/web/src/app/globals.css` does `@import "@repo/ui/theme.css";` + `@import "tailwindcss";`
- Mobile: `apps/mobile/global.css` (new file) contains `@import "tailwindcss"; @import "@repo/ui/theme.css"; @source` entries for Expo files + RNR component discovery, plus `@custom-variant dark`

Editing `packages/ui/src/theme.css` updates both.

**Alternative considered:** New `@repo/ui-tokens` package (non-breaking). Rejected — cleaner to break and document migration.

### 2.2 RNR + Uniwind Integration

**Dependencies added to versions catalog (`packages/versions/src/index.ts`):**

```ts
export const uniwind = {
  uniwind: "0.5.x",          // research latest
  tailwindcss: "4.3.2",      // already in catalog
  "tailwind-merge": "3.6.0", // already exists via ui.billing
  clsx: "2.1.1",
  "class-variance-authority": "0.7.1", // already via ui
  "tailwind-variants": "x.x",
  "tw-animate-css": "x.x",
} as const;

export const rnr = {
  // RNR CLI package name - used for scaffolding reference but NOT runtime dependency
  // Actual primitives are deterministic templates, not npm packages
  "react-native-reusables": "version or lib style",
} as const;
```

Actual Expo dependencies researched from RNR+Uniwind docs:
- `uniwind` (CSS runtime for RN)
- `react-native-reanimated` (required by Uniwind + many animations)
- `tailwind-merge`, `clsx`, `class-variance-authority` (already in catalog, reuse)
- `tw-animate-css` for animations

**Babel/Metro config updates:**

`apps/mobile/babel.config.js`:
```js
module.exports = function(api){
  api.cache(true);
  return {
    presets: [
      ['uniwind/babel', { cssEntryFile: './global.css' }],
      'babel-preset-expo'
    ]
  };
};
```

`apps/mobile/metro.config.js`:
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwind } = require('uniwind/metro');
const config = getDefaultConfig(__dirname);
module.exports = withUniwind(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts'
});
```

New file `apps/mobile/global.css`:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@repo/ui/theme.css";  /* single source OKLCH tokens */
@source "./app/**/*.{js,jsx,ts,tsx}";
@source "./src/**/*.{js,jsx,ts,tsx}";
@custom-variant dark (&:is(.dark *));
@theme inline already in @repo/ui/theme.css
```

Entry: `apps/mobile/app/_layout.tsx` imports `../global.css` and `uniwind/global`.

### 2.3 RNR Components — Deterministic Templates, No CLI Runtime

**No `npx @react-native-reusables/cli init` at runtime** — all RNR primitive files are deterministic string templates in host.

Structure:
```
src/templates/apps/fragments/expo/
  rnr/
    utils.ts      → cn() helper using uniwind (platform: native)
    button.tsx    → RNR Button with cva variants using Uniwind className
    text.tsx      → RNR Text component
    card.tsx      → Card family
    input.tsx     → Input + Label
    badge.tsx     → Badge
    avatar.tsx    → Avatar family
    tabs.tsx      → Tabs family
    ...
  ui-components.ts → aggregates RNR ui files for expoComponents composer
```

Each RNR component template:
- Uses `import { cn } from "@/lib/utils"` (new file `apps/mobile/src/lib/utils.ts`)
- Uses Uniwind `className` prop instead of `StyleSheet.create`
- Uses `class-variance-authority` for variant system matching web API
- Fully typed, no `as any`

Example RNR Button deterministic template:
```tsx
import * as React from "react";
import { Pressable } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const buttonVariants = cva("...tailwind classes via uniwind...", { variants: {...} });
// etc - matches RNR 2026 template patterns
```

**Lib files:**
- `apps/mobile/src/lib/utils.ts` → `cn()` using `clsx + tailwind-merge` (same as `@repo/ui` but native import path)
- `apps/mobile/src/lib/theme.ts` → optional, re-exports or constants for JS-side theme access

### 2.4 Expo Pages — Rewritten to RNR + Uniwind className

**Current:** All Expo pages use `StyleSheet.create` with hardcoded hex colors (`#111827`, `#e5e7eb`, etc.)

**New:** All pages use RNR primitives + Uniwind Tailwind classes + OKLCH via `bg-background`, `text-foreground` etc. (from shared tokens)

Pages to rewrite:
- `marketing.ts` → use RNR Button, Text, Card with `className="bg-primary text-primary-foreground"`
- `auth.ts` (sign-in, sign-up, forgot, reset, 2fa) → RNR Input, Label, Button, Card, Text
- `dashboard.ts` → Card, Button, Badge, Avatar
- `header.ts` → View with Uniwind classes instead of StyleSheet
- `layout.ts` → Root layout imports `global.css`

Zero `StyleSheet.create` for colors/borders — only for truly non-Tailwind needs (if any). Prefer className.

### 2.5 6-Layer Architecture — Mobile Same as Web

**Current state:**
- `apps/mobile/*` → all L1 UI (correct already per layered.ts)
- `apps/mobile/` imports `@repo/api`, `@repo/auth`, etc. = L1 → L2/L4/L6 (allowed, downward)

**Needed changes:**

1. **Architecture checker already handles mobile:** `layered.ts` line 66-68 returns L1 for `apps/mobile/` paths. No change needed for basic check.

2. **Explicit mobile package imports clarification:**
   - `packages/ui` → L6 Supporting (OK, but after refactor tokens-only, still L6)
   - New `@repo/ui` tokens consumed via `global.css` import, NOT JS import (CSS layer) — no arch violation
   - If web primitives moved to `apps/web/src/components/ui/` — they are L1 (web UI), allowed

3. **Ensure expo fragments don't introduce upward violations:**
   - `apps/mobile/src/lib/orpc.ts` = oRPC client → this is Transport layer conceptually but file lives in apps/mobile (L1), L1 can import Transport (allowed). However if moved to proper structure:
   - Could optionally create `packages/mobile-transport/` but YAGNI — for now `src/lib/orpc.ts` inside apps/mobile is fine as L1 importing downward via @repo packages.

4. **Generated project structure monorepo `web+mobile`:**
   ```
   apps/web/       → L1 UI (React DOM)
   apps/mobile/    → L1 UI (React Native)
   packages/api    → L2 Transport
   packages/modules/* domain → L3 Domain
   packages/modules/* application, services, billing → L4 Capabilities
   packages/billing/providers/* → L5 Vendors
   packages/database, config, kernel, ui, etc → L6 Supporting
   ```

5. **Linting:** `bun run check` (oxlint + architecture checker via `ghostinit check`) must pass for generated project.

6. **No new layer level for mobile:** Mobile stays L1. Explicit distinction not needed in checker (already correct). The key is that both apps share same L2-L6 packages.

### 2.6 TypeScript Strictness — Remove `any`

**Goal:** Zero `any` where it can be properly typed. Keep `any` only where semantically correct (e.g., truly dynamic JSON, vendor SDK returns unknown shape with no types).

**Audit scope:** Host repo `src/` — ~100 occurrences of `as any`.

**Strategy per category:**

- **Addon parsing:** `(map as any)[feature]` → introduce typed accessor `getAddonFeature(map, feature)` with proper generics
- **Template string builders:** Many `(input as any)?.[feature]` in `expo-core.ts`, `core.ts`, `tanstack-core.ts`, `apps-composer.ts` etc → use typed discriminated union or proper type guards `isAddonInstallerMap(input)`
- **Analytics/PostHog:** `(window as any).posthog`, `(ctx.client as any)` → use proper PostHog type definitions or `unknown` with type guards where PostHog JS SDK types missing. Create `PostHogGlobal` interface
- **Config building:** `config.ts` layering, `as any` for `experimental.turbo` deletion → use typed helper `removeExperimentalTurbo(config: NextConfig)`
- **CLI args:** `(values as any).json` → properly typed `CliValues` interface
- **Error handling:** `(error as any)?.code` → `NodeJS.ErrnoException` or typed error interface

**Rules for new code (all Expo/RNR templates):**
- No `any` in template string builders (host) — all helpers typed
- Generated RNR components fully typed: explicit prop interfaces, `VariantProps` from CVA properly used
- Auth client typing: `authClient.useSession()` return type handled via Better Auth types, not `as any`
- User type: `session?.user` has proper type from Better Auth, not `as { name?: string }`

**Implementation approach:**
- Add `oxlint` rule: forbid `any` (enable `@typescript-eslint/no-explicit-any` via oxlint config)
- Or add custom architecture rule `no-any-in-template-builders` (LOW severity initially, then escalate)
- Replace each `any` with typed alternative, documented in PR

### 2.7 Linting Enhancements

- **oxlint config:** Add `no-explicit-any` restriction for `src/templates/**` and `src/**/*.ts` (host)
- **Generated projects:** `apps/mobile/oxlint.json` same as `apps/web/` — extends base, includes `no-explicit-any` as warning, `apps/mobile` excluded from legacy `any` allowance
- **Architecture checker:** Verify mobile files don't violate layers; add test that checks generated `web+mobile` project via `ghostinit check` equivalent
- **Uniwind linting:** Ensure `global.css` parses correctly, `withUniwind` metro plugin doesn't break build

---

## 3. File Changes Inventory

### 3.1 Versions Catalog — `packages/versions/src/index.ts`

- Add `uniwind` group: `uniwind`, `react-native-reanimated`
- Verify existing `clsx`, `tailwind-merge`, `class-variance-authority`, `tailwindcss@4.3.2` versions up to date for RNR usage
- Optionally add `tw-animate-css` if RNR requires it

### 3.2 Shared Theme — `src/templates/apps/fragments/css.ts`

Current: Exports `tailwindImports`, `oklchLightTokens`, `oklchDarkTokens`, `themeInlineTokens`, `baseLayer`, `globalCssContent()`.

**Change:** Split tokens into `@repo/ui` theme package:

New `src/templates/ui/theme.ts`:
- `themeCssContent()` → the full OKLCH light+dark+@theme inline as a file content generator
- Returns `packages/ui/src/theme.css` content

Updated `css.ts`:
- `globalCssContent()` for web does `@import "@repo/ui/theme.css"; @import "tailwindcss"; + baseLayer`
- Add `mobileGlobalCssContent()` returning content for `apps/mobile/global.css` (tailwind + tw-animate-css + @repo/ui/theme.css import + @source)

### 3.3 UI Package — `src/templates/ui/`

Current split: `config.ts`, `theme.ts`, `primitives.ts`, `feedback.ts`, `forms.ts`, `layout.ts`, `overlays.ts`, `dropdown.ts`, `data.ts`, `all.ts`, `index.ts`

**After:**
- `theme.ts` (new content): Only `theme.css` file generator — OKLCH tokens + @theme inline (single source)
- `config.ts`: `packages/ui/package.json` — now only exports `cn` + theme, no radix deps (or minimal)
- `primitives.ts` REMOVED from ui package — moved to new `apps/web-ui/` or `apps/fragments/web-ui/` templates
- `feedback.ts`, `forms.ts`, `layout.ts`, `overlays.ts`, `dropdown.ts`, `data.ts` — same fate: moved to web UI package
- `all.ts`: Now only aggregates theme + config + utils + barrel (cn + theme export)

**New:** `src/templates/apps/fragments/web-ui/` folder:
- `primitives.ts` — web Button, Card, Badge, Input, Label (same content moved from `src/templates/ui/`)
- Similar for other component categories
- `index.ts` — aggregates into TemplateFile array for `apps/web/src/components/ui/*`

**Updated:** `src/templates/apps/core.ts`:
- `coreFiles()` now includes `webUiFiles()` — generates `apps/web/src/components/ui/*.tsx`
- Web `package.json` no longer depends on heavy `@base-ui/react` via `@repo/ui`, instead direct dep on `@base-ui/react` in app + local ui files

### 3.4 Expo Templates — `src/templates/apps/expo-core.ts`

- `babelConfigContent()`: Updated preset array includes `['uniwind/babel', { cssEntryFile: './global.css' }]`
- `metroConfigContent()`: Uses `withUniwind` wrapper + exports config with `cssEntryFile`
- New function `mobileGlobalCssContent()` imported from `fragments/css.ts`
- New file export `globalCss` in `expoCoreFiles()` → `apps/mobile/global.css`
- `expoEnvDtsContent()` unchanged
- `tsconfigMobile()` may need path for `@repo/ui` theme resolution
- Add `utils.ts` file `apps/mobile/src/lib/utils.ts` with `cn()` — uses `clsx + tailwind-merge` same as web but native path

### 3.5 Expo UI Components — New `src/templates/apps/fragments/expo/rnr/`

Folder: `rnr/`
- `utils.ts` → cn() + optional theme constants reference
- `text.tsx` → RNR Text wrapping RN Text with Uniwind variants
- `button.tsx` → RNR Button with CVA
- `card.tsx`
- `input.tsx`
- `label.tsx`
- `badge.tsx`
- `avatar.tsx`
- `tabs.tsx`
- `index.ts` → aggregate file list for expo UI primitives
- `ui-components.ts` (or fold into existing `expo-components.ts`)

Updated `expo-components.ts`:
- Imports from `rnr/` folder for new primitives
- Adds `utils.ts` lib file
- Removes old placeholder hooks that used fetch directly (or keeps but typed)

### 3.6 Expo Pages — `src/templates/apps/fragments/expo/*.ts`

All files rewritten:
- `marketing.ts`: Use RNR Button, Card, Text, View with Tailwind classes `className="bg-background text-foreground ..."`
- `auth.ts`: Sign-in, sign-up, forgot, reset, 2fa — use RNR Input, Label, Button, Card, Text
- `dashboard.ts`: Card, Button, Badge, Avatar with Tailwind
- `header.ts`: Use RNR-style but with Tailwind className
- `layout.ts`: Imports `../global.css` and `uniwind/global`; wraps with theme handling
- `orpc.ts`: Properly typed — no `as any` on authClient.getCookie()

### 3.7 Composer — `src/templates/modes/monorepo/apps-composer.ts`

- `typescriptConfigWithAliases()` — add `explicitExpoPaths` includes `@repo/ui` alias? Already has `@repo/*`
- `expoFiles()` composition: if web+mobile both present, `global.css` in mobile + `globals.css` in web both import `@repo/ui/theme.css`
- Ensure tsconfig references filter correctly for web vs mobile

### 3.8 Any Removal — Across Host

Files with most `as any` / `: any` to clean:

Priority 1 (addon parsing — core templates):
- `src/templates/apps/core.ts` — `(input as any)?.[feature]`
- `src/templates/apps/expo-core.ts` — same
- `src/templates/apps/tanstack-core.ts` — same
- `src/templates/modes/monorepo/apps-composer.ts` — `(addons as any)?.eve?.inUse`, `(config as any).apps`
- `src/templates/modes/single/index.ts` — similar
- `src/templates/billing-generator.ts` — `(map as any)["tanstack-start"]`
- `src/templates/apps/api.ts` — `(map as any)[p]`
- `src/lib/addons.ts` — parsing logic

Priority 2 (analytics — PostHog):
- `src/templates/analytics/*.ts` — `(window as any).posthog`, `(ctx.client as any)`, `(env as any)`

Priority 3 (CLI):
- `src/cli.ts` — `(error as any)?.code`
- `src/cli/main.ts` — `(values as any).json`
- `src/commands/create/index.ts` — `prompted.mode as any`

Solution: Introduce proper typed utilities:
- `src/lib/addons.ts`: `type FeatureInput` discriminated union + `isAddonInstallerMap` guard + `hasFeature(map, name: string): boolean`
- `src/templates/shared.ts`: Typed helpers for addon map access
- Analytics: `PostHogWindow` global interface, typed env accessor

### 3.9 Linting Configs

- `oxlint.json` root: Add restriction for `no-explicit-any` as error for `src/templates/**` and `src/lib/**`
- Generated `apps/mobile/oxlint.json` or workspace root oxlint config: Same rules
- Architecture checker: Already handles mobile — add explicit test for `apps/mobile/app/_layout.tsx` importing invalid layer (shouldn't)

---

## 4. Data Flow

### Web Theming Flow
```
packages/ui/src/theme.css (OKLCH tokens + @theme inline)
  ↑ imported by
apps/web/src/app/globals.css (@import "@repo/ui/theme.css" + tailwindcss)
  ↑ consumed by
apps/web/src/components/ui/* (web primitives using bg-background etc)
```

### Mobile Theming Flow
```
packages/ui/src/theme.css (same OKLCH tokens)
  ↑ imported by
apps/mobile/global.css (@import "@repo/ui/theme.css" + tailwindcss)
  ↑ processed by Uniwind babel+metro → generates native styles
  ↑ consumed by
apps/mobile/src/components/ui/* (RNR primitives className="bg-background")
  ↑
apps/mobile/app/**/*.tsx (pages using RNR Button, Text, Card etc)
```

Edit `packages/ui/src/theme.css` → both apps update on next build/dev restart.

---

## 5. Component Design (Web/Mobile Parity)

| Web (`apps/web/src/components/ui/`) | Mobile (`apps/mobile/src/components/ui/`) | Shared Props API |
|--------------------------------------|--------------------------------------------|-----------------|
| Button (Base UI + CVA) | Button (RNR + CVA + RN Pressable) | variant, size, className, children |
| Card family | Card family (RNR + Uniwind) | className, children |
| Input + Label | Input + Label (RNR TextInput) | standard RN TextInput props + label |
| Text (single primitive) | Text (RNR) | variant (h1-h4, p, muted, small) + className |
| Badge | Badge | variant |
| Avatar family | Avatar family | src, fallback, size |
| Tabs | Tabs | defaultValue, className |
| Dialog (future) | Dialog (future) | open, onOpenChange |
| Sheet (future) | Sheet (future) | |

All use Tailwind className for styling, same variant names, same color tokens.

---

## 6. Error Handling

- **Uniwind missing entry:** If `global.css` not imported in `_layout.tsx`, build fails with explicit error from Uniwind babel plugin — document in skills.
- **Theme import missing:** If `@repo/ui/theme.css` not found (deleted), both web and mobile builds fail at CSS import resolution — intentional, forces user to restore.
- **Babel preset order:** `uniwind/babel` must come before `babel-preset-expo` — documented, template enforces correct order.
- **Metro withUniwind wrapper:** If not applied, className props ignored (silently fail styling). Template ensures wrapper present; test checks `metro.config.js` content contains `withUniwind`.
- **Any removal:** Replace casts with type guards that throw `ValidationError` if addon map shape unexpected — user gets clear message, not silent `undefined`.

---

## 7. Testing Strategy

### Host Tests
- `tests/unit/expo-uniwind-*.test.ts` — new unit tests for template content generation
  - Verify `mobileGlobalCssContent()` includes `@import "@repo/ui/theme.css"`
  - Verify `babelConfigContent()` includes Uniwind preset
  - Verify `metroConfigContent()` includes `withUniwind`
  - Verify RNR components files contain `className` usage, no `StyleSheet.create` for colors
  - Verify `packages/ui/src/theme.css` generated contains OKLCH tokens matching previous palette
- Existing addon parsing tests updated to reflect typed API (remove `as any` from tests too if possible)
- `bun run check` — oxlint rule forbids `any` in `src/templates/` — new code fails if `any` introduced

### Fixture/Generated Project Tests
- `tests/fixtures/compatibility/expo-uniwind/` — smoke generates `web,mobile` project, checks:
  - `apps/mobile/global.css` exists and imports `@repo/ui/theme.css`
  - `packages/ui/src/theme.css` exists with OKLCH tokens
  - `apps/web/src/app/globals.css` imports `@repo/ui/theme.css`
  - `apps/mobile/babel.config.js` has uniwind preset
  - `apps/mobile/metro.config.js` has withUniwind
  - RNR components exist in `apps/mobile/src/components/ui/`
  - No `as any` or `StyleSheet.create` with hardcoded hex in Expo pages
  - Architecture checker `ghostinit check` returns 0 violations
- Smoke: `bunx ghostinit create demo --apps web,mobile --yes --no-install` → `bun install && bun run typecheck && bun run lint` passes
- Platform-specific smoke:
  - Expo build: `cd apps/mobile && expo export --platform web` works (Metro + Uniwind resolves)
  - Web build: `cd apps/web && next build` works (Tailwind v4 + @repo/ui/theme.css import)

### Manual QA Checklist
- [ ] Create project `--apps web,mobile`, verify both apps see same primary color when editing `packages/ui/src/theme.css`
- [ ] Change `--primary` OKLCH value, restart dev for both, verify both apps update
- [ ] Expo Go: QR scan, verify RNR Button, Card render with correct theme colors
- [ ] Web: `http://localhost:3000`, verify Button, Card match mobile palette
- [ ] Architecture: `ghostinit check` 0 violations
- [ ] Typecheck: `bun run typecheck` — no `any` issues
- [ ] `bun run check` — oxlint + oxfmt passes

---

## 8. Open Questions Resolved

| Question | Resolution |
|----------|-----------|
| Theme single source | `@repo/ui/src/theme.css` — web and mobile both `@import` it |
| @repo/ui refactor breaking? | Approved — full refactor to tokens-only, web primitives move to apps/web/src/components/ui |
| RNR component sourcing | Deterministic templates in host, no runtime CLI |
| RNR component scope | Full parity with web primitives |
| 6-layer mobile | Stays L1 UI, already correct in checker, shares same L2-L6 packages |
| Any removal | Remove all unnecessary any, keep only where truly dynamic (vendor SDK untyped returns etc). Typed wrappers + type guards |
| Expo pages StyleSheet | Full rewrite to RNR + Uniwind className |
| Babel preset order | Uniwind before expo, documented |

---

## 9. Implementation Order (Phases)

1. **Phase 0 — Version Catalog & Shared Theme Package**
   - Add `uniwind`, `react-native-reanimated`, `tw-animate-css` to versions
   - Refactor `packages/ui` to tokens-only: new `theme.css` generation, simplify `package.json`, keep only `cn()` + theme export
   - Create `src/templates/apps/fragments/css.ts` → `mobileGlobalCssContent()`

2. **Phase 1 — Web UI Local Primitives**
   - Move all `src/templates/ui/primitives.ts` etc components to new `src/templates/apps/fragments/web-ui/` 
   - Update `apps/core.ts` to generate web UI locally at `apps/web/src/components/ui/*`
   - Update `apps-composer` to wire new fragments

3. **Phase 2 — Expo Uniwind Infra**
   - Update `expo-core.ts`: babel preset, metro wrapper, global.css, utils.ts lib file
   - Add new `fragments/expo/rnr/` folder with RNR component templates (all deterministic, no any)
   - Update `expo-components.ts` to use RNR components + add utils

4. **Phase 3 — Rewrite Expo Pages to RNR + Uniwind**
   - Rewrite `fragments/expo/marketing.ts`, `auth.ts`, `dashboard.ts`, `header.ts`, `layout.ts`, `orpc.ts` to use RNR primitives + className
   - Remove all `StyleSheet.create` hardcoded colors

5. **Phase 4 — Type Safety (`any` Removal)**
   - Introduce typed addon accessors in `lib/addons.ts` + `templates/shared.ts`
   - Fix all `as any` casts in `src/templates/**` + `src/lib/**` + `src/commands/**` + analytics templates
   - Add oxlint rule forbidding `any` in host `src/`

6. **Phase 5 — Linting, Architecture Check, Tests**
   - Add tests for Uniwind infra, theme single source
   - Smoke E2E for web+mobile generation
   - Ensure `ghostinit check` passes
   - Update skills `ghostinit-use` + `ghostinit-dev`

7. **Phase 6 — Documentation Sync & Verification**
   - Sync AGENTS.md, ARCHITECTURE.md, README.md, CONTRIBUTING.md
   - Sync skills
   - Final smoke: create project `--apps web,mobile` → typecheck + lint + check pass

---

## 10. Non-Goals

- Not changing `availableApps` or `--apps` flag parsing — existing logic works
- Not introducing new layer levels; mobile stays L1
- Not changing `packages/ui` consumer API for analytics/email/etc — only Button/Card/etc primitives move
- Not adding runtime RNR CLI to generated projects
- Not supporting `tanstack-start` + mobile theming in this spec (future; same pattern would apply)

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Uniwind breaking Next.js Tailwind build | Separate configs: web uses `@tailwindcss/postcss`, mobile uses Uniwind; no cross-contamination via package isolation (isolated bunfig in host, hoist=true in generated but files in different apps) |
| OKLCH tokens incompatible with RN | Uniwind supports CSS vars + OKLCH natively; validated in docs. Fallback: hex equivalents in theme.css if needed |
| Web moving primitives to app breaks sync checker | `sync` command rebuilds deterministic files — new location still deterministic; update sync manifest |
| `any` removal breaks typed helper inference for template addons | Introduce proper `FeatureInput` discriminator already exists in most files — tighten; add overloads if needed |
| RNR component API drift from shadcn/web | Maintain variant name parity table; use same CVA configuration values |
| Generated Expo app Metro breaks with withUniwind | Pin Uniwind to known working version; add smoke test exporting web bundle |

---

## 12. Verification Criteria (Done When)

- [ ] `packages/ui/src/theme.css` is single token source, contains OKLCH light/dark + @theme inline
- [ ] `apps/web/src/app/globals.css` imports `@repo/ui/theme.css`
- [ ] `apps/mobile/global.css` imports `@repo/ui/theme.css`, contains @source entries
- [ ] `apps/mobile/babel.config.js` has `['uniwind/babel', { cssEntryFile: './global.css' }]` before expo preset
- [ ] `apps/mobile/metro.config.js` uses `withUniwind(config, { cssEntryFile, dtsFile })`
- [ ] `apps/mobile/src/lib/utils.ts` exists with `cn()` using same impl as web
- [ ] `apps/mobile/src/components/ui/*` contains full RNR parity components (Button, Text, Card, Input, Label, Badge, Avatar, Tabs) all with className + no any
- [ ] All Expo pages (`marketing.ts`, `auth.ts`, `dashboard.ts`, `header.ts`, `layout.ts`) rewritten to RNR + Uniwind className, zero `StyleSheet.create` for colors/borders
- [ ] `packages/ui` no longer contains web Button/Card/etc primitives — only theme.css + lib/utils.ts
- [ ] `apps/web/src/components/ui/*` contains web primitives previously in @repo/ui
- [ ] No `as any` / `: any` in `src/templates/` + `src/lib/` except justified vendor casts with comment
- [ ] `ghostinit check` (architecture) passes for generated `web,mobile` project (0 violations)
- [ ] `bun run check` (host) passes with new any-forbidding rule
- [ ] Smoke `create --apps web,mobile --yes --no-install` → `bun install && typecheck && lint` passes (in fixture)
- [ ] Skills updated (`ghostinit-use` references theme editing + mobile RNR + uniwind)
- [ ] AGENTS.md + ARCHITECTURE.md + README.md + CONTRIBUTING.md synced

---

## Appendix: Research Links

- RNR Uniwind setup: `rnr-docs.vercel.app/getting-started/uniwind/`
- Uniwind docs: `uniwind.dev/getting-started`
- Current OKLCH tokens: `src/templates/apps/fragments/css.ts` in repo
- RNR components source: GitHub `foundations-labs/react-native-reusables` (study Button, Text, Card implementations with CVA + className)

Sources:
- [RNR Docs - Uniwind Installation](https://rnr-docs.vercel.app/getting-started/uniwind/)
- [Uniwind Docs - Getting Started](https://uniwind.dev/getting-started)
