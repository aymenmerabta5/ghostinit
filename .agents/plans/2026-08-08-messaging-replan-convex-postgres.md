# Replan: Messaging — Postgres via oRPC+WebSockets, Convex via Native Realtime (Docker primary, DM-only, files, presence, i18n) — APPROVED 2026-08-08

## Goal

Re-plan the messaging system so **both databases** are correctly supported per your latest feedback: **opt-in DM-only, file/image sharing with inline preview, live presence + typing, i18n-gated strings, Docker as primary deploy**, but with a **database-aware realtime strategy** — you correctly noted Convex is realtime by default, so we should NOT add WebSockets for Convex. For postgres we keep oRPC + WebSockets; for convex we use its native reactivity and storage.

This replan supersedes `.agents/plans/2026-08-07-messaging-orpc-websocket.md` (v2) where “DB-agnostic WS” was assumed. It keeps all other v2 decisions (opt-in all presets, DM-only, attachments in scope).

## Success Criteria

- Same as v2 _plus_ branching correctness:
  - `--with-messaging --database postgres` generates: Drizzle tables `conversations`, `conversation_participants`, `messages`, `message_attachments`, `message_reads` + `packages/realtime` (WS publisher + presence/typing) + `packages/storage` (local FS volume + S3 wrapper) + `packages/api/src/procedures/messaging/*` + `packages/api/src/ws.ts` + WebSocket server glue (`server.ts` Bun.serve for Next.js, `src/routes/api/ws.ts` via `@orpc/server/crossws` for TanStack Start) + clients `apps/*/src/lib/realtime.ts` + Docker volume `data/uploads`. No Convex code emitted.
  - `--with-messaging --database convex` generates: **No** `packages/realtime`, no `packages/storage`, no WS route, no `ws`/`crossws` dep. Instead extends `convex/schema.ts` (defineTable for messaging with tight validators + indexes), `convex/messaging.ts` (queries/mutations with `ctx.db` + `ctx.storage` for attachments), `convex/lib/messaging.ts` helpers. oRPC messaging procedures **not emitted** for convex (to avoid double RPC); clients consume `useQuery(api.messaging.listMessages)` / `useMutation(api.messaging.sendMessage)` directly. UI fragments branch: postgres UI uses `orpc.messaging.*` + `realtime.ts`; convex UI uses `convex/react` hooks.
  - `--with-messaging --database none` is blocked by `isValidAddonCombo` (“messaging requires postgres or convex”) — same as `auth`/`billing` blocks.
  - `--with-messaging` omitted emits zero messaging/realtime/storage trace (same filtering + dep stripping as billing). `turbo.json` `globalEnv` remains exhaustive but `globalEnv` does not trigger cache misses per-corner (wildcards).
- Generation-matrix: 12 corners (`monorepo/single × nextjs/tanstack-start × {postgres WS, convex native, none/off}`) all satisfy: parseable `.ts/.tsx`, imports resolve (convex `_generated/*` allowed; no `@repo/realtime` when convex or off; no `convex/*` import when postgres), no `next` leak into TanStack, `.env.local` never mints vendor secrets.
- `bun run build && bun run check && bun test --timeout 100000` green; `bun run check:versions` passes (new `ws`, `crossws`, `@aws-sdk/client-s3` pins exist); `bun run test:generated` for `next-monorepo` + `single-next` + new `convex-messaging` corner typechecks + lints.
- Manual realtime proof: postgres project `docker compose up` → two browsers `/messages` exchange text + image live via WS, presence dot + “typing…” appear without refresh; convex project `bun run dev` → two browsers exchange messages live via Convex reactivity (no WS connection in DevTools → WS tab), image stored via `ctx.storage` appears inline.

## Context And Current Facts

