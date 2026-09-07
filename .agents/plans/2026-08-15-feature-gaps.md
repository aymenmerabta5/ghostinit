# Feature Gaps Implementation Plan — GhostInit Remaining Gaps

## Goal

Close the remaining feature gaps flagged by 4 blind reviewers (Next.js / TanStack Start / Expo / Electron) that were not covered by the P0 critical fixes already shipped (`security.ts`, `proxy`, `webhooks`, `convex env`, `reset-password`, `expo billing`, `desktop CSP`). Deliver production-grade scaffolding for SEO/metadata, instrumentation, Expo native, and Electron native parity so generated projects are feature-complete without manual patching.

## Success Criteria

- Generated `monorepo/next` and `single/next` contain `sitemap.ts`/`robots.ts`/`manifest.ts` + per-page `generateMetadata`/`viewport` examples; `next build` includes them.
- `instrumentation.ts` exists in both `next` and `tanstack` variants and hooks `@repo/observability`.
- Expo `app.json` has `expo-notifications` + `expo-updates` + `intentFilters`/`associatedDomains` for universal links, `offline` via `NetInfo`+`react-query persist`, `expo-localization` i18n, `posthog-react-native` analytics; `doctor` covers Expo env.
- Electron `main.ts` handles `open-url`/`second-instance` deep-link, tray (behind flag), `Notification`, window bounds persistence, `offline` badge; `desktopRendererHtmlContent` CSP templated.
- All 13 generation-matrix corners still parse, alias-resolve, and pass `.env.local` placeholder invariants; `bun run build` + `bun run check` green.

## Context And Current Facts

- **Already fixed (verified):** CSP (`unsafe-eval` removed), `proxy`+`middleware` shim, webhook fail-closed, TanStack convex env fallback, reset-password `validateSearch`, `convex+mobile` `expo()` plugin, Expo env validation in `packages/config`, Expo billing oRPC, WS token via `Sec-WebSocket-Protocol`, Expo `useCopy` honest, `expo/types`, Electron `safeStorage` warning, `pdf` single fetch, `messaging` desktop stub, builder placeholder. `generation-matrix` 97/97 pass, `check` 0 errors.
- **Remaining gaps cited:**
  - Next: no `sitemap.ts`/`robots.ts`/`manifest.ts`, no `generateMetadata`/`viewport`, no `instrumentation.ts`, no `next/image` example, no per-segment `loading.tsx`, no `generateStaticParams`.
  - TanStack: no locale detection (`getRequestHeaders` + `Accept-Language`), no Nitro `cachedEventHandler`, still route-handler oRPC not `createServerFn`, no `tsr generate` watcher.
  - Expo: no `expo-notifications`, no `expo-sqlite`/offline queue, no `prefixes` universal links, no `expo-updates`, no Maestro E2E, no `expo-localization`, no `posthog-react-native`.
  - Electron: no `setAsDefaultProtocolClient` OAuth, no Tray/`nativeTheme`, no `Notification` bridge, no offline queue, mixed native/custom chrome, no `hasDesktop` in `EnvAudience`.
- **Code ownership:** Templates live in `src/templates/{apps/*,modes/{monorepo,single},shared/env,packages/config,auth}`; composers dedupe via `monorepo/index.ts` `dedupeFilesOrThrow`; versions SSOT `packages/versions/src/index.ts`; env 5-place sync (`constants.ts`, `shared/env`, `root/turbo.ts`, `turbo.json`, docs).
- **Tests:** `generation-matrix.test.ts` guards all 8 monorepo/single × next/tanstack × postgres/convex/none (+ desktop corners); `test:generated` runs `bun install`+`typecheck`+`lint` on real projects (slow, required for `next build` correctness).

## Constraints And Non-goals

- **Constraints:** <400 LOC `// @allow-long` escape, no `export *`, FsTransaction mandatory for writes (not templates), secret-safe logger, typed errors, versions via `* as v`, composers <5 imports, `turbo.json` globalEnv 96 keys exhaustive.
- **Non-goals:** Full push notification backend (APNs/FCM) — scaffold only; OTA code-push without Expo EAS credentials — config only; Native E2E Detox runtime — generate config + script, not CI run.

