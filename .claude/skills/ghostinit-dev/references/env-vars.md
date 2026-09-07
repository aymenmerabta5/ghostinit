# Env Vars — 5-Place Rule Dev Deep Dive

## Rule

New env var → MUST update same PR in 5 places else broken generation or Turbo cache poisoned.

1. `src/lib/env-manifest.ts` `ENV_PLACEHOLDERS` and environment key catalog; `constants.ts` re-exports them.
2. `src/templates/shared/env/` builders — `billing.ts`, `core.ts`, `builders.ts` — emit example + local values for selected capabilities/app audiences; keep the corresponding config runtime schemas in sync.
3. `src/templates/root/turbo.ts` `turbo()` — manifest-derived `globalEnv`, filtered to selected capabilities/apps.
4. Root `turbo.json` `globalEnv` host CI host-level.
5. Docs: `AGENTS.md` environment contract + `skills/ghostinit-use/references/workflows.md` or `billing.md` or `frameworks.md` if user-visible + `CONTRIBUTING.md` if how-to affected.

## 1. `src/lib/env-manifest.ts` `ENV_PLACEHOLDERS`

```ts
export const ENV_PLACEHOLDERS = {
  BETTER_AUTH_SECRET: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
  POSTGRES_PASSWORD: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
  RESEND_API_KEY: "REPLACE_WITH_RESEND_API_KEY",
  STRIPE_SECRET_KEY: "REPLACE_WITH_STRIPE_SECRET_KEY",
  STRIPE_WEBHOOK_SECRET: "REPLACE_WITH_STRIPE_WEBHOOK_SECRET",
  STRIPE_PUBLISHABLE: "pk_test_REPLACE",
  CHARGILY_API_KEY: "REPLACE_WITH_CHARGILY_API_KEY",
  CHARGILY_SECRET: "REPLACE_WITH_CHARGILY_SECRET_KEY",
  PADDLE_API_KEY: "REPLACE_WITH_PADDLE_API_KEY",
  PADDLE_WEBHOOK_SECRET: "REPLACE_WITH_PADDLE_WEBHOOK_SECRET",
  PADDLE_CLIENT_TOKEN: "pdl_ntf_REPLACE",
  POLAR_ACCESS_TOKEN: "REPLACE_WITH_POLAR_ACCESS_TOKEN",
  POLAR_WEBHOOK_SECRET: "REPLACE_WITH_POLAR_WEBHOOK_SECRET",
  POLAR_ORG_ID: "REPLACE_WITH_POLAR_ORG_ID",
  POSTHOG_KEY: "phc_REPLACE_WITH_POSTHOG_KEY",
  UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
  UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
  // add new here:
  MYNEW_API_KEY: "REPLACE_WITH_MYNEW_API_KEY",
  GOOGLE_CLIENT_ID: "REPLACE_WITH_GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "REPLACE_WITH_GOOGLE_CLIENT_SECRET",
  GITHUB_CLIENT_ID: "REPLACE_WITH_GITHUB_CLIENT_ID",
  GITHUB_CLIENT_SECRET: "REPLACE_WITH_GITHUB_CLIENT_SECRET",
} as const;
```

## 2. `src/templates/shared/env/` Builders

Split from 449 LOC god file into:

- `billing.ts`: `billingEnvLines(selected)`, `billingEnvLocalLines(secrets, selected)`, `billingEnvLocalLinesFiltered(secrets, selected)`
  - `billingEnvLines` when `selected.length===0` → commented placeholders example + note add via ghostinit add billing. When selected → selected-only with placeholder values from ENV_PLACEHOLDERS + blank line separators.
  - `billingEnvLocalLines` uses explicitly supplied `RootSecrets` vendor values or the same credential placeholders as `.env.example`. It never mints provider keys or webhook secrets. This compatibility helper emits all providers when the selection is empty; production composition uses the filtered helper.
  - `billingEnvLocalLinesFiltered` filtered only selected + message when none.

