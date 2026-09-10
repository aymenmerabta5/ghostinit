# Cloudflare Workers Deployment

Use `--deploy cloudflare` only for a generated web host. GhostInit resolves the
deployment binding before writing files, so unsupported combinations fail with a
typed validation issue instead of producing a partly deployable project.

## Supported Matrix

| Framework      | Adapter                   | Modes                | Database         | Production cache                                               |
| -------------- | ------------------------- | -------------------- | ---------------- | -------------------------------------------------------------- |
| Next.js        | `@opennextjs/cloudflare`  | `monorepo`, `single` | `convex`, `none` | R2 incremental + Durable Object queue and sharded tag caches   |
| TanStack Start | `@cloudflare/vite-plugin` | `monorepo`, `single` | `convex`, `none` | Framework/Worker response behavior; no OpenNext cache bindings |

The Next.js Worker profile sets `cacheComponents: false` for the verified
Next.js 16.3.3 / OpenNext Cloudflare 1.20.2 (AWS 4.1.0) request-bound rendering
defect. This scoped compatibility setting preserves the application Redis cache
and OpenNext R2/Durable Object bindings. Other deployment targets retain Cache
Components. Follow the generated deployment guide before re-enabling it.

The resolver rejects:

- PostgreSQL, until the generated database package has a request-scoped
  Hyperdrive adapter;
- Eve, until a Workers-native agent runtime replaces its persistent Node.js
  sidecar;
- server-side PDF, until admission/concurrency control is shared rather than
  process-local.

Convex-native messaging, jobs, and storage remain valid Worker choices. Billing
still requires a database, so use Convex when billing is selected.

## Create and Install

```bash
# Next.js + Convex
ghostinit create my-worker --framework nextjs --database convex \
  --billing stripe --with-i18n --deploy cloudflare --yes --no-install

# TanStack Start, database-free frontend
ghostinit create my-frontend --preset frontend --framework tanstack-start \
  --database none --deploy cloudflare --yes --no-install

cd my-worker
bun run install:bootstrap # Bun 1.4.0; resolves, attests, then installs the fresh lock
```

Generated monorepos expose the commands at the root and delegate to `apps/web`.
Single-mode projects run them directly.

## Environment Boundary

- `.env.example` documents the selected variables and may be committed.
- `.dev.vars` is generated for local values and is gitignored. In a monorepo,
  Worker commands load `apps/web/.dev.vars`; root tooling also receives a root
  `.dev.vars` copy.
- `bun run dev` and `bun run preview` load `.dev.vars`. Production
  `build:worker`, `cloudflare:dry-run`, and `deploy` do not implicitly load it.
- The ordinary `build` command delegates to `build:worker`; `start` delegates to
  the vetted local Worker preview and never launches a raw framework server.
- Do not create `.env`, `.env.local`, `.env.production`, or another runtime
  `.env*` file in the workspace/app root. The Worker wrapper rejects those files
  because framework builds can serialize their values into the artifact.
  Documentation-only `.env[.*].example` and `.env[.*].template` variants are
  allowed but never loaded as runtime authority.
- Worker and Convex wrappers serialize mirror access with the ignored
  `.dev.vars.ghostinit-build-lock`; before removing a retained lock, verify that
  its wrapper, recorded child PID, and entire process group/tree have stopped.
  Dev/preview forwards handled signals and verifies child-tree termination
  before unlocking. Windows forced termination and POSIX SIGKILL bypass those
  handlers, so a stopped wrapper alone does not establish that its children
  stopped. Convex also records a separate ignored
  `.dev.vars.ghostinit-process-recovery-*` marker during child cleanup. A
  retained marker blocks both wrappers; remove it only after verifying its
  recorded process tree stopped. It never replaces a concurrent application's
  environment lock. For two-terminal Convex development, start
  `bun run convex:dev` first, wait for startup, and then run `bun run dev`.
  Convex 1.45 transiently writes `.env.local`; the wrapper validates and removes
  it before releasing the app-runtime lock. The reverse order is refused rather
  than exposing that file to Next/Vite. A hard-killed wrapper may leave an
  ignored `.dev.vars.ghostinit-convex-*` selector input; confirm the Convex child
  stopped before removing that specific file.
- Pass values required by static generation explicitly through the production
  build environment (Workers Builds variables/secrets). Generated CI uses only
  credential-free synthetic values scoped to its Worker-backed build step; never
  reuse them in production. Configure runtime values and secrets separately
  with the Workers dashboard or `wrangler secret put`.
- Production build, dry-run, deploy, and upload require explicit `SITE_URL`
  and framework app URL values that name the same non-loopback HTTPS origin.
  Local development and preview may keep loopback values.
- `deploy` uses `--keep-vars`; an empty local `vars` object therefore cannot
  delete dashboard-managed runtime configuration.