## Key Decisions

- **SEO as fragments:** Add `src/templates/apps/fragments/seo.ts` exporting `sitemapContent`, `robotsContent`, `manifestContent`, `viewportContent` and wire via `apps/pages.ts` + `modes/*` — rejected inline strings in `core.ts` (LOC, dedupe).
- **Instrumentation as shared fragment:** `src/templates/apps/fragments/instrumentation.ts` with Next `instrumentation.ts` (`register()` hook) + TanStack `app/instrumentation.ts` variant — reuse `@repo/observability`.
- **Expo native as opt-in addon:** Extend `availableAddons` pattern (`--with-push`, `--with-updates` behind `--with-expo`); default ON for `expo-notifications` + `expo-updates` when `hasMobile` to avoid extra flag complexity — rejected new top-level preset.
- **Electron native:** Add `hasDesktop` to `EnvAudience` + `DESKTOP_API_URL` to `globalEnv`; Tray behind `--with-tray` flag (like `--with-i18n`); deep-link via `app.setAsDefaultProtocolClient` (not custom protocol) for Better Auth OAuth.
- **Offline:** Use `@tanstack/query-persist-client` + `expo-sqlite` for Expo, `navigator.onLine` + `orpc` retry queue for Electron — rejected full `expo-offline-queue` lib (adds native dep).

## Recommended Approach

Implement in dependency order: SEO/metadata (no deps) → instrumentation (depends on observability) → Expo/TanStack i18n/offline (depends on env/routing) → Electron deep-link/tray (depends on main.ts) → validation (`check`, `generation-matrix`, smoke `create demo`).

## Work Plan

### Phase 1 — SEO & Metadata (no deps)

- **1.1** Create `src/templates/apps/fragments/seo.ts` with `sitemapFileContent()`, `robotsFileContent()`, `manifestFileContent()`, `viewportFileContent()` — `sitemap.ts` uses `MetadataRoute.Sitemap`, `robots.ts` uses `MetadataRoute.Robots`, `manifest.ts` uses `MetadataRoute.Manifest`, `viewport` exports `themeColor` + `colorScheme`. Wire to `src/templates/apps/pages.ts` (Next) + `src/templates/apps/tanstack-pages.ts` (TanStack variant with `createFileRoute`? For TanStack, emit `src/routes/sitemap.ts` using Vite convention). Update `src/templates/apps/fragments/layout.ts` to export `generateMetadata` example per marketing page.
- **1.2** Add per-segment `dashboard/loading.tsx` reuse `Skeleton`, `apps/web/src/app/(dashboard)/loading.tsx`. Update `src/templates/apps/fragments/layout.ts`.
- **Files:** `seo.ts` (new, ~120 LOC), `layout.ts`, `pages.ts`, `tanstack-pages.ts`.

### Phase 2 — Instrumentation

- **2.1** Create `src/templates/apps/fragments/instrumentation.ts` exporting `nextInstrumentationContent()` (`export async function register(){ await import('@repo/observability') }`) and `tanstackInstrumentationContent()`. Wire via `modes/monorepo/apps-composer.ts` + `modes/single/*` core.
- **Files:** `instrumentation.ts` (new), `apps-composer.ts`, `single/core/*`.

### Phase 3 — TanStack i18n & Caching

- **3.1** Add `src/templates/i18n/tanstack/server.ts` `getLocaleFromRequest(headers)` reading `NEXT_LOCALE` cookie + `Accept-Language`, and wire `__root.tsx` `loader` to set `I18nProvider initialLocale`.
- **3.2** Add Nitro `cachedEventHandler` example via `src/templates/apps/fragments/core/cache.ts` emitting `defineCachedEventHandler` for TanStack when `hasCache`.
- **Files:** `i18n/tanstack/server.ts`, `tanstack-core.ts`, `core/cache.ts`.

### Phase 4 — Expo Native (push, updates, offline, deep-link, i18n, analytics)