- `core.ts`: `coreEnvExampleLines`, `coreEnvLocalLines`, `resendExampleLines`, `resendLocalLines`
  - Core: database configuration, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_NAME`, audience-selected `APP_URL`/`API_URL` public values, `TRUSTED_PROXY`, `MAINTENANCE_MODE` + `MAINTENANCE_BYPASS_TOKEN` (proxy maintenance gate), `POSTGRES_*`, `DATABASE_SSL`, etc. Only self-issued secrets are generated; vendor credentials stay placeholders until supplied.
  - Resend: `RESEND_API_KEY`, `EMAIL_FROM`.
  - Upstash: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` via `cacheEnvExampleLines()`/`cacheEnvLocalLines()` in `builders.ts` — required by the optional cache package and by production API mutation rate limiting for auth+transport; placeholders are normalized away by cache-off config schemas and allow only the bounded development/test limiter fallback. Capability sanitization removes the pair when neither owner is selected.

- `builders.ts`: `envExampleContent(projectName,secrets,selectedBilling,hasEve,hasI18n,runtime)`, `envLocalContent(...)`, `envPlaceholderContent()`, `filteredEnvExample(projectName,secrets,selectedBilling,...)` which `root-composer.ts` uses to replace raw .env.example file, `filteredEnvLocal`.

Pattern for new billing var:

```ts
// billing.ts billingEnvLines
if (has("myprovider")) {
  out.push("# MyProvider");
  out.push(`MYPROVIDER_API_KEY=${ENV_PLACEHOLDERS.MYPROVIDER_API_KEY}`);
  out.push(`MYPROVIDER_WEBHOOK_SECRET=${ENV_PLACEHOLDERS.MYPROVIDER_WEBHOOK_SECRET}`);
  out.push("");
}
```

Pattern for new core var (e.g., `MYCORE_URL`):