Convex function environment is deployment-scoped and separate from
`.dev.vars`. For each development and production deployment, use Convex
Deployment Settings or secret-safe interactive/stdin
`bun --env-file=.dev.vars x --no-install convex env set NAME`
(never a secret value in argv). Auth needs the same `BETTER_AUTH_SECRET`,
`SITE_URL`, `BETTER_AUTH_URL`, and `CONVEX_SITE_URL`; selected OAuth/email
features add their own variables. Notifications also require the same
self-issued `NOTIFICATION_TOKEN_ENCRYPTION_KEY` wherever Worker and Convex
consume it. The billing bridge reuses the auth secret,
while provider credentials remain Worker runtime values unless a Convex
function explicitly consumes them. Run
`bun --env-file=.dev.vars x --no-install convex env list` and its explicit
`--prod` form against both intended deployments before release.
Every non-local production `BETTER_AUTH_URL` also requires
`TRUSTED_PROXY=true` in the target Convex deployment environment, not as a
Worker build variable. Cloudflare generation emits an explicit trusted-runtime
policy: non-loopback Worker auth requires one valid `CF-Connecting-IP` and
replaces `X-Forwarded-For` before `@convex-dev/better-auth`; HTTP loopback
development/preview uses a fixed `127.0.0.1`. Non-Cloudflare output never trusts
Cloudflare headers or an attached `cf` property. Direct Convex ingress is
separate.

After each build, the wrapper recursively scans the bounded Worker artifact for
non-public secret-like process values. A match fails with the environment key
and artifact path, never the value itself. This guard complements Cloudflare
secret configuration; it is not a substitute for rotating an exposed secret.

## Commands

```bash
bun run cf-typegen          # regenerate CloudflareEnv from Wrangler bindings
bun run dev                 # framework dev server with .dev.vars
bun run build               # same audited path as build:worker
bun run build:worker        # adapter build + artifact secret scan
bun run cloudflare:dry-run  # build/scan + wrangler deploy --dry-run
bun run preview             # local Workers preview with .dev.vars
bun run start               # alias for vetted local Worker preview
bun run deploy              # production deploy, preserving dashboard vars
```

Next.js app packages additionally expose OpenNext's upload-only workflow: use
`bun run upload` in single mode or `bun --cwd apps/web run upload` in a
monorepo. Run `cf-typegen` after adding or changing any Wrangler resource.

## Next.js R2 and Durable Object Provisioning

The generated `open-next.config.ts` selects OpenNext's R2 incremental cache,
Durable Object queue, and sharded Durable Object tag cache. `wrangler.jsonc`
owns the matching contract:

- `NEXT_INC_CACHE_R2_BUCKET` -> the generated `<worker>-cache` R2 bucket;
- `NEXT_CACHE_DO_QUEUE` -> `DOQueueHandler`;
- `NEXT_TAG_CACHE_DO_SHARDED` -> `DOShardedTagCache`;
- immutable migration `v1` owns `DOQueueHandler` and additive migration `v2`
  owns `DOShardedTagCache`.

Create the exact `bucket_name` from `wrangler.jsonc` once before the first
deploy:

```bash
# monorepo
bun --cwd=apps/web x --no-install wrangler r2 bucket create <bucket_name>

# single mode
bun x --no-install wrangler r2 bucket create <bucket_name>
```

The first deployment applies the Durable Object migration; do not manually
invent a second class or binding. Treat bucket and migration renames as stateful
infrastructure changes, not cosmetic config edits.

## Release Evidence

The repository's `bun run test:workers` gate generates eight real projects:

- `cloudflare-next-monorepo`, `cloudflare-next-monorepo-stripe`, and
  `cloudflare-next-monorepo-polar`: web + Expo + Electron with Convex, each
  selecting one global provider plus Chargily/manual, i18n, messaging/storage,
  notifications, feature flags, jobs and Redis cache. The unsuffixed corner selects Paddle.
- `cloudflare-next-single`: database-free API profile.
- `cloudflare-tanstack-monorepo`, `cloudflare-tanstack-monorepo-stripe`, and
  `cloudflare-tanstack-monorepo-polar`: the same capability families with TanStack
  Start, again selecting one global provider plus Chargily/manual. The unsuffixed
  corner selects Paddle.
- `cloudflare-tanstack-single`: database-free API profile.

Each must install and audit, format, pass architecture/type/lint/tests, run the
conventional root build (including selected native artifacts), secret-scan,
scan the Expo output plus Electron renderer/main/preload bundles for server-only values,
pass a Wrangler dry run, and serve HTTP 200 for `/` and
`/api/health` and `/api/rpc/health` under a bounded generated preview process in
every layout. Health responses, preview-port ownership, production CSP, and
same-origin redirects are validated. The monorepos select Bun and the single
projects select Node, exercising both advertised execution-runtime choices.
The provider-specific monorepos also POST empty webhook bodies and require safe 4xx
responses (never 500), then require a privileged auth route to return 404 before
remote Convex access.
Those negative-path probes prove route loading and safe rejection only; they do
not claim successful provider/account staging integration.
The independent sentinel scan checks Wrangler's app-level
`.wrangler/ghostinit-dry-run` upload bundle rather than only intermediate
framework output. `bun run test:generated -- --all` includes the same Worker
corners and remains the release-blocking gate.

The gate does not upload to a Cloudflare account. Before calling an application
live, use a protected staging account to provision bindings, configure build
and runtime values, deploy, and verify routes plus stateful cache behavior.

## Upstream References

- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [OpenNext caching](https://opennext.js.org/cloudflare/caching)
- [OpenNext environment variables](https://opennext.js.org/cloudflare/howtos/env-vars)
- [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [Next.js Ecosystem Working Group](https://nextjs.org/ecosystem-working-group)
