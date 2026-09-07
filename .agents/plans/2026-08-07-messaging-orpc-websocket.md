# Messaging System — oRPC + WebSockets (Next.js / TanStack Start / Expo / Desktop)

## Goal

Add a production-ready, type-safe messaging system to `ghostinit` generated projects using **oRPC contract-first + WebSockets** that works across all four app targets in the generator matrix: **Next.js App Router**, **TanStack Start (Nitro/Vite)**, **Expo (React Native + Uniwind)**, and **Electron Desktop (TanStack Router SPA)**. The system must follow the 6-layer GhostInit Layered Architecture, reuse the existing `packages/api` + `apps/web/src/lib/orpc` + `@repo/auth` patterns, and stay gated behind a composable additive flag so existing projects are unaffected until they opt in.

## Success Criteria (updated 2026-08-07 per owner feedback: DM-only, opt-in, Docker, images/files, presence/typing, i18n)

- A new **opt-in** addon `messaging` (`--with-messaging`, NOT defaulted in `saas`; all presets `false` until explicitly enabled) generates:
  - Drizzle tables `conversations`, `conversation_participants`, `messages`, `message_attachments`, `message_reads` (DM-only `conversations` with unordered pair unique index on participants) and Convex equivalents, plus `packages/database/src/schema/messaging.ts` aggregation.
  - Domain pure types + port + 5–6 use-cases in `packages/modules/src/messaging/*` (DM-only create/find, list, send, list messages, markRead, upload attachment stub).
  - `packages/api/src/procedures/messaging/*` oRPC procedures + `contract`/`router` inclusion + `packages/api/src/ws.ts` shared handler factory.
  - Realtime publisher `packages/realtime` (Supporting, level 6) with in-memory + optional Upstash Redis fan-out **plus presence/typing channels**.
  - Server glue: Docker-primary `Bun.serve` upgrade at same port (Next.js custom `server.ts` wrapping `next` + `RPCHandler(ws)`; no Vercel special-case — docs state Fly/Docker only for realtime). TanStack Start `src/routes/api/ws.ts` via `defineWebSocketHandler` / `experimental_RPCHandler` from `@orpc/server/crossws`, both calling `createContext` for auth.
  - Clients: `apps/web/src/lib/realtime.ts`, `src/lib/realtime.ts` (TanStack), `apps/mobile/src/lib/realtime.ts`, `apps/desktop/src/renderer/lib/realtime.ts` — typed `RPCLink` over WebSocket + auto-reconnect, heartbeat, auth, query-cache integration, **typing debounce + presence**.
  - Inbox UI: web (Next + TanStack) `/messages` (conversation list + thread, image inline preview, file download, online dot, `is typing…`), mobile `app/(app)/messages`, desktop `src/renderer/routes/messages.tsx`, all strings via `next-intl` when `i18n` enabled. Images/files uploaded via HTTP `POST /api/messaging/attachments` (multipart/FormData) then referenced by `sendMessage`.
- All eight generation-matrix corners (`monorepo/single × nextjs/tanstack-start × postgres/convex/none × messaging on/off`) satisfy the existing guards: every `.ts/.tsx` parses via `oxc-parser`, every relative import resolves, no `next` import leaks into TanStack, no feature leakage, `.env.local` never mints vendor secrets.
- `bun run build && bun run check && bun test --timeout 100000` green; `bun run test:generated` corners `next-monorepo` + `single-next` still green, and a new `messaging` fixture installs + typechecks + lints cleanly. `ghostinit check` still passes (no upward imports).
- Docs & env sync 5 places updated; `turbo.json` `globalEnv` exhaustive; version pins verified via `bun run check:versions`.

## Context And Current Facts

**oRPC today (grounded):**

- `packages/versions/src/index.ts` pins `@orpc/server 1.14.7` / `@orpc/contract 1.14.7` / `@orpc/client 1.14.7` / `@orpc/openapi 1.14.7` / `@orpc/zod 1.14.7` — host `bun.lock` already has 1.14.8 installed, so patch drift is safe. Peers `ws >=8.18.1` + `crossws >=0.3.4` declared as `optionalPeers` on `@orpc/server` ([bun.lock:49]).
- `src/templates/api.ts` (466 LOC) builds `packages/api`: `context.ts` (`createContext(headers) → auth.api.getSession`), `router.ts` (`os.prefix("/api").router(implementer.router(...))`), procedures `health`, `me`, billing demos, contract + `generateOpenAPISpec`. Transport = oRPC over HTTP via `RPCHandler` + `OpenAPIHandler` in `src/templates/apps/fragments/api/core.ts:46` (`orpcFileContent`). Client is `RPCLink` from `@orpc/client/fetch` in `src/templates/apps/fragments/core/orpc.ts:5` and `src/templates/apps/fragments/expo/orpc.ts:41` (Expo forwards `cookie` via `authClient.getCookie()`, Desktop forwards `cookie` + `safeStorage` bridge at `src/templates/apps/desktop-core.ts:306`).
- No websocket code exists (`grep -rn websocket …` returned 0 in templates). oRPC adapters are available in `node_modules/@orpc/server/package.json` exports: `./websocket`, `./ws`, `./crossws`, `./bun-ws`, `./fetch`, `./node` and client `./websocket` (`RPCLink` over `LinkWebsocketClient` with `MinimalWebsocket` interface). Host inspection confirms `RPCHandler` for each adapter takes the same `appRouter` + `HandleStandardServerPeerMessageOptions<T>` (context), and client `RPCLink` wraps a raw `WebSocket` instance.
- App hosts:
  - Next.js 16.2.10 App Router: `apps/web/src/app/api/[...path]/route.ts` handles `GET/POST/PUT…` via `RPCHandler.handle(request, {context})` ([core.ts:58-84]). No upgrade handling yet.
  - TanStack Start 1.168.30 on Nitro 3 + Vite 7: `src/routes/api/rpc/$splat` same handler but `request: {request: Request}` shape ([core.ts:72-77]). Nitro has first-class crossws support (`defineWebSocketHandler`), which maps to oRPC `experimental_RPCHandler` in `@orpc/server/crossws`.
  - Expo 54 (`expo-router`, `babel-preset-expo`, `withUniwindConfig(metro)`): `apps/mobile/src/lib/orpc.ts` + `app.json` scheme sanitized from `__PROJECT_NAME__`. Uses `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_APP_URL` for base URL.
  - Desktop Electron 41 (`electron-vite`, TanStack Router SPA renderer, `electron-store`, `safeStorage`, `autoUpdater`): `apps/desktop/src/renderer/lib/orpc.ts` uses `fetch(..., credentials:"include")` + bridge `authGetSession`. Main process isolated (`contextIsolation:true, sandbox:true`).