```ts
// core.ts coreEnvExampleLines
out.push(`MYCORE_URL=http://localhost:3001`); // or placeholder if secret
// coreEnvLocalLines
out.push(`MYCORE_URL=${secrets.myCoreUrl ?? "http://localhost:3001"}`);
```

Select public prefixes from the project's app audiences:

```ts
// import publicVarLines and the EnvAudience type from shared/env/core.ts
out.push(
  ...publicVarLines(audience, "STRIPE_PUBLISHABLE_KEY", ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE),
);
```

`EnvAudience` chooses `NEXT_PUBLIC_*` for Next web, `VITE_*` for TanStack web or desktop renderers, and `EXPO_PUBLIC_*` for Expo. Next+Expo emits two families; Next+Expo+desktop emits all three. Unselected audiences emit no variables. The `@repo/config/next`, `/vite`, and `/expo` runtimes each validate only their own prefix; `/server` owns secrets, and the root barrel exports no env values. Single mode mirrors those entries under `src/lib/env/`.

Server-only secrets never enter public prefixes: `*_SECRET_KEY`, `*_API_KEY`, `*_WEBHOOK_SECRET`, `*_ACCESS_TOKEN`, `DATABASE_URL`, `BETTER_AUTH_SECRET`.

### Cloudflare Worker environment boundary

The manifest still owns the selected keys, but `--deploy cloudflare` replaces
runtime `.env.local` output with gitignored `.dev.vars` at the root and web-app
locations. Local `dev`/`preview` commands may load `.dev.vars`; production
`build:worker`, dry-run, upload, and deploy must receive build-time values
explicitly and must not load that file implicitly.

The generated wrapper fails before building if a runtime `.env*` file (other
than `.env.example`) exists at the workspace or app root. This is intentionally
stricter than ordinary framework behavior because build adapters can serialize
environment values. After OpenNext/Vite builds, it scans the bounded artifact
for non-public secret-like process values and reports only the key/path on a
match. Runtime Worker secrets belong in Cloudflare bindings via the dashboard or
`wrangler secret put`; values required during static generation belong in
Workers Builds variables/secrets. They are separate stores and must be
configured separately. `wrangler.jsonc` must never contain a secret value, and
deploy must keep `--keep-vars` so dashboard state is not erased.

## 3. Generated `turbo.json`

`src/templates/root/turbo.ts` calls `getGlobalEnvKeys(runtime, audience)` from
`src/lib/env-manifest.ts`. The resolved compiler then filters those keys through
`src/generation/capability-environment-sanitizer.ts`, using the selected
capabilities and app targets. Extend the manifest and ownership rules instead
of copying a hardcoded `globalEnv` array into a template.

The base template includes local env files in `globalDependencies` and keeps
build outputs separate from persistent, uncached dev/start tasks. Cloudflare
normalization adds its own Worker artifact and `.dev.vars` handling. Inspect
the generated profile when changing these inputs; an unused public family or
disabled capability must not reappear through a manual key list.

For a new public key, keep its audience runtime schema, runtime env mapping,
shared env emitter, and manifest entry aligned. For server credentials, keep
explicit keys rather than public-prefix wildcards. After updating the manifest,
run `bun run scripts/sync-turbo-env.ts` to synchronize the host config.

## 4. Root `turbo.json` Host

The host repository keeps its own exhaustive environment manifest because its checks are capability-independent. Generated projects derive an exact subset for the resolved capability and app audiences; do not compare them by raw key count.

Location `turbo.json` root.

## 5. Docs Sync

- `AGENTS.md` environment table documents the exhaustive manifest contract and five synchronized locations.
- `skills/ghostinit-use/references/workflows.md` troubleshooting billing vars + turbo cache poisoned note.
- `skills/ghostinit-use/references/billing.md` env vars needed list.
- `CONTRIBUTING.md` if how-to add package section.

## Verification Commands

After adding var:

```bash
bun run build
mkdir /tmp/gi-test && rm -rf /tmp/gi-test/demo && bunx ghostinit create demo --billing stripe,chargily --yes --no-install --cwd /tmp/gi-test
cat /tmp/gi-test/demo/.env.example | grep MYNEW
cat /tmp/gi-test/demo/turbo.json | grep -A 70 globalEnv | grep MYNEW
cat /tmp/gi-test/demo/bunfig.toml
# also check generated .env.local filtered includes new var if billing selected
cat /tmp/gi-test/demo/.env.local | grep MYNEW || echo "check local builder"
# host root turbo.json
cat turbo.json | grep globalEnv -A 70 | grep MYNEW
# check constants
rg MYNEW src/lib/env-manifest.ts
grep MYNEW src/templates/shared/env -r
```

## Secrets vs Env Classification

- Server-only secrets: never `NEXT_PUBLIC_*`, `VITE_*`, or `EXPO_PUBLIC_*`. Must be only server. Examples: `*_SECRET_KEY`, `*_API_KEY` (except client token), `*_WEBHOOK_SECRET`, `*_ACCESS_TOKEN`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`.
- Client-safe: publishable keys, client tokens, app URLs, and public PostHog project keys. Emit `NEXT_PUBLIC_*`, `VITE_*`, or `EXPO_PUBLIC_*` only for the selected audiences through `publicVarLines()`.
- Flags: `CHARGILY_MODE`, `PADDLE_ENVIRONMENT`, `POLAR_ENVIRONMENT`, `TRUSTED_PROXY`, `DATABASE_SSL` non-secret config.
- Email: `RESEND_API_KEY` server-only, `EMAIL_FROM` config.
- Analytics: `POSTHOG_API_KEY` configures server analytics. Browser/native analytics uses `NEXT_PUBLIC_POSTHOG_KEY`, `VITE_POSTHOG_KEY`, or `EXPO_PUBLIC_POSTHOG_KEY` for the selected audience. Configure the server variable explicitly even when it uses the same PostHog project key.

## Why 5 Places — Root Cause

- `env-manifest.ts` owns the key and placeholder catalog; `constants.ts` re-exports it.
- `shared/env` builders emit actual files `.env.example` + `.env.local` single source — if miss, file missing var placeholder.
- `root/turbo.ts` derives generated cache inputs from the manifest, and the resolved compiler filters them to selected capability/app ownership. Missing inputs can reuse stale output after a configuration change.
- Root `turbo.json` host: if CI uses turbo there, similar.
- Docs: drift causes agents/contributors missing var documentation, future changes miss it again.