- **4.1** `expo-core.ts`: bump `app.json` to include `expo-notifications` (`useNextNotificationsApi`), `expo-updates` (`url`), `android.intentFilters` + `ios.associatedDomains` from `scheme`, `expo-localization` dep, `posthog-react-native` dep when `hasAnalytics`. Add `packages/versions` `expo-notifications` + `expo-updates` versions.
- **4.2** Create `src/templates/apps/fragments/expo/push.ts` `expoPushHookContent()` (`usePushNotifications` with `getExpoPushTokenAsync` + `addNotificationReceivedListener`).
- **4.3** Create `src/templates/apps/fragments/expo/offline.ts` `expoOfflineContent()` (`NetInfo` + `persistQueryClient` via `expo-sqlite`).
- **4.4** Update `src/templates/apps/fragments/expo/layout.ts` to `import * as Localization from "expo-localization"` and `I18nProvider` fallback when `hasI18n`.
- **Files:** `expo-core.ts`, `packages/versions`, `expo/push.ts`, `expo/offline.ts`, `expo/layout.ts`, `shared/env` (add `EXPO_PUBLIC_PUSH` if needed).

### Phase 5 — Electron Native (deep-link, tray, notifications, offline)

- **5.1** `desktop-core.ts`: add `app.setAsDefaultProtocolClient("ghostinit")` + `second-instance` argv parse + `app.on("open-url")` → `shell.openExternal` + `mainWindow.loadURL` for OAuth callback; add `EnvAudience.hasDesktop` + `DESKTOP_API_URL` to `shared/env` + `turbo` globalEnv.
- **5.2** Create `src/templates/apps/fragments/desktop/tray.ts` behind `--with-tray` flag; emit `new Tray(nativeImage)` + `nativeTheme.on("updated")` sync to `ThemeProvider`.
- **5.3** Add `desktopBridge.notify` channel via `new Notification({title,body}).show()` proxy.
- **5.4** Add window bounds persistence via `electron-store` `windowBounds` + `electron-window-state` pattern.
- **Files:** `desktop-core.ts`, `shared/env`, `lib/env-manifest.ts`, `root/turbo.ts`, `add-ons` handling.

### Phase 6 — Performance Examples

- **6.1** Add `next/image` hero example in `marketing/page.ts` with `priority` + `sizes`, using existing `remotePatterns: []` note.
- **6.2** Add `generateStaticParams` example for marketing sections.

## Validation Plan

- **Per-phase:** `bun run build` + `bun run check` (oxlint+oxfmt+tsc) — must stay 0 errors.
- **Matrix:** `bun test tests/unit/generation-matrix.test.ts --timeout 100000` — 97 pass, especially tanstack `NEXT_PUBLIC` vs `VITE` and no `next` import in TanStack, no unselected billing webhook.
- **Smoke:** `rm -rf /tmp/gi-test && mkdir /tmp/gi-test && bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test --billing stripe,chargily --with-eve --with-i18n --apps web,mobile,desktop --preset saas` then `cd /tmp/gi-test/demo && bun install && bun run typecheck && bun run lint` — must pass for Next + TanStack + single variants (run via `scripts/test-generated.ts --only next-monorepo,single-next` quick, `--all` full).
- **Manual:** Check `.env.example` contains new vars, `turbo.json` globalEnv includes them (`bun run scripts/sync-turbo-env.ts --check`).

## Risks / Rollback

- **Env 5-place drift:** Adding `EXPO_PUBLIC_PUSH` etc requires syncing all 5 places; miss → Turbo cache poison or `t3-env` type error (listing both families fails). Mitigate via `sync-turbo-env.ts --check`.
- **Expo dep version skew:** New `expo-notifications` version must exist on npm (`check:versions` gate). Rollback via `git revert` single phase commit.
- **Electron deep-link:** `setAsDefaultProtocolClient` may conflict when running unpackaged (`isPackaged` guard). Test via `ELECTRON_IS_DEV=1`.
- **Bundle size:** Adding offline/SQLite increases `apps/mobile` install size; keep behind `hasMobile` guard so web-only projects unaffected.

## Open Questions

- None — all gaps have concrete file paths and existing fragment patterns (`header.ts` RouterType, `core/security.ts`, `expo/rnr/*`). `package.json` versions will be fetched via `check:versions` before merge.