**Architecture:**

- 6 layers UI(1)→Transport(2)→Domain(3)→Capabilities(4)→Vendors(5)→Supporting(6) enforced build-time via `src/lib/architecture/rules/layered.ts` (`checkLayeredDependency`, `isSameBoundedContext`). Current violations checked: domain-purity, capability-isolation, client-boundary, vendor-isolation, etc. Database (`packages/database`) is Supporting; importing Vendors/Capabilities from Supporting is forbidden.
- Composers: `src/templates/modes/monorepo/index.ts` (dedup+sort+`__PROJECT_NAME__` replace) calls `appsComposerFiles`, `apiComposerFiles`, `databaseComposerFiles`, etc., then filters by `effectiveApps`, `hasAuth`, `hasApi`, etc., and strips workspace deps. `appsComposerFiles` branches `isTanstack` to emit either `genAppsFiles` or `genTanstackFiles` plus Expo/Desktop files plus `typescriptConfigWithAliases` (explicit path tables per framework). Addons registry `src/lib/addons.ts` (`optionalAddons=[auth,api,email,analytics,cache,i18n,eve,pdf]`, `presetDefaults`) builds `AddonInstallerMap` consumed everywhere.
- Env manifest single source `src/lib/env-manifest.ts`: `ENV_PLACEHOLDERS` + `GLOBAL_ENV_KEYS` (≈60 entries) + `CONVEX_ENV_KEYS`; `src/templates/root/turbo.ts` calls `getGlobalEnvKeys(runtime)` for `turbo.json` `globalEnv`; `.env` builders in `src/templates/shared/env/{core,billing,builders}.ts` emit per-audience prefixes (`NEXT_PUBLIC_` vs `VITE_` vs `EXPO_PUBLIC_` via `EnvAudience`).
- DB: `src/templates/database.ts` emits `packages/database` with `drizzle-orm 0.45.2`, `pg 8.22.0`, `drizzle-kit 0.31.10`, billing aggregation hack copying `billing/schema/tables/*`. `database=none` emits stub `packages/database` with `db:any` proxy. Convex variant lives under `packages/database/convex/*` templates (not explored deeply here but parity required).

**Tooling quirks to preserve:** `bunfig.toml` host `hoist=false isolated`, generated `hoist=true`; TS 6.0.3; `// @allow-long` escape; no `export *`; `FsTransaction` mandatory; secret-safe logger `SECRET_SUBSTRINGS`; `versions.ts` SSOT.

## Constraints And Non-goals

- **Constraints:**
  - Must not break existing generation-matrix invariants; new tables/procedures must be gated so `messaging off` produces zero trace (no import leakage, no extra env vars in turbo cache for that corner? But `globalEnv` is global — new vars should be in the exhaustive list regardless, with wildcard coverage noted).
  - `<300 LOC guideline` per template file (use `// @allow-long` with reason if messaging fragments exceed, like billing does).
  - `no export *` — explicit named re-exports only (see `billing/webhooks/index.ts` pattern).
  - `FsTransaction` mandatory for CLI writes; no direct `fs.*Sync`.
  - Next.js App Router on Vercel **does not support WebSocket upgrades** in serverless functions (Node runtime upgrade still requires a long-lived server). Plan must call this out and offer self-host/Fly/Docker path vs graceful fallback (polling/SSE/Convex live queries) for Vercel. Do not promise Vercel-WS parity.
  - oRPC crossws adapter is currently `experimental_` prefixed (`experimental_RPCHandler` / `experimental_CrosswsHandler`) — API may change between minors; pin exact version and isolate import behind `packages/realtime` + `packages/api/src/ws.ts` factory so only one file churns.
  - Expo `WebSocket` cannot send custom headers; auth must travel via query-string token or first-message auth handshake, not `headers` callback like HTTP RPCLink.
  - Desktop renderer `window.location` is `file://` in packaged app — base URL must be env-configurable, not `window.location.origin`.

