# Changelog

## Unreleased

Audit-driven fixes across host CLI and generated output.

Fixed:

- `ghostinit init` now runs the full create pipeline (state.json, checksums,
  install, format). Previously it wrote files without state, leaving
  `add`/`sync`/`check` unable to manage the project. It also refuses non-empty
  directories without `--force`.
- `ghostinit upgrade` is now honest and useful: rebuilds registries, repairs
  turbo.json globalEnv from the env manifest, stamps the CLI version into
  state, and states explicitly that templates are not re-rendered.
- Generated root `lint` script ran `biome lint .` but biome was never a
  dependency — `bun run lint` failed in every generated project. Now `oxlint .`
  (matching devDeps and the husky pre-commit hook).
- Generated `turbo.json` had no `start` task, so `bun run start` (and the
  Dockerfile CMD) failed. Both apps define `start`; the task is now declared.

Added:

- `--deploy vercel|fly|docker|cloudflare|none` on `create`/`init` (flag, interactive
  prompt, config, status). Docker/fly emit a corrected multi-stage Dockerfile
  (`COPY --parents` for workspace manifests, plain runtime image); vercel emits
  `vercel.json`. Single mode emits the same files. Previously the deploy field
  existed but was unreachable from the CLI.
- Cloudflare Workers deployment through the native TanStack Start
  `@cloudflare/vite-plugin` and Next.js OpenNext adapter, with Wrangler scripts/config, security-header preservation, typed
  compatibility rejection, and generated Worker build/dry-run coverage.
- Maintenance mode: `MAINTENANCE_MODE` env gate in the generated proxy with
  `?maintenance_bypass=<token>` cookie bypass, plus the previously missing
  `/maintenance` page (locale-scoped when i18n is on).
- Generated test corners: `desktop`, `single-tanstack`, `features`
  (eve+i18n+pdf+messaging+deploy=docker). Integration tests for `init` and
  `upgrade`.

Changed:

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
