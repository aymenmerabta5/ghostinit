# Env Vars — 5-Place Rule Dev Deep Dive

## Rule

New env var → MUST update same PR in 5 places else broken generation or Turbo cache poisoned.

1. `src/lib/constants.ts` `ENV_PLACEHOLDERS` — `"PLACEHOLDER = \"REPLACE_WITH_...\""` string.
2. `src/templates/shared/env/` builders — `billing.ts`, `core.ts`, `builders.ts` — emit example + local + dual client prefixes where client-safe.
3. `src/templates/root.ts` `turbo()` + `root/index.ts` + split — manifest-derived `globalEnv`, filtered to selected capabilities/apps.
4. Root `turbo.json` `globalEnv` host CI host-level.
5. Docs: `AGENTS.md` environment contract + `skills/ghostinit-use/references/workflows.md` or `billing.md` or `frameworks.md` if user-visible + `CONTRIBUTING.md` if how-to affected.

## 1. `src/lib/constants.ts` `ENV_PLACEHOLDERS`

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
  - `billingEnvLocalLines` emits real secrets via `secret()` or provided RootSecrets for all when empty else selected.
  - `billingEnvLocalLinesFiltered` filtered only selected + message when none.

- `core.ts`: `coreEnvExampleLines`, `coreEnvLocalLines`, `resendExampleLines`, `resendLocalLines`
  - Core: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_NAME`, `NEXT_PUBLIC_APP_URL` + VITE duplicate, `TRUSTED_PROXY`, `MAINTENANCE_MODE` + `MAINTENANCE_BYPASS_TOKEN` (proxy maintenance gate), `POSTGRES_*`, `DATABASE_SSL`, etc.
  - Resend: `RESEND_API_KEY`, `EMAIL_FROM`.
  - Cache (Upstash): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` via `cacheEnvExampleLines()`/`cacheEnvLocalLines()` in `builders.ts`; emitted and included in Turbo inputs only when the cache capability is selected.

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

Dual client prefix for client-safe tokens:

```ts
// always emit both NEXT_PUBLIC_* and VITE_* for client tokens
out.push(`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
out.push(`VITE_STRIPE_PUBLISHABLE_KEY=${ENV_PLACEHOLDERS.STRIPE_PUBLISHABLE}`);
```

Server-only secrets never client: `*_SECRET_KEY`, `*_API_KEY`, `*_WEBHOOK_SECRET`, `*_ACCESS_TOKEN`, `DATABASE_URL`, `BETTER_AUTH_SECRET`.

## 3. `src/templates/root.ts` `turbo()` + Root Folder Split

`root.ts` shim → `root/index.ts` + `root/secrets.ts` etc split 483 LOC god file.

- `secrets.ts` `RootSecrets` interface + `billingEnvPlaceholders` + `secret()` helper.
- `index.ts` `rootFiles()` emits root files: `package.json` (workspaces apps/* packages/* tooling/*, scripts dev/typecheck/lint/check/test/db:generate/db:migrate/db:push, dependencies maybe), `turbo.json`, `bunfig.toml`, `.oxlintrc.json`, `.oxfmtrc.json`, `.gitignore`, `.env.example` (via filtered), `README.md` minimal, etc.

`turbo()` function / `turbo.json` template:

```ts
export function turbo() {
  return JSON.stringify(
    {
      globalDependencies: [".env.*local"],
      globalEnv: [
        "DATABASE_URL",
        "BETTER_AUTH_URL",
        "BETTER_AUTH_SECRET",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "VITE_STRIPE_PUBLISHABLE_KEY",
        "CHARGILY_API_KEY",
        "CHARGILY_SECRET_KEY",
        "CHARGILY_MODE",
        "PADDLE_API_KEY",
        "PADDLE_WEBHOOK_SECRET",
        "PADDLE_ENVIRONMENT",
        "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
        "NEXT_PUBLIC_PADDLE_ENVIRONMENT",
        "VITE_PADDLE_CLIENT_TOKEN",
        "VITE_PADDLE_ENVIRONMENT",
        "POLAR_ACCESS_TOKEN",
        "POLAR_WEBHOOK_SECRET",
        "POLAR_ORG_ID",
        "POLAR_ENVIRONMENT",
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "POSTHOG_KEY",
        "POSTHOG_HOST",
        "NEXT_PUBLIC_POSTHOG_KEY",
        "NEXT_PUBLIC_POSTHOG_HOST",
        "VITE_POSTHOG_KEY",
        "NEXT_PUBLIC_APP_URL",
        "VITE_APP_URL",
        "TRUSTED_PROXY",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "DATABASE_SSL",
        "DATABASE_SSL_CA",
        "DATABASE_POOL_SIZE",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        // add new here:
        "MYNEW_API_KEY",
        "NEXT_PUBLIC_MYNEW_KEY",
        "VITE_MYNEW_KEY",
        "NEXT_PUBLIC_*", // wildcard safe fallback but explicit preferred
        "VITE_*",
      ],
      tasks: {
        build: {
          dependsOn: ["^build"],
          inputs: ["$TURBO_DEFAULT$", ".env* !.env.*local"],
          outputs: ["dist/**", ".next/**", ".output/**", ".vinxi/**", ".vercel/**"],
        },
        // ...
      },
    },
    null,
    2,
  );
}
```

Exhaustive list is critical — missing var → cache poisoned, change to key not invalidating.

Also `inputs: ["$TURBO_DEFAULT$", ".env* !.env.*local"]` includes .env.example but excludes .env.*local for safety.

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
grep MYNEW src/lib/constants.ts
grep MYNEW src/templates/shared/env -r
```

## Secrets vs Env Classification

- Server-only secrets: never `NEXT_PUBLIC_*` / `VITE_*`. Must be only server. Examples: `*_SECRET_KEY`, `*_API_KEY` (except client token), `*_WEBHOOK_SECRET`, `*_ACCESS_TOKEN`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`.
- Client-safe: `NEXT_PUBLIC_*`, `VITE_*` — publishable keys, client tokens, app URLs, posthog keys public. Emit both prefixes for cross-framework compat.
- Flags: `CHARGILY_MODE`, `PADDLE_ENVIRONMENT`, `POLAR_ENVIRONMENT`, `TRUSTED_PROXY`, `DATABASE_SSL` non-secret config.
- Email: `RESEND_API_KEY` server-only, `EMAIL_FROM` config.
- Analytics: `POSTHOG_KEY` sometimes client but also server node package posthog-node vs posthog-js.

## Why 5 Places — Root Cause

- `constants.ts` source of placeholder strings SSOT.
- `shared/env` builders emit actual files `.env.example` + `.env.local` single source — if miss, file missing var placeholder.
- `root.ts` `turbo()` emits generated `turbo.json` globalEnv — if miss, turbo cache not invalidated when env changes, stale secrets reused → security + bug.
- Root `turbo.json` host: if CI uses turbo there, similar.
- Docs: drift causes agents/contributors missing var documentation, future changes miss it again.