- **Non-goals (v1) — revised:**
  - No E2EE, no message search/indexing, no voice/video, no federation, no admin moderation beyond delete.
  - **Attachments ARE in scope (v1):** images inline preview + file download. Text + image/file share is required; push/leave voice for v2.
  - No email push for every message (digest only if `email` enabled — optional). No Pusher/Ably/Reverb vendor — Docker self-hosted `ws`/`crossws` + optional Redis fan-out; external vendor is future `messaging/providers/*`.
  - No offline CRDT — simple store-and-forward with server `createdAt`; mobile/desktop queue unsent in memory + retry on reconnect.
  - No Vercel WS promise — Docker is primary deploy; Vercel gets degraded polling fallback only (documented).

## Key Decisions

### 1) Transport: oRPC-native WebSocket via same `appRouter` + thin `packages/realtime` publisher

**Recommended:** Use oRPC official WebSocket adapters so REST and WS share the **same router and procedures** — no second RPC surface.

- **Server:** New `packages/api/src/ws.ts` exports `createWsHandler()` that `new RPCHandler(appRouter, opts)` from the correct adapter, selected by runtime flag. Generated glue:
  - Next.js (and single-mode Next): **Bun sidecar custom server** `server.ts` (opt-in when `messaging` on + `deploy !== vercel`) that `Bun.serve({ fetch: nextHandler, websocket: wsHandler })` or `import { RPCHandler } from "@orpc/server/ws"` + `WsHandler.upgrade(ws, {context: await createContext(req.headers)})` using `ws` peer. Route `apps/web/src/app/api/ws/route.ts` becomes a thin upgrade detector that returns 426 outside Bun, so `bun run dev` works and Vercel returns clear `WebSocket not supported — use polling fallback, deploy to Fly/Docker for realtime`.
  - TanStack Start: `src/routes/api/ws.ts` (`createFileRoute('/api/ws')`) with `defineWebSocketHandler` (Nitro) calling `new experimental_RPCHandler(appRouter).message(peer, msg, {context})` from `@orpc/server/crossws`. This is the first-class path.
  - Bun standalone (if user runs `bun run realtime`): `@orpc/server/bun-ws` adapter `RPCHandler`.
- **Client:** Keep existing `RPCLink(fetch)` for queries/mutations; add **parallel** `RPCLink(websocket)` from `@orpc/client/websocket` sharing the same `appRouter` type: `LinkWebsocketClient({ websocket })` where `websocket` is a managed `WebSocket` instance. Wrap it in a new `apps/*/src/lib/realtime.ts` that creates one global WS, auto-reconnects with exponential backoff + jitter, heartbeat `ping/pong` 30s, and re-creates `createORPCClient` per connection. Use same `createContext` auth extraction (server reads cookie or `?token=` / `Sec-WebSocket-Protocol`).
- **Publisher:** New `packages/realtime` (Supporting, ~80 LOC) exports `publish(conversationId, event)` + `subscribe(conversationId, cb)` backed by in-memory `Map<topic, Set<callback>>` + optional `Upstash Redis` pub/sub when `cache===redis` (`UPSTASH_REDIS_REST_URL/TOKEN` already in `GLOBAL_ENV_KEYS`). After `sendMessage` use-case commits to DB, it calls `publish`.

**Rejected:**

- External SaaS (Pusher/Ably/Supabase Realtime) — violates "oRPC with websockets" request and adds vendor lock/cost; can be added later as `messaging/providers/pusher/*` behind the same publisher port.
- Raw `ws` without oRPC (second protocol) — loses contract type-safety, duplicates auth, fails architecture check (Transport would bypass `@repo/api`).
- SSE only — simpler on Vercel but not WebSocket; user explicitly asked for WS. Keep SSE as **fallback** when upgrade unavailable (see risk).

### 2) Feature flag shape: new `messaging` optional addon — OPT-IN FOR ALL PRESETS (owner decision 2026-08-07)

**Recommended:** Add `messaging` to `optionalAddons` in `src/lib/addons.ts`, typed `boolean` in `BuildAddonMapInput`. **All presets default `false`** (`presetDefaults.saas.messaging=false`, `frontend=false`, `custom=false`) — not even SaaS auto-includes chat. New CLI flag `--with-messaging` (no `--features` alias needed). `buildAddonInstallerMap` maps `input.messaging ?? false` (no preset fallback). Wire to `src/lib/config.ts` `projectConfigSchema`, `src/cli/args.ts`, `src/commands/create/*` prompts (custom checklist 9th toggle, plus saas wizard asks "Include messaging (DM chat, files)?" as optional confirm), help text. Validation `isValidAddonCombo` adds: `if (hasMessaging && database==="none") invalid`, `if (hasMessaging && !hasApi) invalid` (messaging requires `api` + `auth` + DB).

**Rejected:** SaaS-default `messaging=true` — owner explicitly rejected. Also rejected repurposing existing `api` flag alone — messaging needs DB + realtime deps, so it needs its own toggle.

### 3) Data model & package placement — DM-ONLY + attachments (owner decision)

**Recommended:**

