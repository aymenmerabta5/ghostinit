# Adding New Framework — Dev Deep Dive

## Existing Frameworks

- `nextjs` (default) — catalog-pinned Next 16 + React 19, Next specific files: `apps/web/src/app/` structure, `next.config.ts`, `next-env.d.ts`, cookie `nextCookies()` from better-auth/next-js, outputs `.next/**`, client env `NEXT_PUBLIC_*`.
- `tanstack-start` — Vite 7 + Nitro 3, `tanstack-*` files: `apps/web/src/routes/`, `router.tsx`, `__root.tsx`, cookie `tanstackStartCookies()` better-auth/tanstack-start, outputs `.vinxi/** .output/** dist/**`, client env `VITE_*`, server fn `createServerFn`, `getRequestHeaders`, Vite + @vitejs/plugin-react + @tailwindcss/vite.

DRY via fragments `src/templates/apps/fragments/` each file <150 LOC (guideline), shim barrels re-export split folder for backward compat.

## Adding `myframework`

1. `src/lib/addons.ts`:

```ts
export const availableFrameworks = ["nextjs", "tanstack-start", "myframework"] as const;
export type FrameworkName = (typeof availableFrameworks)[number];
```

Parser `parseFrameworkInput()` already throws ValidationError on invalid, so new value auto becomes valid after addition.

2. Create `src/templates/apps/myframework-core.ts`, `myframework-api.ts`, `myframework-pages.ts`, `myframework-components.ts` as reference from `tanstack-*` files.

Each file pattern:

```ts
import { file, packageJson } from "../shared.js";
import * as v from "../versions.js";
export function myFrameworkCoreFiles() {
  return [
    file("apps/web/src/routes/__root.tsx", `...`),
    file("apps/web/src/routes/index.tsx", `...`),
    // etc
  ];
}
```

Look at existing TanStack files for structure, then adapt.

3. Fragments DRY `apps/fragments/` — extract common logic via RouterType param.

Example fragment structure:

```
apps/fragments/
  auth/
    page.ts                    # export function signInPageContent(router: RouterType): string
    tanstack-guard.ts          # tanstackGetSessionFnContent(), tanstackAuthBeforeLoadContent()
  billing/
    page.ts                    # billingPageContent(router)
  core/
    layout.ts
    header.ts
  marketing/
    page.ts                    # buildMarketingPageContent(router)
  recovery/
    forgot-page.ts
    reset-page.ts
  settings/
    next-page.ts
    tanstack-page.ts
```

Each fragment:

```ts
export type RouterType = "nextjs" | "tanstack-start" | "myframework";

export function signInPageContent(router: RouterType): string {
  if (router === "tanstack-start") return `...tanstack variant using createServerFn...`;
  if (router === "myframework") return `...myframework variant...`;
  return `...next variant...`;
}

export function signInPage(router: RouterType): TemplateFile {
  const path =
    router === "tanstack-start" ? "src/routes/sign-in.tsx" : "src/app/(auth)/sign-in/page.tsx"; // adapt per framework
  return file(path, signInPageContent(router));
}
```

Reuse guard helpers `tanstack-guard.ts` instead of reimplementing getSessionFn + beforeLoad per route.

4. Router wiring.

`src/templates/default.ts` `generateProjectFiles()` already delegates mode → `monorepoFiles()` vs `singleFiles()`. Inside monorepo, `apps-composer.ts` handles framework switch:

```ts
// apps-composer.ts
export function appsComposerFiles(runtime, addonMap, effectiveFramework) {
  if (effectiveFramework === "tanstack-start") return [...tanstackCoreFiles(), ...tanstackPagesFiles(), ...];
  if (effectiveFramework === "myframework") return [...myFrameworkCoreFiles(), ...myFrameworkPagesFiles(), ...];
  return [...nextCoreFiles(), ...nextPagesFiles(), ...];
}
```

Similarly `auth-composer.ts` handles `authPackage(framework)`.

5. Env branching.

`shared/env.ts` already emits both `NEXT_PUBLIC_*` + `VITE_*` dual for client tokens. If your framework uses different prefix (e.g., `PUBLIC_*`), add case there + note in env 5-place rule.

6. Turbo outputs.

Already covered: `.next/** .vinxi/** .output/** dist/** .vercel/**` in `root.ts` `turbo()` outputs. If your framework emits different out dir (e.g., `.myframework/**`), add there + root `turbo.json`.

7. Fragments Extraction Triggers (from `AGENTS.md#architecture`):

- `apps/tanstack-*` file approaching 300 LOC guideline (host guideline, escape via `// @allow-long` if legit)
- Duplication across Next/TanStack >30% lines
- New `availableFrameworks` entry added
- Inline route >50 LOC duplicated across frameworks
- Guard duplication per route → extract to `tanstack-guard` helpers

History: Yellow #3 — extracted forgot-password 66 LOC, reset-password 80 LOC, settings 78 LOC, billing 66 LOC inline from tanstack-pages.ts 357 → 65 LOC into fragments.

8. Verify:

```bash
bun run build && bun run check
mkdir /tmp/gi-test && bunx ghostinit create demo --framework myframework --yes --no-install --cwd /tmp/gi-test
cd /tmp/gi-test/demo && bun install && bun run typecheck && bun run lint:all
# check turbo.json globalEnv, bunfig.toml hoist=true, architecture checker passes
bun run build && node ../../dist/cli.js check inside generated? Or ghostinit check.
```

9. Docs sync same PR: `AGENTS.md#architecture` framework matrix + README stack + CONTRIBUTING how-to + `evidence/compatibility/v1-to-v2.json` and its schema when the CLI/migration mapping changes + skills/ghostinit-use/references/frameworks.md chooser + skills/ghostinit-dev/references/framework.md this file. Update `DESIGN.md` and the applicable frontend task record when the UI adapter contract changes.

## DRY Tips

- Use `RouterType` param branching single function returns different content/path per framework, not duplicate files per framework for same page.
- Extract marketing, header, layout, auth guard to fragments early.
- `pages.ts` (Next) already delegates via `...settingsFiles()`, `...recoveryFiles()`, `...billingFiles()` — `tanstack-pages.ts` must mirror: `...recoveryFiles("tanstack")`, `...settingsFiles("tanstack")`, `...billingFiles("tanstack")`. No inline 66 LOC route definitions — all routes through fragments like `buildMarketingPageContent("tanstack")`, `signInPageContent("tanstack")`.
- Shim barrels `core.ts`, `marketing.ts`, `header.ts` re-export from `core/`, `marketing/`, `header/` subfolders to keep each sub-file <150 LOC.