- v2 plan already grounded oRPC WS stack: `packages/versions 1.14.7→1.14.8`, peers `ws`/`crossws`, `src/templates/api.ts` (466 LOC), `src/templates/apps/fragments/api/core.ts` RPCHandler/fetch, clients in `fragments/core/orpc.ts` + `expo/orpc.ts` + `desktop-core.ts:306`. No WS code existed (grep confirmed). `src/templates/database.ts` emits Drizzle 0.45.2/pg, `database/convex/schema.ts` (tight validators, `v.record` not `v.any()` except webhook payload, ~1100 LOC extracted) defines `users/accounts/sessions/verifications/posts/billing tables` via `defineSchema/defineTable`. `src/lib/addons.ts` `optionalAddons=[auth,api,…]` + `presetDefaults` drives `AddonInstallerMap`; `src/lib/env-manifest.ts` single source for 60+ `GLOBAL_ENV_KEYS` + `CONVEX_ENV_KEYS`. Composers `modes/monorepo/*` + `appsComposerFiles` branch per framework and filter by `hasAuth/hasApi` etc.
- Convex today is **already reactive**: `convex 1.42.3` + `@convex-dev/better-auth 0.12.5` generated projects use `convex/_generated/*` + `useQuery`/`useMutation` from `convex/react` (or `convex/react-start` for TanStack). Schema lives in `convex/schema.ts`, server logic in `convex/*.ts`, not `packages/api`. Billing for convex already has special handling (`convex/billing.ts`). Adding WS on top of Convex would duplicate the Convex client’s own WebSocket (`wss://*.convex.cloud`) and double connections + double auth, for no benefit. Convex storage (`ctx.storage.store/getUrl`) already provides file/image handling without S3/FS volume.
- Owner constraints confirmed: messaging opt-in for _all_ presets (even `saas=false`), DM-only (pair unique, no `type/title`), attachments in v1 scope (images inline), Docker primary (we can use `Bun.serve` custom server with WS upgrade at same port, no Vercel promise), presence + typing live in UI, i18n strings namespaced when `hasI18n`.

## Constraints And Non-goals

- Keep `<300 LOC` guideline + `// @allow-long <LOC>: <reason>` escape, `no export *`, `FsTransaction` mandatory, `versions` SSOT, `env-manifest` 5-place sync.
- DB gating: `messaging ⇒ database ∈ {postgres, convex}` else ValidationError; also `messaging ⇒ hasAuth && hasApi` already required for user identity (auth needed to know participants). Filtering must strip all trace when off (like `hasAuth` strips 20+ files via content+path filters today).
- Convex adapter is _not_ the experimental `experimental_RPCHandler`—convex has no WS; we must not import `ws`/`crossws` into convex builds (bundle kept lean, no `ws` in browser).
- Non-goals v1: no E2EE, no search, no voice/video, no federation, no cross-DB migration, no Pusher/Ably, no CRDT, no group chats (add column later), no `VITE_WS_URL` emission for convex (derived URLs still emitted but unused).

## Key Decisions

### D7) Database-aware realtime strategy (new decision — supersedes “WS for all DBs”)

**Recommended: Branch strictly by `effectiveDatabase`.**