- Supporting DDL (Docker-friendly, shared volume `/app/uploads` or `S3_BUCKET` if set): `packages/database/src/schema/tables/conversations.ts` (`id uuid pk`, `createdBy uuid fk users`, `createdAt/updatedAt timestamp` — **no `type`/`title`**, DM-only), `conversation_participants.ts` (`conversationId uuid`, `userId uuid`, composite pk, `joinedAt`, `lastReadAt timestamp nullable`, **unique unordered pair index** to prevent duplicate DM: `unique(lower(userA), lower(userB))` or app-level check `where participants = [a,b]` sorted). `messages.ts` (`id uuid pk`, `conversationId fk`, `senderId fk`, `body text 1..4000 nullable` — nullable when attachment-only, `replyToId fk nullable`, `createdAt timestamp`, index `conversationId, createdAt DESC`), `message_attachments.ts` (`id uuid pk`, `messageId fk`, `storageKey text`, `url text`, `mimeType text`, `byteSize int`, `originalName text`, `createdAt`), `message_reads.ts` (`conversationId+userId+messageId`). Add enums not needed (DM has no group type). For Convex, mirror in `convex/schema.ts` via `defineTable`. Enforce `senderId` ∈ participants in use-case; enforce file size 10MB max, image mime allowlist.
- Storage: generated project includes `packages/storage` thin wrapper (local FS `uploads/` volume in `docker-compose.yml` + `STORAGE_DRIVER=local|s3` env; if `S3_*` set, use `@aws-sdk/client-s3` — pin version via `packages/versions` `storage` group). oRPC upload is **HTTP multipart** `POST /api/messaging/attachments` (not WS) returning `{attachmentId, url}` — then `sendMessage` references `attachmentIds`. Docker volume mount `./data/uploads:/app/uploads` + served via `GET /api/messaging/attachments/:id` signed handler (checks participant).
- Domain: `packages/modules/src/messaging/domain/types.ts` (`Conversation`, `Message {body, attachments: Attachment[]}`, `Participant`, `Attachment`) — **no framework imports**, satisfies `domain-purity`.
- Application: `packages/modules/src/messaging/application/{get-or-create-conversation, list-conversations, list-messages, send-message, mark-read, create-attachment}.ts` each `Input/Output/Deps{db,storage,realtime}` + `useCase` returning `Result`. `getOrCreateConversation(participantIds: [a,b] sorted)` finds existing DM or creates `conversations+participants` row transactionally.
- Capabilities: `packages/services/src/messaging/` only if email/push notifier needed; else thin.
- i18n: domain/application strings are English code; UI strings go through `useTranslations('messaging')` when `hasI18n` — template emits `messages/en.json` + `fr.json` (or project locale) merging into existing `src/i18n` namespaces.

**Rejected:** Group `type/title/role` tables — owner specified DM-only. Putting tables only in `packages/modules` — breaks `database-isolation`. Single `messages` without `conversations` abstraction — limits read-receipts/attachments scoping.

### 4) oRPC procedure surface — DM-only + attachments + presence (owner decision)

**Recommended (REST + subscription, i18n-gated strings):**

```ts
// packages/api/src/contract.ts (added when hasMessaging)
messaging: {
  listConversations: oc.route({method:"GET", path:"/messaging/conversations"}).output(z.object({conversations: z.array(ConversationSchema)})), // DM list: peer user embedded
  listMessages: oc.route({method:"GET", path:"/messaging/conversations/:id/messages"}).input(z.object({conversationId: z.string().uuid(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).default(20)})).output(z.object({messages: z.array(MessageWithAttachmentsSchema), nextCursor: z.string().nullable()})),
  getOrCreateConversation: oc.route({method:"POST", path:"/messaging/conversations/find-or-create"}).input(z.object({peerUserId: z.string().uuid()})).output(ConversationSchema), // DM-only sorted pair
  sendMessage: oc.route({method:"POST", path:"/messaging/messages"}).input(z.object({conversationId: z.string().uuid(), body: z.string().min(1).max(4000).optional(), replyToId: z.string().uuid().optional(), attachmentIds: z.array(z.string().uuid()).max(5).optional()})).refine(d=>!!d.body || (d.attachmentIds?.length), "body or attachment required").output(MessageWithAttachmentsSchema),
  markRead: oc.route({method:"POST", path:"/messaging/read"}).input(z.object({conversationId: z.string().uuid(), messageId: z.string().uuid()})),
  // HTTP multipart upload (not WS) — uses openapi handler raw Buffer branch: Buffer.from(await request.arrayBuffer()) like billing webhooks
  createAttachment: oc.route({method:"POST", path:"/messaging/attachments"}).input(z.object({conversationId: z.string().uuid(), file: z.instanceof(File)})).output(z.object({attachmentId: z.string().uuid(), url: z.string()})),
  // Subscription — over WS; events include presence + typing (owner required live typing/online)
  subscribe: oc.route({method:"GET", path:"/messaging/subscribe"}).input(z.object({conversationId: z.string().uuid()})).output(z.object({event: z.discriminatedUnion("type", [
    z.object({type:z.literal("message"), message: MessageWithAttachmentsSchema}),
    z.object({type:z.literal("typing"), userId: z.string().uuid(), isTyping: z.boolean()}),
    z.object({type:z.literal("presence"), userId:z.string().uuid(), online: z.boolean()}),
    z.object({type:z.literal("read"), userId:z.string().uuid(), messageId:z.string().uuid()}),
  ])})),
  sendTyping: oc.route({method:"POST", path:"/messaging/typing"}).input(z.object({conversationId: z.string().uuid(), isTyping: z.boolean()})),
}
```

