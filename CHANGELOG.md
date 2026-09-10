# Changelog

## Unreleased

Audit-driven fixes across host CLI and generated output.

Fixed:

- Billing selection accepts at most one of Stripe, Paddle, or Polar, with
  optional Chargily and manual payments. Parsing, configuration, and generation
  reject multiple global providers; `both` remains the Stripe + Chargily alias.
- Failed frontend reads preserve unknown and cached states across settings,
  workspaces, messaging, and admin views. Arabic payment metadata, localized
  billing statuses and passkey dates, and composed native button labels retain
  readable presentation.
- TanStack auth, RPC, and OpenAPI routes use the framework's catch-all syntax
  in both packaging modes, so nested requests reach their handlers instead of
  falling through to a generic 404. Production E2E now checks nested dispatch.
- RPC and OpenAPI handlers preserve HTTP methods and streaming bodies when
  Next.js wraps Request objects. This fixes body-validation failures under Bun
  and Request brand errors under Node while retaining the streaming body limit.
- Generated PostgreSQL authentication now emits the `rate_limits.id` primary
  key required by Better Auth while keeping each rate-limit bucket key unique.
  Existing projects with populated rate-limit tables need a reviewed database
  migration that backfills unique IDs and preserves bucket keys, counters, and
  timestamps before changing the primary key; the CLI does not migrate database
  rows automatically.
- Cloudflare synchronization preserves registries created by `ghostinit add`,
  including when a later add fails and its transaction rolls back.
- Billing invoice views use provider-aware currency precision across web,
  Expo, and Electron, with the generated native locale contract and shared
  per-app formatting helpers.
- `ghostinit init` now runs the full create pipeline (state.json, checksums,
  install, format). Previously it wrote files without state, leaving
  `add`/`sync`/`check` unable to manage the project. It also refuses non-empty
  directories without `--force`.
- `ghostinit upgrade` now compiles the current desired state and applies a
  hash-gated transactional re-render before updating state. User-owned seed
  edits are preserved and managed-file conflicts stop the operation; use
  `ghostinit upgrade --dry-run` to inspect creates, moves, rewrites, retirements,
  environment migrations, and secret materialization first.
- Generated root `lint` script ran `biome lint .` but biome was never a
  dependency — `bun run lint` failed in every generated project. Now `oxlint .`
  (matching devDeps and the husky pre-commit hook).
- Generated `turbo.json` had no `start` task, so `bun run start` (and the
  Dockerfile CMD) failed. Both apps define `start`; the task is now declared.

Added:

- Manual DZD top-ups for PostgreSQL and Convex, with private PNG/JPEG/PDF
  receipts up to 5 MiB, administrator approval/rejection, and exactly-once ledger
  credit. Configure the generated receiving instructions before accepting money.
- Compatible dependency security repairs during create/install/bootstrap/upgrade,
  plus `ghostinit security audit|fix` and generated `security:audit`/`security:fix`.
  Repairs preserve the seven-day release delay, integrity and patch checks, and
  declared compatibility ranges. Unresolved findings remain visible.
- `--deploy vercel|fly|docker|cloudflare|none` on `create`/`init` (flag, interactive
  prompt, config, status). Docker/fly emit a corrected multi-stage Dockerfile
  (`COPY --parents` for workspace manifests, plain runtime image); vercel emits
  `vercel.json`. Single mode emits the same files. Previously the deploy field
  existed but was unreachable from the CLI.
- `--deploy cloudflare` for monorepo and single web projects. Next.js is
  packaged by OpenNext with Edge `middleware.ts`, R2 incremental cache, a
  Durable Object revalidation queue, and a sharded Durable Object tag cache;
  TanStack Start uses Cloudflare's native
  Vite plugin. Generated Worker commands enforce the Bun/lock contract, use
  gitignored `.dev.vars` only for local execution, reject runtime `.env*` files,
  keep build variables separate from runtime secrets, scan artifacts for
  server-only values, and run a Wrangler dry-run in generated CI. The typed
  support catalog accepts Convex/database-free profiles and rejects PostgreSQL,
  Eve, and server-side PDF until their Workers-native adapters exist.
- Maintenance mode: `MAINTENANCE_MODE` env gate in the generated proxy with
  `?maintenance_bypass=<token>` cookie bypass, plus the previously missing
  `/maintenance` page (locale-scoped when i18n is on).
- Generated test corners: `desktop`, `single-tanstack`, `features`
  (eve+i18n+pdf+messaging+deploy=docker). Integration tests for `init` and
  `upgrade`.

Changed:

- Generated frontend routes and components now follow universal responsibility
  boundaries: feature composition, remote-state adapters, cohesive workflows,
  pure models, and focused views. Architecture/lint checks and contributor/agent
  guidance enforce those boundaries across web, Expo, and Electron. Small local
  UI interactions may retain component state.
- Ordinary `check` remains read-only. Generated lint/typecheck commands remain
  usable independently of GhostInit; agents may not silently weaken safeguards.
- Generated installs now resolve a fresh lock with lifecycle scripts disabled,
  verify every public-registry tuple against npm's canonical SHA-512 integrity
  and seven-day publication cutoff, persist `dependency-lock-evidence.json`,
  then install frozen and run the blocking vulnerability/patch audit. Fresh
  `--no-install` output must run `bun run install:bootstrap`; committed clones
  use `bun run install:verified`. Existing generated projects should sync or
  upgrade, run the bootstrap once, and commit the refreshed lock evidence.
- Frontend pass aligned generated UI with DESIGN.md: shared Button/Input/
  SelectTrigger defaults h-10 → h-9 (sm h-8), admin selects and desktop inputs
  follow; mobile inputs/buttons h-10 → h-11 (44px touch targets); desktop cards
  rounded-xl → rounded-lg; sticky headers are opaque `bg-background` (no
  backdrop-blur); PDF agreement party card uses a full border + leading color
  dot instead of a 4px side-stripe; theme toggle aria-labels de-placeholdered;
  desktop CSP is now injected by the Electron main process from
  `DESKTOP_API_URL` instead of a hardcoded localhost meta tag.
- Generic RBAC role ladder (`superAdmin`/`admin`/`member`/`viewer`) replaces
  the project-specific `universityAdmin`/`deptHead`/`student`/`companyAdmin`.
- `apps/web/server.ts` (messaging WS) resolves the Next app dir from its own
  location — runnable from repo root or `apps/web`.
- Removed the orphaned `schemas/project-config.json` (never read by code,
  still shipped to npm) and dead code in the create path.

## 0.1.0 — 2026-07-13

Initial release.

- CLI with `create`, `status`, `doctor`, `check`, `sync`, and `add` commands
- Golden-path Next.js monorepo generator
- Better Auth, 2FA, and admin scaffolding
- oRPC contract-first API with OpenAPI export
- Deterministic sync, architecture checker, and state/checksum tracking
- oxlint/oxfmt tooling and GitHub Actions CI foundation