- `postgres` — postgres branch emits WS stack exactly as v2: `packages/realtime` (Supporting, in-memory `Map<topic,Set<cb>>` + Upstash Redis fan-out if `cache=redis` + presence/typing channels + heartbeat), `packages/storage` (local FS `data/uploads` volume + S3 wrapper behind `STORAGE_DRIVER`), `packages/api` messaging procedures + `ws.ts` factory + `server.ts`/`ws` routes + `realtime.ts` clients. Attachments via HTTP multipart `POST /api/messaging/attachments` (read via `GET /api/messaging/attachments/:id` with participant check).
- `convex` — convex branch emits **no WS, no realtime, no storage**. Instead extends `convex/schema.ts` with `conversations: defineTable({ createdBy: v.id("users"), createdAt: v.number(), updatedAt: v.number() }).index("by_createdAt",…)` + `conversation_participants: defineTable({ conversationId: v.id("conversations"), userId: v.id("users"), joinedAt: v.number(), lastReadAt: v.optional(v.number()) }).index("by_conversationId",…).index("by_userId",…).index("by_conversation_user", ["conversationId","userId"])` + `messages: defineTable({ conversationId: v.id("conversations"), senderId: v.id("users"), body: v.optional(v.string()), replyToId: v.optional(v.id("messages")), attachmentIds: v.optional(v.array(v.id("_storage"))), createdAt: v.number() }).index("by_conversation_created", ["conversationId","createdAt"])` . Generates `convex/messaging.ts` queries (`listConversations`, `listMessages` reactive) + mutations (`getOrCreateConversation`, `sendMessage`, `markRead`, `generateUploadUrl`, `sendTyping` (ephemeral via `presence` table or via `lastTypingAt` volatile field)), and `convex/lib/messaging.ts` helpers (pair uniqueness sorted, participant check). File/image sharing uses Convex file storage: client calls `ctx.storage.getUrl`/`generateUploadUrl` → `useMutation(api.messaging.generateUploadUrl)` → `fetch(uploadUrl, file)` → `sendMessage({storageId})`. No Docker volume.

**Why this, alternatives rejected:**

- _WS for both DBs_ — rejected: duplicates Convex’s own WS, adds extra connection, fails your observation that Convex is realtime by default.
- _oRPC proxy for convex_ (`packages/api` procedure that internally `new ConvexClient(CONVEX_URL).query(api.messaging.list)`) — rejected: adds latency hop `client→Next→Convex` vs direct `client→Convex`, breaks live subscription (oRPC would need polling), and couples `packages/api` (Transport) to Vendors (convex SDK) in a way the 6-layer checker forbids without a port.
- _Skip convex messaging entirely_ — rejected: you asked that “both convex and postgres will support that”.

**Effect on shared layers:**

- Domain: `packages/modules/src/messaging/domain/types.ts` stays pure but only emitted when `effectiveDatabase===postgres` (postgres branch needs `packages/modules`); convex branch reuses `convex/` validators directly (no `packages/modules/messaging`). To keep generation-matrix `no import leakage`, when convex we emit `packages/modules/src/messaging` as stub that re-exports convex types or nothing, so `@repo/modules/messaging` never leaks into postgres-only code and vice-versa.
- oRPC contract: `appContract.messaging` only appears when `postgres+messaging`; convex projects omit it (UI consumes `convex/react` instead). Keeps TypeScript happy per-DB.

### D2 updated) Flag remains opt-in, but now DB-aware help string

`--with-messaging` help text adds “(postgres → oRPC+WS + Docker volume; convex → Convex native queries + storage)”. Prompt in saas wizard: same confirm but DB choice shown first so presence of WS vs Convex is visible.

### D3/D4/D5) Minor refinements

- Presence/typing for postgres: WS events `typing|presence|message|read` as before; for convex: ephemeral table `typingIndicators: defineTable({ conversationId, userId, isTyping, updatedAt }).index("by_conversation", ["conversationId"])` polled reactively (1s TTL) or via `convex-helpers` `presence` component if we decide to depend — recommend simple table first, `presence` component as optional follow-up to keep pin count low.
- Attachments: postgres path validates 10MB, allowlist `image/*, application/pdf, text/*`; convex path delegates validation to `ctx.storage` + `v.id("_storage")` mime check at mutation.
- i18n: both branches read `hasI18n` → emit `messages/{en,fr}.json` `messaging` namespace and `next-intl` / `convex` agnostic UI strings.

## Recommended Approach (revised)

### Phase 0 — Spike (half day)

1. WS spike for postgres (already planned) + convex spike: generate `ghostinit create --database convex --with-messaging --yes` scratch, verify `useQuery(api.messaging.listMessages, {conversationId})` goes live without refresh between two browsers, `generateUploadUrl` → image appears inline. Measure bundle contains no `ws` import.