Handlers in `packages/api/src/procedures/messaging/*` call `requireUser(ctx)` / `protectedProcedure(ctx)`, then the corresponding use-case. `subscribe` returns an `AsyncGenerator` that `yield`s events from `realtime.subscribe` and cleans up on `close`.

**Rejected:** SSE-only subscription — technically works on Vercel but not the requested WS. Also rejected separate `POST /messaging/typing` REST polling for typing — WS event is cheaper and already needs the subscription channel.

### 5) Env & turbo

**Recommended:** Add to `packages/versions/src/index.ts` new groups `ws:"8.18.3"`, `crossws:"0.3.4"` (verify exact latest non-broken; currently installed `ws` not present — pin real versions and run `bun run check:versions`), bump `orpc` to `1.14.8` if desired. Add to `src/lib/env-manifest.ts`:

- `ENV_PLACEHOLDERS`: none minted (WS needs no secret; derive URL from `APP_URL`).
- `GLOBAL_ENV_KEYS`: explicit `WS_URL`, `NEXT_PUBLIC_WS_URL`, `VITE_WS_URL`, `EXPO_PUBLIC_WS_URL`, `DESKTOP_WS_URL` plus keep wildcards; doc that server secrets are not added. Update `src/templates/shared/env/core.ts` `publicVarLines` to emit `WS_URL` per-audience (optional — can be derived via `APP_URL.replace(/^http/,"ws")`, so emitting is DX sugar).
- `turbo.json` via `getGlobalEnvKeys` auto.

**Rejected:** Hardcoding `ws://localhost:3000` everywhere — breaks self-host (`APP_URL` may be `https://myapp.com`). Derive from `env.APP_URL` / `EXPO_PUBLIC_API_URL`.

### 6) Client per platform — DM + attachments + presence + i18n (owner decision, Docker primary)

- **Web Next.js:** `apps/web/src/lib/realtime.ts` exports `getMessagingWs()` + hooks `useMessaging(conversationId)` (TanStack Query `useQuery` for history + `useEffect` WS `subscribe`, merging via `queryClient.setQueryData`). Image preview inline (`<img src={att.url} loading="lazy">` with `@repo/ui` aspect box), file pills with download. Typing: debounce `sendTyping(isTyping)` 500ms + 3s auto-stop; presence: `online` dot from `presence` events + in-memory `Map<userId, online>` seeded via `realtime.presenceSubscribe`. URL `NEXT_PUBLIC_WS_URL` else `location.origin.replace(/^http/,"ws")+"/api/ws"`. Cookie auth automatic. Strings via `useTranslations('messaging')` when `hasI18n` else hardcoded English — template emits `messages/en.json` fragment `{"conversations":"Conversations","typeMessage":"Type a message…","isTyping":"{name} is typing…"}`.
- **TanStack Start:** `src/lib/realtime.ts` same but `VITE_WS_URL`, route guard identical to web billing pattern.
- **Expo:** `apps/mobile/src/lib/realtime.ts` `new WebSocket(wsUrl+"?token="+await SecureStore.getItemAsync(...))`; server reads `searchParams token`. Upload: `expo-image-picker` + `FileSystem.uploadAsync` to `POST /api/messaging/attachments` (multipart). Preview: `Image` with `uri: att.url`. Typing dot same as web.
- **Desktop:** `apps/desktop/src/renderer/lib/realtime.ts` reads `DESKTOP_WS_URL`/`VITE_API_URL` else `ws://localhost:3000` (mirrors `desktopOrpcContent.ts:306`). Docker serve supports same WS upgrade; renderer connects directly.
- **Attachment flow (all platforms):** `input type=file` → `POST /api/messaging/attachments` (HTTP, not WS) with `FormData` → returns `attachmentId/url` → `sendMessage({attachmentIds:[id]})` → WS `message` event includes `attachments[]` with `url` so image appears without extra fetch. `docker-compose.yml` mounts `./data/uploads:/app/data/uploads` + `STORAGE_DRIVER=local`; if `S3_*` present switches to S3 wrapper.

**Rejected:** Sharing one `realtime.ts` across apps — path alias + SecureStore differences force per-platform fragments (same reason `appsComposerFiles` branches).

## Recommended Approach (Phased) — revised per owner (Docker primary, DM-only, attachments, presence, i18n)

### Phase 0 — Spike (half day, no template write)

1. Import `new (await import("@orpc/server/websocket")).RPCHandler(router)` + `@orpc/client/websocket` `RPCLink` against minimal router; verify `createContext` auth + `?token=` fallback, reconnect, heartbeat.
2. Verify Nitro `defineWebSocketHandler` + `experimental_RPCHandler` import; confirm `Bun.serve` upgrade with `ws` in Docker `next start` wrapper.
3. **Decision locked per owner: Docker primary** — Next.js uses `server.ts` (`Bun.serve` wrapping `next` handler + `RPCHandler(ws)` at same port `/api/ws`). No Vercel WS promise; document degraded polling fallback only. Spike image upload `FormData → Buffer.from(await request.arrayBuffer())` like billing webhooks, store to local volume, serve via `GET /api/messaging/attachments/:id` with participant check.

