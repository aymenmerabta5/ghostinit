# Cloudflare Workers Engineering Contract

## Decision

GhostInit exposes `cloudflare` as a typed deployment target for web applications:

- Next.js is compiled with `@opennextjs/cloudflare`.
- TanStack Start uses the native `@cloudflare/vite-plugin`.

Cloudflare currently recommends the beta vinext path for many newly migrated
applications. GhostInit deliberately retains OpenNext for its generated Next.js
surface and treats the adapter as supported only while the pinned compatibility
and real Worker gates below remain green; this is not a blanket claim about
every Next.js application.

OpenNext participation in the
[Next.js Ecosystem Working Group](https://nextjs.org/ecosystem-working-group)
provides a collaboration and compatibility channel; it is not a claim that the
adapter is part of Next.js core or that every Node.js package works on Workers.
GhostInit keeps the support boundary closed and backs advertised profiles with
installed Worker gates.

## Closed Support Matrix

| Framework      | Mode               | Database   | Supported | Notes                                                                               |
| -------------- | ------------------ | ---------- | --------- | ----------------------------------------------------------------------------------- |
| Next.js        | monorepo or single | Convex     | yes       | OpenNext; R2 incremental cache plus DO revalidation and tag caches                  |
| Next.js        | monorepo or single | none       | yes       | OpenNext, database-free                                                             |
| TanStack Start | monorepo or single | Convex     | yes       | Native Cloudflare Vite Worker                                                       |
| TanStack Start | monorepo or single | none       | yes       | Native Cloudflare Vite Worker, database-free                                        |
| either         | either             | PostgreSQL | no        | Generated adapter is process-oriented; request-scoped Hyperdrive is not implemented |

The resolver also rejects Eve and server-side PDF on Cloudflare. Eve currently
needs a persistent Node.js sidecar. PDF admission/concurrency state is
process-local and cannot enforce the production limit across isolates. Convex
owns its native messaging, jobs, and storage primitives, so those combinations
remain within the supported Worker boundary. Billing requires Convex because
billing cannot be paired with `database=none`.

Validation happens in the support catalog and project resolver before template
compilation. A rejected combination produces a typed issue and no partial
project. Generated Cloudflare artifacts participate in normal
`GenerationPlan` owner, lifecycle, dependency, checksum, and provenance rules.

## Framework Integration

### Next.js / OpenNext

- `open-next.config.ts` selects `r2IncrementalCache`, `doQueue`, and the
  sharded Durable Object tag cache with a reviewed base shard size.
- `wrangler.jsonc` points at `.open-next/worker.js` and
  `.open-next/assets`.
- The Worker uses `nodejs_compat` and `global_fetch_strictly_public` at the
  pinned compatibility date.
- Cloudflare output emits Edge `middleware.ts`, not Next 16's Node-only
  `proxy.ts`; emitting both would create ambiguous routing and OpenNext rejects
  the Node proxy convention.
- `next.config.ts` initializes the OpenNext development adapter.
- The Cloudflare Next profile emits `cacheComponents: false`. Next.js `16.3.3`
  with OpenNext Cloudflare `1.20.2` / AWS packager `4.1.0` reproducibly hangs on
  request-bound Suspense under workerd. Repeated installed controls complete the
  same page responses when this optional setting is disabled. The resolver's
  deployment selection scopes the setting to Cloudflare; other targets and the
  application `--cache redis` capability keep their existing behavior.

OpenNext generally supports SSR, PPR, and composable caching. This setting
addresses the reproduced pinned-version defect, rather than a general lack of
support. The [upstream reproduction](https://github.com/opennextjs/opennextjs-cloudflare/issues/1225#issuecomment-5327479166)
and [proposed scheduler correction](https://github.com/opennextjs/opennextjs-cloudflare/pull/1318)
track the affected request-bound behavior. Re-enable Cache Components only after
the installed Worker gate proves those routes on the replacement stack. The
declared OpenNext R2 and Durable Object cache bindings remain configured.

### TanStack Start / native Vite

- `vite.config.ts` loads `cloudflare({ viteEnvironment: { name: "ssr" } })`
  and `vite-tsconfig-paths`.
- The Cloudflare profile does not retain the Nitro adapter.
- `src/cloudflare-worker.ts` wraps the TanStack server entry and applies the
  generated security-header policy. Convex profiles retain the required HTTPS
  and WSS CSP origins; generated Google font sources remain allowed.

Both profiles emit an operational `/api/health` route and `cf-typegen`,
`build:worker`, `preview`, `cloudflare:dry-run`, and `deploy` scripts. The
conventional `build` delegates to the same audited Worker wrapper, while `start`
delegates to local Worker preview rather than starting a raw Node/Vite server.
Next app packages also expose OpenNext's upload-only path and keep the raw Next
build in a private adapter command invoked only inside the sanitized wrapper.
For a monorepo that also selects Expo or Electron, the root `dev` covers every
selected app and the conventional root `build` produces the audited Worker
before the native artifacts. The native phase admits only public platform
variables; explicit CI/shell values take precedence over local `.dev.vars`.

## Environment and Secret Boundary

OpenNext/framework builds may inline environment values. GhostInit therefore
uses a stricter boundary than its non-Worker profiles:

1. `.env.example` is documentation and may be committed.
2. Generated local values live in synchronized, gitignored root and web
   `.dev.vars` files for monorepos (one root file in single mode).
3. Only local `dev` and `preview` scripts load `.dev.vars` automatically.
4. The Worker build wrapper rejects `.env`, `.env.local`, `.env.production`, and
   every other runtime `.env*` file at the workspace/app root before building.
   Documentation-only `.env[.*].example` and `.env[.*].template` files remain
   allowed and are never loaded as runtime authority.
5. The wrapper temporarily hides `.dev.vars` while the adapter builds, restores
   it before local preview, and supplies only an allowlisted build environment.
   Worker and Convex wrappers serialize mirror access through the ignored
   `.dev.vars.ghostinit-build-lock`; hard-kill recovery is explicit so one
   process can never adopt another live process's hidden values. Dev/preview
   forwards handled signals and verifies child-tree termination before unlocking.
   Windows forced termination and POSIX SIGKILL bypass handlers; before removing
   a retained lock, verify its wrapper, recorded child PID, and entire process
   group/tree have stopped. Convex uses a separate ignored
   `.dev.vars.ghostinit-process-recovery-*` marker during child cleanup; any
   retained marker blocks both wrappers until explicit verified recovery and
   never replaces a concurrent application wrapper's lock.
6. Generated CI supplies exact, credential-free synthetic values only on the
   Worker-backed build step; install, lock audit, vulnerability audit, lint, and test
   steps receive no project secrets. Production static-generation values are
   configured separately through Workers Builds variables/secrets.
7. Runtime variables and secrets are configured separately through Worker
   bindings, the dashboard, or `wrangler secret put`.
8. `deploy` uses `--keep-vars` so an empty checked-in `vars` object cannot erase
   dashboard-managed plaintext variables. Resource bindings remain declared in
   `wrangler.jsonc`; encrypted secrets are managed separately.

Production `build`, `cloudflare:dry-run`, `deploy`, and OpenNext `upload`
require explicit `SITE_URL` plus the framework's `NEXT_PUBLIC_APP_URL` or
`VITE_APP_URL`. Both must name the same non-loopback HTTPS origin without
credentials, a path, query, or fragment. Local `dev` and `preview` may retain
the generated loopback values. Publication also runs `audit:dependencies` so
the installed reviewed OpenNext patch and HIGH/CRITICAL advisory policy cannot
be bypassed after lock attestation.

For Convex projects, `.dev.vars` selects and configures local Worker tooling;
it does **not** set `process.env` inside Convex functions. Configure development
and production Convex deployments separately through Deployment Settings or
secret-safe `bun --env-file=.dev.vars x --no-install convex env set NAME`
interactive/stdin input (never put a secret value in argv). Generated auth requires the same `BETTER_AUTH_SECRET`,
`SITE_URL`, `BETTER_AUTH_URL`, and `CONVEX_SITE_URL` as its matching Worker;
optional OAuth adds its client IDs/secrets and email actions add
`RESEND_API_KEY`/`EMAIL_FROM`. Notifications add
`NOTIFICATION_TOKEN_ENCRYPTION_KEY`, using the same self-issued value wherever
the Worker and Convex functions both consume it. The billing bridge reuses
`BETTER_AUTH_SECRET`; provider credentials remain Worker runtime values unless
a Convex function explicitly consumes them. Verify both targets with
`bun --env-file=.dev.vars x --no-install convex env list` and its explicit
`--prod` form before release; doctor reports this as a manual remote check.
For two-terminal local development, start `bun run convex:dev` first and wait
for its startup configuration to settle, then start `bun run dev`. Convex 1.45
transiently writes `.env.local`; the wrapper validates and removes that file
before releasing the Worker-runtime lock. Starting Convex after the app runtime
is intentionally refused so Next/Vite can never observe the transient file.
The wrapper's unique `.dev.vars.ghostinit-convex-*` input contains Convex
selectors only and is removed after the supervised Convex child exits. After a
hard kill, confirm that child has stopped before explicitly removing a stale
temporary input.
Every non-local production `BETTER_AUTH_URL` also requires
`TRUSTED_PROXY=true` in the target Convex deployment environment, not as a
Worker build variable. Cloudflare generation emits an explicit trusted-runtime
policy: non-loopback Worker auth requires one valid `CF-Connecting-IP` and
replaces `X-Forwarded-For` before `@convex-dev/better-auth`; HTTP loopback
development/preview uses a fixed `127.0.0.1`. Non-Cloudflare output never trusts
Cloudflare headers or an attached `cf` property. Direct Convex ingress is
separate.

The wrapper gathers only non-public, secret-like environment values of a
minimum length, recursively scans a bounded regular-file artifact, rejects
symbolic links and oversized files, and reports only the owning key and relative
path. It never prints the matched value. Public prefixes and publishable values
are excluded from this sentinel. This is a release guard, not a secret-rotation
mechanism.

The build also enforces Bun `1.4.0` and a verified regular root `bun.lock`.
Generated CI audits the committed lock evidence before frozen installation;
fresh `--no-install` output uses `bun run install:bootstrap` to resolve with
lifecycle scripts disabled, compare npm publication age and canonical SHA-512
integrity, persist `dependency-lock-evidence.json`, then install frozen.

## Stateful OpenNext Cache

The production Next profile declares:

- R2 binding `NEXT_INC_CACHE_R2_BUCKET` with generated bucket name
  `<worker>-cache`;
- Durable Object binding `NEXT_CACHE_DO_QUEUE` to `DOQueueHandler`;
- sharded tag-cache binding `NEXT_TAG_CACHE_DO_SHARDED` to
  `DOShardedTagCache`, used by `revalidatePath` and `revalidateTag`;
- immutable migration tag `v1` with `DOQueueHandler` in
  `new_sqlite_classes`;
- additive migration tag `v2` with `DOShardedTagCache` in
  `new_sqlite_classes`.

The operator creates the exact R2 `bucket_name` in `wrangler.jsonc` once before
the first deploy. The deployment applies the Durable Object migration. Bucket,
binding, class, and migration renames are state migrations and require an
explicit rollout plan.

## Dependency Snapshot

`evidence/compatibility/dependency-versions.json` records these catalog pins
against the repository's `2026-08-25T16:22:25.760Z` age cutoff:

| Package                   | Pin       | Pin published              | Registry latest at audit               | Status relative to cutoff |
| ------------------------- | --------- | -------------------------- | -------------------------------------- | ------------------------- |
| `@opennextjs/cloudflare`  | `1.20.2`  | `2026-07-21T17:40:56.024Z` | `1.20.5` (`2026-08-31T17:54:38.975Z`)  | latest eligible           |
| `@opennextjs/aws`         | `4.1.0`   | `2026-07-21T16:49:44.076Z` | `4.1.4` (`2026-09-01T09:05:17.143Z`)   | latest eligible           |
| `@cloudflare/vite-plugin` | `1.53.1`  | `2026-08-20T17:47:13.645Z` | `1.54.2` (`2026-08-28T14:56:59.680Z`)  | latest eligible           |
| `dotenv`                  | `17.4.2`  | `2026-04-12T16:41:11.574Z` | `17.4.2` (`2026-04-12T16:41:11.574Z`)  | latest eligible           |
| `wrangler`                | `4.125.0` | `2026-08-20T17:39:00.731Z` | `4.127.1` (`2026-08-28T14:52:53.481Z`) | latest eligible           |
| `vite-tsconfig-paths`     | `6.1.1`   | `2026-02-11T23:26:08.179Z` | `6.1.1` (`2026-02-11T23:26:08.179Z`)   | latest eligible           |

The newer registry releases shown after the cutoff were not age-eligible for
this snapshot. They are not compatibility holds.

OpenNext's transitive AWS packager has a reviewed Windows directory-link patch
because its untyped copied symlinks become unreadable file links on Windows.
The generated manifest and lock bind the exact patch, `.gitattributes` fixes LF
line endings, and `audit:dependencies` verifies the patch digest, installed
package version, and patched file digest before vulnerability auditing.

## Blocking Evidence

`bun run test:workers` selects four installed generated-project corners:

1. `cloudflare-next-monorepo`: web, Expo, and Electron with Convex, all four
   billing providers, i18n, messaging, notifications, feature flags, jobs, and
   Redis-backed rate limiting/cache;
2. `cloudflare-next-single`: database-free API profile;
3. `cloudflare-tanstack-monorepo`: web, Expo, and Electron with Convex and the
   same all-provider billing, i18n, messaging, notifications, feature flags, jobs,
   and Redis cache surface;
4. `cloudflare-tanstack-single`: database-free API profile.

The monorepo profiles explicitly select Bun and the single profiles explicitly
select Node, so both advertised generated execution-runtime choices cross the
Worker boundary. The permanent Windows/macOS portability job runs both single
adapters; Ubuntu CI runs all four profiles.

Each corner must complete the normal install, high-severity dependency audit,
format, architecture, typecheck, lint, and test sequence, followed by:

- conventional root build, including selected native sibling artifacts;
- wrapper artifact secret scan;
- bounded sentinel scans of Expo `dist`, Electron renderer output, and the
  Electron main/preload bundles for every server-only probe value;
- an independent sentinel artifact scan in the gate (for TanStack, against the
  app-level `.wrangler/ghostinit-dry-run` upload bundle, not only intermediate
  Vite `dist` output);
- `wrangler deploy --dry-run`;
- bounded local generated-preview requests returning HTTP 200 for `/`,
  `/api/health`, and `/api/rpc/health` in every layout, with the health payload
  and same-origin preview ownership verified;
- empty-body POST probes across all four generated billing webhooks returning
  each route's exact configured-safe HTTP 400 body, with Worker security headers
  intact, plus a privileged auth-route probe returning the boundary's exact 404
  body and private/no-store header before remote Convex access;
- verified descendant-process and temporary-workspace cleanup.

The webhook/auth probes reject generic 4xx/404 pages: exact provider-specific
bodies prove that the intended chunks loaded in workerd, while exact security
and cache headers prove that the Worker wrapper and privileged auth boundary ran.
They do not claim successful provider, account, or remote Convex staging
integration.

Focused unit coverage lives in
`tests/unit/cloudflare-support-contract.test.ts` and
`tests/unit/cloudflare-workers-generation.test.ts`, with runner response
strictness covered by `tests/unit/generated-worker-runner-security.test.ts`.
Dependency evidence is schema-checked by
`tests/unit/dependency-version-evidence.test.ts` and verified against the
registry by `bun run check:versions`.

No focused result replaces the full release sequence. Cloudflare support is
release-ready only when `bun run test:generated -- --all`, the complete CI gate,
the packed release-artifact contract, and every GitHub check pass on the same
final tree.

These gates are credential-free and do not upload to an operator account. A
live staging/production claim additionally requires account-side R2/DO
provisioning, separate build/runtime configuration, deployment, and post-deploy
route/cache checks; see the
[external readiness contract](./EXTERNAL_READINESS.md#release-interpretation).

## Upstream References

- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [OpenNext caching](https://opennext.js.org/cloudflare/caching)
- [OpenNext environment-variable guidance](https://opennext.js.org/cloudflare/howtos/env-vars)
- [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

### TanStack preview binding delivery

The pinned Vite adapter reads local bindings relative to the built Wrangler config. GhostInit keeps runtime values out of build artifacts by installing temporary `secrets.required` name metadata only after build and artifact scanning, using the same immutable local entry snapshot as the preview subprocess environment. The output config keeps all existing fields; a `vars` key or existing required-secret name absent from that snapshot is rejected to prevent ambient host variables from entering the Worker. Empty local values remain present.

Preview config originals are retained by inode in a private `.dev.vars.ghostinit-process-recovery-preview-*` recovery directory. Restoration requires verified descendant cleanup, lease ownership, unchanged parent/file identities, and original bytes. Atomic create-if-absent publication preserves racing replacements. Uncertain cleanup or restoration retains the environment lock and recovery data and blocks later wrappers. No runtime secret files are copied into `dist`; deployment requirements are unchanged.

See [Cloudflare secrets configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property) for the supported binding-name metadata.