### Phase 1 — Foundation

- Versions: add `ws 8.18.3`, `crossws 0.3.4`, bump `orpc 1.14.8`, add `storage` group `@aws-sdk/client-s3 3.850.0` (only consumed by postgres branch, but validated via `check:versions` regardless). Convex already pinned; no new convex pin.
- Env manifest: `WS_URL` / `STORAGE_DRIVER` / `S3_*` / `UPLOADS_DIR` added to `GLOBAL_ENV_KEYS` but docs clarify “postgres only; ignored for convex”. `src/templates/shared/env/core.ts` still emits `WS_URL` per-audience but convex projects’ `convex/env.ts` ignores it.
- Templates: `src/templates/realtime.ts` (marked `postgres-only` — composer guards with `effectiveDatabase==="postgres"`), `src/templates/storage.ts` (same guard).

### Phase 2 — Data & Domain (DB-branched)

- `src/templates/database.ts` `databasePackage` already emits `packages/database` for postgres; extend only when `hasMessaging && effectiveDatabase==="postgres"` to include 4 tables. Wrap `databaseComposerFiles` to not duplicate for convex.
- `src/templates/database/convex/schema.ts` `convexSchemaContent()` string array: extend only when `hasMessaging && effectiveDatabase==="convex"` to append messaging tables.
- `src/templates/database/convex/messaging.ts` new fragment (`convex/messaging.ts` content function) — queries/mutations with participant auth (`ctx.auth.getUserIdentity()`), pair uniqueness, read receipts, typing.
- `packages/modules/messaging` only for postgres; convex gets stub or no emit — `src/templates/modules.ts` gates with `hasMessaging && effectiveDatabase==="postgres"`.

### Phase 3 — Transport

- `src/templates/api.ts` `apiPackage(hasBilling, hasMessaging, effectiveDatabase)` — added param; emit `procedures/messaging/*` + `ws.ts` + `storage` HTTP handlers only when `hasMessaging && effectiveDatabase==="postgres"`. For convex, `hasMessaging` still true but `apiPackage` emits **nothing** for messaging (keeps `contract.ts` without `messaging` key).
- `src/templates/apps/fragments/api/core.ts`: `wsFileContent` guard same.

### Phase 4 — Apps

- Fragment pool `src/templates/apps/fragments/realtime/` and `.../messaging/` already exist; composer `appsComposerFiles` now branches: if `hasMessaging && effectiveDatabase==="postgres"` emit WS client + DM UI (orpc); else if `convex` emit `convex/react` hooks UI (same route paths `app/(app)/messages/page.tsx` but different imports); else no emit.
- `docker-compose.yml` volume `data/uploads` only when `postgres+messaging`.

### Phase 5 — CLI/Docs/Tests

- `src/lib/addons.ts` `presetDefaults.*.messaging=false`, `isValidAddonCombo` checks DB gate, `buildAddonInstallerMap` maps `input.messaging ?? false`.
- `docs/ARCHITECTURE.md` table adds row “Messaging realtime: postgres→WS (Bun.serve+crossws), convex→Convex queries+storage (no WS)”.
- Tests: generation-matrix gains 4 new corners (`postgres-messaging`, `convex-messaging` each monorepo/single); assertions branch on `effectiveDatabase` to allow `convex/_generated/*` but forbid `@repo/realtime` when convex.

## Work Plan