### Phase 1 — Foundation (Supporting: versions + env + realtime + storage)

- Pin `ws 8.18.3`, `crossws 0.3.4` (+ bump `orpc` to 1.14.8) in `packages/versions/src/index.ts` catalog new groups `realtime` + `storage` (`@aws-sdk/client-s3 3.850.0` + `@aws-sdk/s3-presigned-post` if needed — verify via `bun run check:versions`). Add `expo-image-picker`, `expo-file-system` if not already pinned.
- Extend `src/lib/env-manifest.ts` (`STORAGE_DRIVER`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `UPLOADS_DIR`) + `GLOBAL_ENV_KEYS`, `src/templates/shared/env/core.ts` `publicVarLines` for `WS_URL`, `src/templates/root/turbo.ts`.
- Add `src/templates/realtime.ts` (publisher + presence/typing channels) and `src/templates/storage.ts` (`packages/storage` local-FS + S3 wrapper, Docker volume mount). Both Supporting level 6.

### Phase 2 — Data & Domain — DM-only + attachments

- Add Drizzle tables `conversations`, `conversation_participants`, `messages`, `message_attachments`, `message_reads` + Convex mirrors (`convex/schema.ts` `defineTable`). Add `STORAGE_DRIVER` handling + `docker-compose.yml` volume. Ensure `isValidAddonCombo` blocks `messaging && database===none` and `messaging && !hasAuth`.
- Add `src/templates/modules.ts` messaging branch: when `hasMessaging`, emit `packages/modules/src/messaging/{domain,application,ports}/*` plus barrel `export * as messaging`. Domain pure. Include i18n namespace `messaging` in `src/templates/i18n.ts` when both `hasMessaging && hasI18n`.

### Phase 3 — Transport (oRPC) — presence/typing + upload

- Extend `src/templates/api.ts`: `apiPackage(hasBilling, hasMessaging)` (default `false`). Emit `procedures/messaging/{list-conversations,list-messages,get-or-create-conversation,send-message,mark-read,create-attachment,subscribe,send-typing}.ts` (each <300 LOC). Update `contract.ts`/`router.ts`. Add `ws.ts` factory + `context.ts` `?token=` fallback. Add `attachments.ts` HTTP handler (multipart FormData via `request.arrayBuffer()` → `storage.put`).
- Update `src/templates/apps/fragments/api/core.ts`: add `wsFileContent(router)` + `attachmentsFileContent()` for Next/TanStack.

### Phase 4 — App glue + composers — Docker + i18n-gated UI

- Add `src/templates/apps/fragments/realtime/` (per-platform WS) + `src/templates/apps/fragments/messaging/{shared,page,hooks,components,attachments}.ts` emitting Next (`app/(app)/messages/page.tsx` with image grid, file pills, typing bar, presence dot, i18n) and TanStack (`routes/messages.tsx`). Expo: `src/templates/apps/expo-pages.ts` extension (`app/(app)/messages.tsx` + `image-picker`). Desktop: `desktop-core.ts` `desktopMessaging*` (`src/renderer/routes/messages.tsx`).
- Wire `apps-composer.ts` + `packages-composer.ts` + `root-composer.ts` (+ `docker-compose.yml` when `hasMessaging` add `volumes: ./data/uploads` + `Dockerfile` `COPY uploads`). Filter `!hasMessaging` strips `messaging/realtime/storage` paths + deps. `single.ts` parity. When `hasMessaging && hasI18n`, emit `messages/{en,fr}.json` merged.

### Phase 5 — Docs, validation, CI

- Update `AGENTS.md` "5 places" table + tooling quirk for WS, `docs/ARCHITECTURE.md` layered diagram + realtime notes + deploy WS limitations (Vercel row), `CONTRIBUTING.md` how-to-add, `README.md` flag.
- Regenerate `tooling/typescript-config` path tables to include `@repo/realtime`.
- Run `bun run build && bun run check && bun test --timeout 100000 tests/unit/generation-matrix.test.ts --timeout 100000` and assert matrix passes for messaging on/off.
- Add `tests/unit/messaging-generation.test.ts` (matrix slice) and `tests/integration/messaging-ws.test.ts` (spin up Bun WS server in-process, call `sendMessage` over WS, assert subscriber receives).

## Work Plan (ordered, with owners/surfaces)

| #   | Work Unit                                                                                    | Surfaces to Touch                                                                                                                                                                                                  | Dependency          | Verification                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Spike: oRPC WS adapters (websocket/ws/crossws/bun-ws) + Nitro handler + auth token via query | `node_modules/@orpc/*` reading, scratch ` /tmp/ws-spike`                                                                                                                                                           | none                | Demo `bun run /tmp/ws-spike/client.ts` → receives `message` event second client sent; print logs                                                                 |
| 1   | Versions + env manifest + turbo                                                              | `packages/versions/src/index.ts`, `src/lib/env-manifest.ts`, `turbo.json`, `src/templates/shared/env/core.ts`, `src/templates/root/turbo.ts`                                                                       | 0                   | `bun run check:versions` + `grep -R WS_URL turbo.json` + `.env.example` cat                                                                                      |
| 2   | `packages/realtime` template                                                                 | `src/templates/realtime.ts` (+ `src/templates/modes/monorepo/packages-composer.ts` to emit), `tooling/typescript-config/base.json` paths                                                                           | 1                   | `bun run build && node dist/cli.js create --help` shows new flag; generate `tmp` project with `--with-messaging`, `cat packages/realtime/src/index.ts`           |
| 3   | DB schema (Drizzle + Convex)                                                                 | `src/templates/database.ts`, `src/templates/database/convex/*`, `src/templates/shared/env/*` if new DB vars                                                                                                        | 1                   | `bunx tsc -p packages/database/tsconfig.json --noEmit` in generated project; matrix: `database=postgres` vs `convex` both typecheck                              |
| 4   | Domain + application (`@repo/modules/messaging`)                                             | `src/templates/modules.ts` + `src/templates/modes/monorepo/modules-composer.ts` (re-export logic)                                                                                                                  | 3                   | `bun test packages/modules/tests/messaging/*.test.ts` (new unit tests for use-cases)                                                                             |
| 5   | oRPC procedures + WS handler factory                                                         | `src/templates/api.ts`, `src/templates/apps/fragments/api/core.ts`, `src/lib/architecture/rules/layered.ts` (if new layer mapping for `realtime`)                                                                  | 4                   | `bun run build && ghostinit check` in generated project passes; `grep -R messaging packages/api/src`                                                             |
| 6   | App glue: Next.js WS route / custom server + TanStack WS route                               | `src/templates/apps/core.ts`, `src/templates/apps/tanstack-core.ts`, `src/templates/apps/api.ts`, `src/templates/modes/monorepo/apps-composer.ts`, `src/templates/modes/single.ts`                                 | 5                   | Generate Next + TanStack projects, `ls apps/web/src/app/api/ws` and `cat src/routes/api/ws.ts`, `bun run dev` manual hello→echo over WS via `wscat`              |
| 7   | Clients per platform + UI                                                                    | `src/templates/apps/fragments/realtime/*`, `src/templates/apps/fragments/messaging/*`, `src/templates/apps/expo-components.ts`, `src/templates/apps/desktop-core.ts`                                               | 6                   | Generated web renders `/messages`, mobile `expo start --web`, desktop `electron-vite dev` each send/receive live                                                 |
| 8   | Composer filtering + help + prompts                                                          | `src/lib/addons.ts` (`optionalAddons`, `presetDefaults`, `parse*`, `buildAddonInstallerMap`), `src/lib/config.ts`, `src/cli/args.ts`, `src/commands/create/*`, `src/cli/help.ts`, `src/lib/constants.ts` re-export | 7 (but merge early) | `bun test tests/unit/addons.test.ts` (new cases), `ghostinit create --help` grep `messaging`, matrix `messaging off` has zero leakage (`grep -r messaging` == 0) |
| 9   | Docs + tests + CI gates                                                                      | `AGENTS.md`, `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`, `README.md`, `skills/**`, `tests/unit/generation-matrix.test.ts` (add messaging dimension or new matrix file), `tests/integration/*`                       | 8                   | Full `bun test --timeout 100000`, `bun run check:ci`, `scripts/test-generated.ts --only next-monorepo,tanstack-monorepo` with `--with-messaging`                 |

Concurrency: 1–3 can be parallel after spike; 4/5 sequential (schema→use-case→procedures must align types); 6/7 overlap once transport contract is stable.

## Validation Plan

- **Static:** `bun run format && bun run build && bun run check` (oxlint + oxfmt + tsc -b). Run architecture checker `node dist/cli.js check` on a generated messaging project — must report 0 HIGH/BLOCKER. Verify `no export *` in `packages/realtime` + `billing/webhooks` parity.
- **Unit matrix:** `bun test tests/unit/generation-matrix.test.ts --timeout 100000` (existing 8 corners) plus new `tests/unit/messaging-generation.test.ts` asserting for `hasMessaging=true/false` × 4 corners: `.ts` parseable, imports resolve (no `@repo/realtime` when off), no `ws` import when off, `.env` placeholder discipline, not emitting `apps/web/src/app/(app)/messages` when off. Guard the same properties the current matrix does for `eve`, `billing`, etc.
- **Generated project gate:** `bun run test:generated --only next-monorepo --keep` with a fixture config `{ ..., messaging: true, apps: ["web"] }` (add corner `next-messaging-monorepo` to `scripts/test-generated.ts` corners list, or run manual `ghostinit create demo --yes --with-messaging --apps web,desktop,mobile` then `cd /tmp/demo && bun install && bun run typecheck && bun run lint`). Must pass. Repeat for `tanstack-start` variant (Nitro) — currently `expectedFailures: {tanstack:typecheck:false}` is fixed, so tanstack-messaging must also be green.
- **Runtime WS:** Integration test `tests/integration/messaging-ws.test.ts`:
  1. Start a temporary `Bun.serve` with the generated `appRouter` WS handler in-process.
  2. Create two `createORPCClient(new RPCLink({websocket: new WebSocket(url)}))` clients authenticated as distinct users (reuse `auth.api.createSession` mock or stub `createContext`).
  3. Client A `subscribe({conversationId})`, Client B `sendMessage({conversationId, body:"hi"})`, assert A receives `message` event within 2s.
  4. Assert `rateLimit` fires on 61st rapid message, and `read` event propagates.
  5. Close WS, assert auto-reconnect hook would reconnect (unit test the client wrapper with a mock `WebSocket` that fires `close`).