| #   | Unit                                                           | Depends | Key Surfaces                                                                                                  |
| --- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 0   | Spike postgres WS + convex native                              | —       | scratch projects                                                                                              |
| 1   | Versions + env + realtime/storage templates (postgres-guarded) | 0       | `packages/versions`, `env-manifest`, `templates/realtime.ts`, `templates/storage.ts`                          |
| 2   | DB schema branched (Drizzle vs Convex)                         | 1       | `templates/database.ts`, `templates/database/convex/schema.ts` + `convex/messaging.ts`                        |
| 3   | Domain/modules (postgres-only)                                 | 2       | `templates/modules.ts`                                                                                        |
| 4   | Transport branched (oRPC for postgres, none for convex)        | 3       | `templates/api.ts`, `templates/apps/fragments/api/core.ts`                                                    |
| 5   | App clients+UI branched (WS vs convex hooks, i18n gated)       | 4       | `templates/apps/fragments/{realtime,messaging}`, `templates/apps/{core,tanstack-core,expo-core,desktop-core}` |
| 6   | Composers + filtering + Docker                                 | 5       | `modes/monorepo/*-composer.ts`, `modes/single.ts`, `templates/root.ts`                                        |
| 7   | CLI config/addons + docs + generation-matrix tests             | 6       | `lib/addons.ts`, `lib/config.ts`, `cli/args.ts`, `commands/create/*`, `docs/ARCHITECTURE.md`                  |

## Validation Plan

- **Build:** `bun run build && bun run check` (oxlint+oxfmt+tsc-b 12 projects) — must stay green for both DBs.
- **Matrix:** `bun test tests/unit/generation-matrix.test.ts --timeout 100000` (updated) must pass 12 corners: `database none + messaging on` throws ValidationError; `postgres+messaging` has no `convex/messaging` import; `convex+messaging` has no `ws` import and no `packages/realtime`.
- **Generated installs:** `rm -rf /tmp/gi-{postgres,convex}-msg && bunx ghostinit create --with-messaging --database {postgres|convex} … --no-install` then `bun install && bun run typecheck && bun run lint` in each.
- **Realtime manual (highest risk):** postgres via `docker compose up` + WS tab shows `101 Switching Protocols` at `/api/ws`; two users typing shows `is typing…` <200ms, file upload 2MB image appears inline, presence dot toggles. Convex via `bun run dev` + `npx convex dev` — two tabs, no WS frame, same proof via Convex reactivity + `/_storage` URL.

## Risks / Rollback

- Duplicate realtime paths double maintenance — mitigate by sharing domain types + UI layout, only swapping data hooks; keep `// @allow-long` escape reason explicit (“postgres WS + convex branch”).
- Convex `ctx.storage` rate limits vs local FS — document 1MB DoS guard (`v.any` avoided, size <900k check copied from webhook_events).
- Filtering bugs (leaked `@repo/realtime` into convex) — generation-matrix is the guard; keep its assertions strict.
- Rollback per DB: flip `--with-messaging` off re-applies filters stripping all messaging traces; per-DB rollback is `git revert` on branch-guarded composers.

## Open Questions — RESOLVED per owner “do the recommended things” (2026-08-08)

1. `sendTyping` — ✅ **Recommended applied:** postgres = **WS-ephemeral broadcast only** (no DB row, 500ms debounce + 3s auto-stop, lost on disconnect, cheap). Convex = **`typingIndicators` table with TTL** (fields `conversationId, userId, isTyping, updatedAt` + index `by_conversation`, reactive query filters `updatedAt > Date.now()-5000` → auto-expires, works with Convex reactivity without extra WS).
2. Attachments — ✅ **10MB, allowlist `image/*, application/pdf, text/*`** kept. Postgres validates in `create-attachment` use-case (zod mime regex + `byteSize <=10*1024*1024`), convex validates in mutation `v.id("_storage")` + `ctx.storage.getMetadata` size check. Images inline preview; other files pill + download. No video/audio in v1.
3. Convex presence — ✅ **Simple `typingIndicators` + `presence` via same table first** (no `convex-helpers` pin). Presence = companion field `online` derived from `typingIndicators.updatedAt` or dedicated `presence: defineTable({userId, online, updatedAt})` if needed — keep to one table first. Add `convex-helpers` later if rate limits or presence UX needs richer cursor/room semantics.

None — ready to implement.