- **Manual across platforms (highest risk — see Risk):**
  - Web Next: `wscat -c ws://localhost:3000/api/ws` plus browser devtools Application→WebSockets; send `sendMessage` via oRPC devtools, observe other tab live.
  - TanStack: same via `ws://localhost:3000/api/ws` (Nitro).
  - Expo: `expo start --web`, connect phone simulator, watch Metro logs for `WebSocket connected` + Reanimated not breaking.
  - Desktop: `bun run --filter desktop dev`, observe `electron` renderer console WebSocket open.
- **Deploy check:** `ghostinit create` with `deploy=fly` must include `Dockerfile` EXPOSE for WS port if sidecar chosen; `deploy=vercel` must print caveat at generation time (`postCreate` logger warning) and emitted `README.md` must document fallback.

## Risks / Rollback

- **Vercel serverless no WS** — Mitigation: generation emits clear warning when `deploy=vercel && hasMessaging`; include fallback polling `GET /messaging/messages?since=` every 5s when `ws.readyState !== OPEN`, and document Fly/Docker as primary. Rollback: `database` tables remain but WS never connects — REST still works (degraded live).
- **oRPC experimental crossws API churn** — Mitigation: isolate import to one file `packages/api/src/ws.ts` + `packages/realtime/src/adapters.ts`; add adapter abstraction so bumping `orpc` only touches that file. Pin exact `crossws 0.3.4`, `ws 8.18.3` verified via `check:versions`.
- **Next.js App Router upgrade limitation** — Mitigation: sidecar/custom Bun server is opt-in; default REST-only still ships for `database=none` or `messaging=false`. If sidecar proves too invasive, fall back to separate `packages/realtime/src/server.ts` standalone (port 3001) and proxy via `next.config.ts` rewrites.
- **Expo auth via headers impossible** — Mitigation: dual path — server `createContext` checks `request.headers.get("cookie")` first, then `searchParams.get("token")` → `Bearer` validation; document that Expo must store token via `SecureStore` and append to WS URL. Risk: token in URL logged; mitigate by using `Sec-WebSocket-Protocol` if RN supports it (spike will confirm).
- **Multi-instance fan-out loss** — In-memory pub/sub loses messages across replicas. Mitigation: when `cache=redis`, use Upstash Redis `PUBLISH/SUBSCRIBE` (HTTP not ideal for sub; use `Upstash Redis` websocket-like? May need `ioredis` for true pub/sub — spike). If staying with `@upstash/redis` REST, fallback to polling cross-instance is documented limitation.
- **Bundle size** — `ws` is Node-only, should not leak into browser bundle. Ensure `packages/realtime` is server-only import (never imported from `apps/web/src/lib/*` except server routes); client uses browser `WebSocket` global. Enforce via `client-boundary` rule (new check: `use client` must not import `ws`).
- **Scale & backpressure** — unbounded in-memory `Map` grows with conversations. Mitigate: per-topic LRU, heartbeat timeout closes idle sockets after 5m, and limit `limit=50` on history.
- **Rollback:** Feature flagged — `ghostinit sync --check` drift detection will show added files when `hasMessaging` flips; removing the flag and re-running `ghostinit add --dry-run` shows staged deletions. Host rollback is `git revert` on `src/templates/realtime.ts` + siblings; generated projects rollback by deleting `packages/realtime`, `packages/modules/src/messaging`, WS routes, and filtering `messaging` from `appContract`.

## Open Questions — RESOLVED 2026-08-07 (owner feedback applied)

1. **Addon shape:** ✅ **Opt-in for ALL presets** (`presetDefaults.saas.messaging=false`).
2. **Conversation model:** ✅ **DM-only** 1-1, sorted pair unique, no group.
3. **Attachments:** ✅ **In scope v1** — `message_attachments` table, multipart upload, image inline preview on frontend (web/mobile/desktop), file download.
4. **Deploy:** ✅ **Docker primary** — `Bun.serve` upgrade at same port, `docker-compose.yml` volumes for `postgres` + `uploads`; no Vercel WS promise (degraded polling only if ever run on Vercel).
5. **Presence/Typing:** ✅ **Live in v1** — `typing` (debounced) + `presence` (online dot) via WS events; `realtime` publisher tracks presence map + heartbeat.
6. **i18n:** ✅ **Yes when `hasI18n`** — UI strings via `next-intl` `useTranslations('messaging')`, template emits `messaging` namespace JSON; else English hardcoded.
7. **Remaining:** Offline push notifications (`expo-notifications` / Electron `Notification`) — defer to v1.1 unless you want now; leave stub. Attachment storage S3 vs local — local volume for Docker, env switch to S3 if `S3_BUCKET` set (plan covers). Group migration path — keep `conversations` without `type` now, add column + migration if group needed later.

— End —
