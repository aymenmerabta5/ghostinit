# GhostInit V2 Generated-Gate Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default `bun run test:generated` corners, `next-monorepo` and `single-next`, install, typecheck, and lint without exceptions, weakened checks, newly introduced unsafe escapes, or feature leakage.

**Architecture:** Fix the emitting source, then guard each root cause with fast structural/semantic unit tests before re-running an installed generated project. Monorepo package ownership and single-mode flat ownership remain distinct, while shared UI and lint emitters keep one implementation. The existing public V1 CLI remains the entrypoint; this is stabilization, not V2 cutover.

**Tech Stack:** Bun 1.4.0 host, TypeScript 7.0.2 host, legacy generated dependency catalog, TypeScript/React 19, TanStack Form 1.33.1, Better Auth 1.6.23, Base UI 1.6.0, Stripe Node 19.1.0, OXC parser, oxlint, and Bun test.

## Global Constraints

- Work only in `D:\MyWork\Clis\ghostinit-v2-implementation`; never reset or copy over user work.
- Host Bun stays exactly `1.4.0`; host TypeScript stays exactly `7.0.2`.
- Phase 1A does not refresh or upgrade the legacy generated dependency catalog and does not change `src/cli.ts`. Existing catalog pins are immutable. The only catalog additions permitted here are missing packages already imported by emitted source, after exact registry/peer evidence: `server-only@0.0.1` and `lucide-react@1.33.0`.
- Do not add `expectedFailures`, remove a generated command, skip a checker, turn an error into a warning, or allow a checker to report success when its parser/dependency is absent.
- Phase 1A is a V1 stabilization, not the V2 zero-unsafe-syntax gate. Do not introduce an unsafe occurrence; remove every baseline occurrence explicitly assigned to a touched stabilization emitter; preserve only schema-baselined deferred V1 occurrences that later V2 replacement deletes. V2 Phase 6 remains the zero gate.
- Do not add a raw button, select, dialog, popover, empty state, badge, spinner, or form control when the emitted local shadcn/Base UI vocabulary already provides it.
- Keep route/page files focused; do not grow a route beyond 150 nonblank/noncomment lines or a feature component beyond 180. Extract a focused helper/component instead.
- Preserve conditional emission. A disabled capability contributes no dependency, import, file, export, environment key, or runtime registration.
- Each behavior follows RED, GREEN, REFACTOR. A test must fail for the stated diagnostic before its implementation is edited.
- Run `bun run check` before the full host test. All test commands use `--timeout 100000` where applicable.
- After each RED/GREEN/reviewer/commit cycle, append the command evidence, commit SHA, and reviewer verdict to ignored `.superpowers/sdd/progress.md`; never stage scratch evidence.

## Research and exact-type baseline

These findings are inputs, not substitutes for re-checking the installed files during implementation:

- Context7 TanStack Form public guidance uses `createFormHookContexts`/`createFormHook` for pre-bound composition and `form.Subscribe` for submit state. Installed `@tanstack/react-form@1.33.1` returns `ReactFormExtendedApi<...>` with eleven validator/meta slots; `FormApi<..., unknown, ...>` is invariant. Its installed `FormApi.handleSubmit()` overload returns `Promise<void>`.
- Context7 Better Auth `v1.6.23` documents `authClient.requestPasswordReset`, `authClient.twoFactor.enable`, `onSuccess(context.data.twoFactorRedirect)`, and admin roles. Installed types prove `enable` returns `{ totpURI: string; backupCodes: string[] }`, the two-factor plugin augments `session.user.twoFactorEnabled`, and default `adminClient()` accepts `"admin" | "user"` roles.
- Context7 Stripe Node `v19.1.0` and installed types prove the SDK default API version is `2025-09-30.clover`; `Stripe.LatestApiVersion` is that literal, `Invoice.parent` is `Invoice.Parent | null`, and `parent.subscription_details.subscription` is `string | Stripe.Subscription`. Omit a manual version override and use the exact installed SDK default.
- Installed `@base-ui/react@1.6.0` exports controlled `Select.Root<Value>` with `items`, `value`, `disabled`, and `onValueChange(value, details)`, plus `Group`, `Portal`, `Positioner`, `Popup`, `List`, `Item`, `ItemIndicator`, and `ItemText`.
- Host `typescript@7.0.2` exposes version metadata but not the legacy JavaScript compiler API (`createSourceFile`, `ScriptKind`, `isImportDeclaration`, and JSX guards are absent). Emitted lint scripts therefore use the already-pinned `oxc-parser@0.139.0` and test policy diagnostics explicitly.

Before editing those adapters, verify the same facts against the generated retained/install directory:

```powershell
$generated = 'D:\MyWork\Clis\ghostinit-v2-rca-20260823\next-monorepo'
$webModules = Join-Path $generated 'apps\web\node_modules'
$authModules = Join-Path $generated 'packages\auth\node_modules'
$billingModules = Join-Path $generated 'packages\billing\node_modules'
$required = @(
  (Join-Path $webModules '@tanstack\react-form\package.json'),
  (Join-Path $webModules '@base-ui\react\package.json'),
  (Join-Path $authModules 'better-auth\package.json'),
  (Join-Path $billingModules 'stripe\package.json')
)
foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing retained package evidence: $path. Run bun run test:generated -- --only next-monorepo --keep and use the freshly printed retained root instead."
  }
  $package = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
  "$($package.name)@$($package.version)"
}
$reactFormRoot = (Get-Item -LiteralPath (Join-Path $webModules '@tanstack\react-form')).ResolvedTarget
$formCore = Join-Path (Split-Path -Parent $reactFormRoot) 'form-core\dist'
if (-not (Test-Path -LiteralPath $formCore)) { throw "Missing @tanstack/form-core types: $formCore" }
rg -n 'handleSubmit\(\): Promise<void>' $formCore
rg -n 'totpURI: string|backupCodes: string\[\]|twoFactorRedirect|requestPasswordReset' (Join-Path $authModules 'better-auth\dist')
rg -n '2025-09-30.clover|subscription_details' (Join-Path $billingModules 'stripe\types')
```

Expected versions: `@tanstack/react-form@1.33.1`, `better-auth@1.6.23`, `stripe@19.1.0`, and `@base-ui/react@1.6.0`.

## Mandatory frontend implementer and reviewer prompts

Use these verbatim for Tasks 3, 4, 5, and 7 whenever an implementer or reviewer touches a page, component, UI template, frontend lint policy, or frontend acceptance test.

**Implementer prompt:**

> Before editing, freshly read the Impeccable skill, run its context loader from this worktree, consume all of `PRODUCT.md` and `DESIGN.md`, select and read the product register, then freshly read the shadcn forms/composition/Base-vs-Radix/styling/icon rules, Next best practices, Vercel React performance, and Vercel composition guidance. Run `bunx --bun shadcn@latest docs select popover button empty spinner field` and inspect the installed `@base-ui/react@1.6.0` declarations. Report the context directory, `PRODUCT.md` and `DESIGN.md` paths, selected register, commands run, Base UI version, selected local components, and applied rules before making an edit. Do not use raw interactive controls, `asChild` directly on Base primitives, pending boolean props, decorative motion, manual overlay z-index, or oversized components.

**Reviewer prompt:**

> Do not reuse the implementer's summary as context. Freshly read Impeccable, rerun the context loader, reread the product register and the relevant shadcn/Next/React rules, then inspect the emitted source and generated diff. Report the fresh loader paths, selected product register, docs/type evidence, keyboard/focus/label behavior, controlled state flow, event-handler side effects, component sizes, and any exception. Reject raw interactive markup where a local component exists, ungrouped Select items, missing overlay title/description, `isPending` props, unsafe casts, client/server leakage, and unexplained deviations.

Run the loader with:

```powershell
node "$env:USERPROFILE\.agents\skills\impeccable\scripts\load-context.mjs"
Get-Content -Raw "$env:USERPROFILE\.agents\skills\impeccable\reference\product.md"
```

The expected register is `product`: authenticated forms, settings, admin, and notifications serve a task. Record the evidence in the task progress/review ledger; do not invent a frontend-record schema that Phase 1A has not implemented.

## Execution prerequisite: commit the governing plan evidence, then record the base

- [ ] **Step 1: Verify both governing documents and the disposition policy were committed together**

```powershell
$stabilization = 'docs/superpowers/plans/2026-08-23-ghostinit-v2-generated-gate-stabilization.md'
$toolchain = 'docs/superpowers/plans/2026-08-23-ghostinit-v2-toolchain.md'
$dispositions = 'evidence/generated/v1-unsafe-syntax-dispositions.json'
$governing = @($stabilization, $toolchain, $dispositions)
git diff --exit-code HEAD -- $governing
if ($LASTEXITCODE -ne 0) { throw 'Commit both plans and the tracked disposition policy before execution' }
$head = (git rev-parse HEAD).Trim()
foreach ($path in $governing) {
  $latest = (git log -1 --format=%H -- $path).Trim()
  if ($latest -ne $head) {
    throw "Governing evidence must be committed together at HEAD before execution: path=$path latest=$latest HEAD=$head"
  }
}
```

The committed disposition policy is the sole provenance input. Its 16 Cartesian projection keys retain 839 occurrences, 94 unique emitted-path/owner pairs, 55 owners, and 96 disjoint rules. It also records the exact gates: `gate/next-monorepo` is Next.js + monorepo + PostgreSQL + web app + `stripe,chargily`, while `gate/single-next` is Next.js + single + PostgreSQL + web app + `stripe`. The gates add 172 catalog rows; 15 are reviewed Chargily occurrences that exist only in `gate/next-monorepo` and resolve through five additional path/owner rules. Across all 18 keys, 1,011 occurrences match exactly one of 101 rules covering 99 path/owner pairs and 60 owners. Two Next Stripe pairs are split by PostgreSQL (`remove-in-stabilization`) versus Convex (`deferred-v1`); the same config/path can never match both. The comparable Stripe-only projection keys remain 72 remove/85 deferred, while the two real gate keys preserve exactly 72 remove/100 deferred. Task 0 validates this file against the schema it creates and never derives policy from an ignored inventory or an owner-only allowlist.

Expected: all three paths are clean and each path's latest commit is the current `HEAD`.

- [ ] **Step 2: Record ignored execution evidence**

```powershell
$base = (git rev-parse HEAD).Trim()
if ($base -notmatch '^[0-9a-f]{40}$') { throw "Invalid base SHA: $base" }
Set-Content -NoNewline -LiteralPath '.superpowers/sdd/generated-gate-stabilization-base.txt' -Value $base
Add-Content -LiteralPath '.superpowers/sdd/progress.md' -Value "`nGenerated gate stabilization base: $base"
foreach ($path in @('.superpowers/sdd/generated-gate-stabilization-base.txt', '.superpowers/sdd/progress.md')) {
  git check-ignore --quiet -- $path
  if ($LASTEXITCODE -ne 0) { throw "Execution evidence must remain ignored: $path" }
}
```

Expected: base and progress evidence are ignored process state and are never staged.

## File responsibility map

- `tests/unit/generated-import-closure.test.ts`: OXC-backed direct-import/owner-manifest closure for monorepo packages and, later, the flat single package.
- `tests/unit/lint-scripts-template.test.ts`: executes emitted lint scripts on fixtures and lints the emitted CJS itself.
- `tests/unit/generated-web-ui-contract.test.ts`: controlled Select, notification action, and shared auth/2FA UI contracts.
- `tests/unit/single-next-contract.test.ts`: flat-mode Form, Better Auth, email/config, role, and unsafe-syntax contracts.
- `tests/unit/stripe-analytics-contract.test.ts`: Stripe 19.1.0 event narrowing and cookie-source union narrowing.
- `tests/unit/stripe-webhook-runtime.test.ts`: pure bounded-body, verifier, transactional claim, rollback, and idempotency behavior.
- `tests/integration/stripe-webhook-typecheck.test.ts`: installs and typechecks both exact generated Next/PostgreSQL route adapters against their real runtime/schema/dependency types.
- `tests/unit/import-alias-policy.test.ts`: executes the ownership-aware alias policy against static/dynamic/style fixtures and materialized next-monorepo plus single-next defaults.
- `evidence/generated/v1-unsafe-syntax-dispositions.json`: precommitted, schema-validated provenance and disposition policy for every reviewed matrix path/configuration.
- `evidence/generated/v1-unsafe-syntax-baseline.json`: schema-validated V1 ceiling; assigned stabilization IDs must disappear, deferred IDs remain until V2 Phase 6.
- `src/templates/access.ts` and `src/templates/auth.ts`: Better Auth owns access-control values and plugin wiring; kernel remains dependency-free.
- `src/templates/{api,modules,email}.ts`, `src/templates/services/index.ts`, and app/single package emitters: declare every direct import at its actual owner, conditionally.
- `src/templates/apps/fragments/web-ui/*`: local Base UI/shadcn wrappers and form composition.
- `src/templates/apps/fragments/lib/{notifications,feature-flags}.ts`: notification interaction and framework/mode-aware flags.
- `src/templates/modes/single/pages/*`, `src/templates/modes/single/server/auth.ts`, and `src/templates/modes/single/fragments/kernel.ts`: flat-mode typed auth/UI contracts.
- `src/templates/billing/webhooks/providers/{stripe,stripe-postgres-runtime}.ts`, `src/templates/billing/schema/tables/webhook_events.ts`, and `src/templates/analytics/utils.ts`: typed vendor/boundary narrowing, pure delivery orchestration, and JSONB payload compatibility.
- `src/templates/tooling/lint-scripts.ts`: emitted semantic lint policies; never a fake-success shim.

---

### Task 0: Freeze the V1 generated unsafe-syntax ceiling

**Files:**

- Create: `schemas/v1-generated-unsafe-syntax-baseline.schema.json`
- Create: `schemas/v1-generated-unsafe-syntax-dispositions.schema.json`
- Create: `evidence/generated/v1-unsafe-syntax-baseline.json`
- Create: `tests/helpers/generated-unsafe-syntax.ts`
- Create: `tests/unit/generated-unsafe-syntax-baseline.test.ts`

**Interfaces:**

- `collectUnsafeOccurrences(configKey, files, policy)` returns stable OXC-backed occurrence IDs for explicit `any`, `as any`, nested/mixed assertion chains, and `@ts-ignore`. It assigns `sourceOwner` only through the one provenance rule whose `applicableConfigKeys` contains the config key and whose anchored `emittedPathPattern` matches the emitted path; zero or multiple matches throw.
- A base ID is `configKey::emittedPath::kind::fingerprint`. Group equal base IDs, sort each group by `node.start`, and append a one-based ordinal: `configKey::path::kind::fingerprint::ordinal`. Duplicate identical snippets remain distinct while unrelated line movement does not mint an ID.
- Baseline entries copy `sourceOwner`, `disposition`, and `removalPhase` from that exact provenance rule. The precommitted policy classifies exactly 72 default-corner occurrences for stabilization and 100 as deferred; deferred entries remain allowed only through V1, and V2 Phase 6 removes all of them.

- [ ] **Step 1: Write the detector and missing-baseline RED test**

The detector uses `parseSync` and a generic OXC walk. Record the outer node once for a nested/mixed assertion and scan suppression comments separately:

```ts
export type UnsafeKind = "explicit-any" | "as-any" | "assertion-chain" | "ts-ignore";
export interface UnsafeOccurrence {
  id: string;
  configKey: string;
  path: string;
  sourceOwner: string;
  kind: UnsafeKind;
  fingerprint: string;
  snippet: string;
}
export interface UnsafeProvenanceRule {
  sourceOwner: string;
  emittedPathPattern: string;
  applicableConfigKeys: string[];
  expectedOccurrences: number;
  disposition: "remove-in-stabilization" | "deferred-v1";
  removalPhase: "Phase 1A" | "V2 Phase 6";
}
type OxcNode = {
  type?: string;
  start?: number;
  end?: number;
  expression?: OxcNode;
  typeAnnotation?: OxcNode;
  [key: string]: unknown;
};

const normalized = (source: string): string => source.replace(/\s+/g, " ").trim();
const fingerprint = (source: string): string =>
  createHash("sha256").update(normalized(source)).digest("hex").slice(0, 16);

function unsafeKind(node: OxcNode, parent: OxcNode | undefined): UnsafeKind | undefined {
  if (node.type === "TSAnyKeyword") {
    const ownedByAsAny =
      (parent?.type === "TSAsExpression" || parent?.type === "TSTypeAssertion") &&
      parent.typeAnnotation === node;
    return ownedByAsAny ? undefined : "explicit-any";
  }
  if (
    (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") &&
    node.typeAnnotation?.type === "TSAnyKeyword"
  )
    return "as-any";
  if (
    (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") &&
    (node.expression?.type === "TSAsExpression" || node.expression?.type === "TSTypeAssertion") &&
    parent?.type !== "TSAsExpression" &&
    parent?.type !== "TSTypeAssertion"
  )
    return "assertion-chain";
  return undefined;
}
```

`collectUnsafeOccurrences` fails on parser diagnostics, slices `source.slice(node.start, node.end)`, adds `@ts-ignore` line slices, resolves the file's single provenance rule, and then assigns ordinals after sorting equal base-ID groups by `node.start`. Compile every policy regex once and require it to be anchored with `^` and `$`. For each emitted source file containing an occurrence, filter rules by exact config key and path regex; include the config key and path in the thrown diagnostic when the match count is not one. The helper owns the explicit Cartesian projection `mode=[monorepo,single] × framework=[nextjs,tanstack-start] × database=[postgres,convex] × capabilities=[off,on]`, plus `gate/next-monorepo` with PostgreSQL, web app, and billing `stripe,chargily`, and `gate/single-next` with PostgreSQL, web app, and billing `stripe`; both gates use Next.js and capability-on settings. The unit test reads the precommitted disposition policy, deliberately opens the missing occurrence baseline first for RED, then validates both artifacts with Ajv Draft 2020-12, generates all 18 catalog keys, and compares actual IDs and assigned owners to the baseline.

- [ ] **Step 2: Run RED**

```bash
bun test tests/unit/generated-unsafe-syntax-baseline.test.ts --timeout 100000
```

Expected: FAIL with `ENOENT` for `evidence/generated/v1-unsafe-syntax-baseline.json`.

- [ ] **Step 3: Create the strict schema**

The schema requires `schemaVersion: 1`, `detectorVersion: 1`, `zeroGatePhase: "V2 Phase 6"`, nonempty `catalogKeys`, unique entry IDs, and this entry shape with `additionalProperties: false`:

```json
{
  "type": "object",
  "required": [
    "id",
    "path",
    "kind",
    "fingerprint",
    "sourceOwner",
    "catalogKeys",
    "disposition",
    "removalPhase"
  ],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "path": { "type": "string", "minLength": 1 },
    "kind": { "enum": ["explicit-any", "as-any", "assertion-chain", "ts-ignore"] },
    "fingerprint": { "type": "string", "pattern": "^[a-f0-9]{16}$" },
    "sourceOwner": { "type": "string", "pattern": "^src/templates/" },
    "catalogKeys": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "uniqueItems": true
    },
    "disposition": { "enum": ["remove-in-stabilization", "deferred-v1"] },
    "removalPhase": { "enum": ["Phase 1A", "V2 Phase 6"] }
  }
}
```

The disposition schema separately requires the already-committed top-level fields `$schema`, `schemaVersion: 1`, `catalogEvidence`, `projectionEvidence`, `gateEvidence`, `defaultProjection`, `zeroGatePhase: "V2 Phase 6"`, and `rules`, all with `additionalProperties: false`. Fix `catalogEvidence` to 18 unique `configKeys`, `occurrenceRows: 1011`, `uniqueOwnerPathPatterns: 99`, `uniqueSourceOwners: 60`, and `provenanceRules: 101`. Fix `projectionEvidence` to the 16 Cartesian keys and 839/94/55/96 counts, with its two comparable Stripe-on keys at 72 remove/85 deferred. Fix `gateEvidence` to the two exact configurations and 172 rows, including 15 gate-only Chargily occurrences across five path/owner pairs. Fix `defaultProjection.configKeys` to the two gate keys and its counts to 72/100. Every rule has exactly this closed shape:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "sourceOwner",
    "emittedPathPattern",
    "applicableConfigKeys",
    "expectedOccurrences",
    "disposition",
    "removalPhase"
  ],
  "properties": {
    "sourceOwner": { "type": "string", "pattern": "^src/templates/" },
    "emittedPathPattern": { "type": "string", "minLength": 3 },
    "applicableConfigKeys": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "type": "string" }
    },
    "expectedOccurrences": { "type": "integer", "minimum": 1 },
    "disposition": { "enum": ["remove-in-stabilization", "deferred-v1"] },
    "removalPhase": { "enum": ["Phase 1A", "V2 Phase 6"] }
  }
}
```

The unit test additionally enforces sorted unique config keys and rules, anchored/compilable path regexes, the exact phase for each disposition, every rule's exact positive `expectedOccurrences`, and exactly one matching rule for each of the 1,011 catalog occurrences. The five gate-only Chargily rules carry counts 6, 2, 4, 2, and 1, totaling 15. It separately asserts 839 projection rows, the comparable 72/85 split, both exact gate configurations, and the gate 72/100 split. This executable uniqueness check is required because JSON Schema cannot reject overlapping regular expressions.

- [ ] **Step 4: Generate the committed baseline from current output and the tracked disposition policy**

Run before any emitter edit:

```bash
bun tests/helpers/generated-unsafe-syntax.ts --write-baseline evidence/generated/v1-unsafe-syntax-baseline.json --dispositions evidence/generated/v1-unsafe-syntax-dispositions.json
```

The helper validates the precommitted disposition policy and schema, proves all 839 projection occurrences resolve through the 96 projection rules, and separately generates the two exact gates. Their 157 Stripe-comparable rows retain 72 remove/85 deferred; the 15 additional Chargily rows are all deferred and match the five gate-only rules, yielding the required 72 remove + 100 deferred = 172. Across all 18 keys, all 1,011 occurrences resolve to exactly one of 101 rules. The resolved rule assigns the source owner and disposition; no owner-only fallback exists. It writes sorted ordinal IDs and all 18 `catalogKeys`. Do not hand-edit generated IDs or stage the disposition policy again; only a schema-validated factual correction with updated count evidence may amend that precommitted file.

- [ ] **Step 5: Run GREEN baseline ceiling tests**

```bash
bun test tests/unit/generated-unsafe-syntax-baseline.test.ts --timeout 100000
bun run check
```

Expected: both schemas pass; every projection and real-gate occurrence has one provenance rule and one committed baseline ID with the same `sourceOwner`; the comparable projection is 72/85 and the actual gate projection is exactly 72 remove-in-stabilization/100 deferred-v1; no zero-unsafe claim is made.

- [ ] **Step 6: Commit**

```bash
git add schemas/v1-generated-unsafe-syntax-baseline.schema.json schemas/v1-generated-unsafe-syntax-dispositions.schema.json evidence/generated/v1-unsafe-syntax-baseline.json tests/helpers/generated-unsafe-syntax.ts tests/unit/generated-unsafe-syntax-baseline.test.ts
git commit -m "test: freeze the V1 generated unsafe syntax ceiling"
```

---

### Task 1: Put access control in auth and close monorepo package manifests

**Files:**

- Create: `tests/unit/generated-import-closure.test.ts`
- Modify: `tests/unit/auth.test.ts`
- Create: `tests/fixtures/compatibility/drizzle-betterauth-orpc/src/access-contract.ts`
- Create: `tests/fixtures/compatibility/drizzle-betterauth-orpc/src/access-default-contract.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- Modify: `packages/versions/src/index.ts`
- Modify: `src/templates/access.ts`
- Modify: `src/templates/auth.ts`
- Modify: `src/templates/api.ts`
- Modify: `src/templates/modules.ts`
- Modify: `src/templates/email.ts`
- Modify: `src/templates/services/index.ts`
- Modify: `src/templates/apps/fragments/header/guards.ts`
- Modify: `src/templates/apps/fragments/admin/layout.ts`
- Modify: `src/templates/modes/single/server/auth.ts`
- Modify: `src/templates/modes/single/pages/admin.ts`

**Interfaces:**

- `accessFiles("monorepo")` produces `packages/auth/src/access.ts`, exporting custom `ac`, `roles`, and `AccessRole`; it never writes under `packages/kernel`. Single mode does not configure custom roles: server uses `admin()`, client uses `adminClient()`, and its local guard accepts only `"admin"` from the default `"admin" | "user"` union.
- `authPackage()` emits the Better Auth server at `packages/auth/src/server.ts`, the client at `packages/auth/src/client.ts`, and an explicit barrel at `packages/auth/src/index.ts`. Server consumes `admin({ ac, roles, adminRoles: ["admin", "superAdmin"] })`; client consumes `adminClient({ ac, roles })`; every server/client guard calls the same `isAdminRole` predicate.
- `findUndeclaredImports(files)` scans root, apps, packages, Convex, configs, and scripts across TS/TSX/JS/JSX/MTS/CTS/MJS/CJS and returns sorted `owner :: source -> dependency` findings using OXC static imports/re-exports, literal `import()`, and literal `require()` extraction.
- Package manifests declare direct imports at the owning package, with billing/messaging dependencies present only when their files are emitted.

- [ ] **Step 1: Write the failing package-closure and ownership tests**

Create the test with these core definitions and assertions:

```ts
import { describe, expect, test } from "bun:test";
import { extname } from "node:path";
import { builtinModules } from "node:module";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const config = (billing: ProjectConfig["billing"]): ProjectConfig =>
  projectConfigSchema.parse({
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing,
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  });

const CLOSURE_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    (["postgres", "convex"] as const).flatMap((database) =>
      ([false, true] as const).map((enabled) => ({
        key: `${mode}/${framework}/${database}/${enabled ? "capabilities-on" : "capabilities-off"}`,
        config: projectConfigSchema.parse({
          name: "demo",
          mode,
          framework,
          database,
          preset: enabled ? "saas" : "custom",
          auth: enabled,
          api: enabled,
          email: enabled,
          analytics: enabled,
          billing: enabled ? ["stripe"] : [],
          features: enabled ? ["i18n"] : [],
          apps: ["web"],
        }),
      })),
    ),
  ),
);

const packageName = (specifier: string): string =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);

const MAINTAINED_CODE = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function findUndeclaredImports(files: TemplateFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const owners = files
    .filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"))
    .map((file) => {
      const root = file.path === "package.json" ? "" : file.path.slice(0, -"/package.json".length);
      const manifest = JSON.parse(file.content) as {
        name: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      return {
        root,
        name: manifest.name,
        declarations: new Set([
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
          ...Object.keys(manifest.peerDependencies ?? {}),
          ...Object.keys(manifest.optionalDependencies ?? {}),
        ]),
      };
    })
    .sort((left, right) => right.root.length - left.root.length);

  const missing = new Set<string>();
  for (const file of files) {
    if (!MAINTAINED_CODE.test(file.path)) continue;
    const owner = owners.find(({ root }) => root === "" || file.path.startsWith(`${root}/`));
    if (!owner || !byPath.has(owner.root === "" ? "package.json" : `${owner.root}/package.json`))
      continue;
    const parsed = parseFile(file.content, extname(file.path));
    for (const specifier of parsed.imports) {
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("@/") ||
        specifier.startsWith("~/") ||
        BUILTINS.has(specifier) ||
        specifier === "bun:test"
      )
        continue;
      const dependency = packageName(specifier);
      if (!owner.declarations.has(dependency)) {
        missing.add(`${owner.name} :: ${file.path} -> ${dependency}`);
      }
    }
  }
  return [...missing].toSorted();
}

describe("generated package ownership", () => {
  test("auth owns access control and kernel stays dependency-free", () => {
    const files = generateProjectFiles(config(["stripe"]));
    expect(files.some(({ path }) => path === "packages/auth/src/access.ts")).toBe(true);
    expect(files.some(({ path }) => path === "packages/kernel/src/access.ts")).toBe(false);
    expect(files.find(({ path }) => path === "packages/auth/src/server.ts")?.content).toContain(
      'admin({ ac, roles, adminRoles: ["admin", "superAdmin"] })',
    );
    expect(files.find(({ path }) => path === "packages/auth/src/client.ts")?.content).toContain(
      "adminClient({ ac, roles })",
    );
    expect(files.find(({ path }) => path === "packages/auth/src/index.ts")?.content).toContain(
      'export { auth, type Auth } from "./server.js"',
    );
  });

  test("every root/app/package/convex/config/script import is declared by its nearest owner", () => {
    const problems = CLOSURE_MATRIX.flatMap(({ key, config }) =>
      findUndeclaredImports(generateProjectFiles(config)).map((problem) => `${key}: ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  test("single TanStack selects env-core only", () => {
    for (const database of ["postgres", "convex"] as const) {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "demo",
          mode: "single",
          framework: "tanstack-start",
          database,
          preset: "saas",
          billing: database === "postgres" ? ["stripe"] : [],
        }),
      );
      const manifest = JSON.parse(
        files.find(({ path }) => path === "package.json")?.content ?? "{}",
      ) as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["@t3-oss/env-core"]).toBeDefined();
      expect(manifest.dependencies?.["@t3-oss/env-nextjs"]).toBeUndefined();
    }
  });

  test("billing-only declarations disappear with billing files", () => {
    const files = generateProjectFiles(config([]));
    for (const path of [
      "packages/api/package.json",
      "packages/modules/package.json",
      "packages/services/package.json",
    ]) {
      const manifest = JSON.parse(files.find((file) => file.path === path)?.content ?? "{}") as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["@repo/billing"]).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run RED and verify the root causes**

Run:

```bash
bun test tests/unit/generated-import-closure.test.ts --timeout 100000
```

Expected: FAIL. Ownership reports `packages/kernel/src/access.ts`; closure reports at least `@repo/api -> @repo/billing`, `@repo/email -> server-only`, `@repo/kernel -> better-auth`, `@repo/modules -> @repo/kernel/@repo/services`, and `@repo/services -> server-only/drizzle-orm/@repo/database/@repo/billing`.

- [ ] **Step 3: Record exact missing-package evidence without upgrading existing pins**

Run:

```bash
npm view server-only@0.0.1 version dist-tags peerDependencies engines --json
```

Expected: published latest is exactly `0.0.1`, with no peer conflict. Add only `"server-only": "0.0.1"` to the existing `runtime` registry object. Do not alter any existing generated dependency version.

- [ ] **Step 4: Move and wire the access contract**

Use these names so later role contracts remain consistent:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);
export const superAdmin = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});
export const adminRole = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
});
export const user = ac.newRole({ user: [], session: [] });
export const viewer = ac.newRole({ user: ["list"], session: ["list"] });

export const roles = {
  superAdmin,
  admin: adminRole,
  user,
  viewer,
} as const;
export type AccessRole = keyof typeof roles;
export const ADMIN_ROLE_NAMES = ["admin", "superAdmin"] as const;
export type AdminRole = (typeof ADMIN_ROLE_NAMES)[number];
export function isAdminRole(role: unknown): role is AdminRole {
  return role === "admin" || role === "superAdmin";
}
```

For monorepo mode, emit that content at `packages/auth/src/access.ts`. Retain and refactor the existing generated `packages/auth/src/server.ts` implementation; generate `packages/auth/src/index.ts` as the explicit barrel below. Import access values in server/client source and configure:

```ts
export { auth, type Auth } from "./server.js";
export {
  ac,
  roles,
  ADMIN_ROLE_NAMES,
  isAdminRole,
  type AccessRole,
  type AdminRole,
} from "./access.js";
```

```ts
import { ac, roles } from "./access.js";

// Replace only the existing admin() entry; retain twoFactor, magicLink,
// passkey, organization, the optional Expo plugin, and the framework cookie plugin.
admin({ ac, roles, adminRoles: ["admin", "superAdmin"] }),
```

```ts
import { ac, roles } from "./access.js";

// Retain the current typed onTwoFactorRedirect callback and replace adminClient().
adminClient({ ac, roles }),
```

Keep `".": "./src/index.ts"`, add `"./server": "./src/server.ts"` and `"./access": "./src/access.ts"` to the auth export map. Keep single-mode access placement unchanged in this task.

Update the four existing `auth.test.ts` lookups to read `packages/auth/src/server.ts`; keep a separate assertion that the emitted `index.ts` contains only explicit server/access re-exports.

Add the compiled compatibility fixture:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { admin } from "better-auth/plugins/admin";
import { adminClient } from "better-auth/client/plugins";

const ac = createAccessControl(defaultStatements);
const roles = {
  admin: ac.newRole({
    user: ["create", "list", "set-role", "ban", "delete"],
    session: ["list", "revoke"],
  }),
  superAdmin: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
  }),
  user: ac.newRole({ user: [], session: [] }),
  viewer: ac.newRole({ user: ["list"], session: ["list"] }),
} as const;

export const serverAdminPlugin = admin({
  ac,
  roles,
  adminRoles: ["admin", "superAdmin"],
});
export const clientAdminPlugin = adminClient({ ac, roles });
export type CompiledRole = keyof typeof roles;
export const compiledAdminRoles = ["admin", "superAdmin"] satisfies readonly CompiledRole[];
```

The fixture must compile under its existing `typescript@7.0.2` `tsconfig`; it proves Better Auth accepts the permission statements, role keys, server options, and matching client plugin types.

Add `access-default-contract.ts` to compile the single-mode contract independently:

```ts
import { admin } from "better-auth/plugins/admin";
import { adminClient } from "better-auth/client/plugins";
export const singleServerAdmin = admin();
export const singleClientAdmin = adminClient();
export type SingleRole = "admin" | "user";
export const singleRoleNames = ["admin", "user"] satisfies readonly SingleRole[];
export function isSingleAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}
```

No single-mode file imports monorepo `ac`, `roles`, `ADMIN_ROLE_NAMES`, or its predicate.

Monorepo guards import `isAdminRole` from `@repo/auth/access`. Single server/client retain `admin()`/`adminClient()` with no custom options and use a local predicate:

```ts
export type SingleRole = "admin" | "user";
export function isSingleAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}
```

Remove every `remove-in-stabilization` baseline occurrence assigned to these Task 1 owners: `src/templates/api.ts`, `src/templates/auth.ts`, and `src/templates/modes/single/pages/admin.ts`. Extend `generated-unsafe-syntax-baseline.test.ts` with:

```ts
const task1Owners = new Set([
  "src/templates/api.ts",
  "src/templates/auth.ts",
  "src/templates/modes/single/server/auth.ts",
  "src/templates/modes/single/pages/admin.ts",
]);
expect(
  actualIds.filter(
    (id) => removalEntriesById.get(id) && task1Owners.has(removalEntriesById.get(id)!.sourceOwner),
  ),
).toEqual([]);
```

- [ ] **Step 5: Declare package imports at the owners, conditionally**

Apply these exact manifest rules:

```ts
// api.ts
...(hasBilling ? { "@repo/billing": "workspace:*" } : {}),
```

```ts
// modules.ts
...(hasBilling ? { "@repo/kernel": "workspace:*", "@repo/services": "workspace:*" } : {}),
...(hasMessaging
  ? {
      "@repo/database": "workspace:*",
      "@repo/realtime": "workspace:*",
      "drizzle-orm": `^${v.database["drizzle-orm"]}`,
    }
  : {}),
```

```ts
// email.ts
"server-only": `^${v.runtime["server-only"]}`,
```

Move `const withBilling = hasBillingAddon(addons)` above the services manifest and emit:

```ts
dependencies: {
  "@repo/kernel": "workspace:*",
  "server-only": `^${v.runtime["server-only"]}`,
  zod: `^${v.validation.zod}`,
  ...(withBilling
    ? {
        "@repo/billing": "workspace:*",
        "@repo/database": "workspace:*",
        "drizzle-orm": `^${v.database["drizzle-orm"]}`,
      }
    : {}),
},
```

- [ ] **Step 6: Run GREEN and monorepo package checks**

Run:

```bash
bun test tests/unit/generated-import-closure.test.ts tests/unit/auth.test.ts --timeout 100000
bun test tests/unit/generated-unsafe-syntax-baseline.test.ts --timeout 100000
bun --cwd tests/fixtures/compatibility/drizzle-betterauth-orpc run typecheck
bun test tests/unit/generation-matrix.test.ts --timeout 100000
bun run build
```

Expected: closure/auth/unsafe tests pass, the Better Auth permission fixture compiles with TypeScript 7.0.2, the generation matrix passes, and build exits zero.

- [ ] **Step 7: Commit**

```bash
git add packages/versions/src/index.ts src/templates/access.ts src/templates/auth.ts src/templates/api.ts src/templates/modules.ts src/templates/email.ts src/templates/services/index.ts src/templates/apps/fragments/header/guards.ts src/templates/apps/fragments/admin/layout.ts src/templates/modes/single/server/auth.ts src/templates/modes/single/pages/admin.ts tests/unit/generated-import-closure.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/auth.test.ts tests/fixtures/compatibility/drizzle-betterauth-orpc/src/access-contract.ts tests/fixtures/compatibility/drizzle-betterauth-orpc/src/access-default-contract.ts
git diff --cached --name-only
git commit -m "fix: close generated monorepo package imports"
```

---

### Task 2: Make emitted lint scripts syntactically and semantically clean

**Files:**

- Create: `tests/unit/lint-scripts-template.test.ts`
- Modify: `src/templates/tooling/lint-scripts.ts`
- Modify: `src/templates/root/package.ts`
- Modify: `src/templates/modes/single/package.ts`

**Interfaces:**

- `lintScriptFiles()` emits the existing seven checks plus `scripts/lib/oxc.cjs`.
- Alias, Next parity, and navigation checks parse with exact-pinned `oxc-parser@0.139.0`; parser diagnostics exit nonzero and never print “skipped”.
- `check-rtl-logical.cjs` recognizes backtick-delimited Tailwind tokens without an escaped-backtick lint warning.
- `check-next-parity.cjs` rejects raw `<img>` without reading a dead `src` attribute.
- `check-navigation-imports.cjs` preserves its locale-aware `next/link` and `next/navigation` diagnostics.

- [ ] **Step 1: Write failing executable tests, not snapshots**

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { rootPackageJson } from "../../src/templates/root/package.js";
import { singlePackageJson } from "../../src/templates/modes/single/package.js";

const root = resolve(import.meta.dir, "../..");
const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(): { directory: string; scripts: string[] } {
  const directory = mkdtempSync(resolve(root, ".generated-lint-test-"));
  temporary.push(directory);
  const scripts = lintScriptFiles().map((file) => {
    const target = resolve(directory, file.path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, file.content);
    return target;
  });
  return { directory, scripts };
}

function runScript(directory: string, name: string): { exitCode: number; output: string } {
  const result = spawnSync("node", [resolve(directory, `scripts/${name}`)], {
    cwd: directory,
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("emitted lint scripts", () => {
  test("both generated roots declare the exact existing OXC parser pin", () => {
    const monorepo = JSON.parse(rootPackageJson("demo", "bun").content) as {
      devDependencies: Record<string, string>;
    };
    const single = JSON.parse(singlePackageJson("demo", "bun", [], false, false)) as {
      devDependencies: Record<string, string>;
    };
    expect(monorepo.devDependencies["oxc-parser"]).toBe("0.139.0");
    expect(single.devDependencies["oxc-parser"]).toBe("0.139.0");
  });

  test("the emitted CJS is oxlint-clean", () => {
    const { scripts } = fixture();
    const result = Bun.spawnSync(["bunx", "--no-install", "oxlint", "--deny-warnings", ...scripts]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("RTL tokens inside template literals are still detected", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/components"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/components/bad.tsx"),
      "export const Bad = () => <div className={`text-left`} />;\n",
    );
    const result = runScript(directory, "check-rtl-logical.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("RTL violations");
    expect(result.output).toContain("bad.tsx:1");
  });

  test("Next parity still rejects a raw image", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/page.tsx"),
      "export default function Page(){\n  return (\n    <img src='/avatar.png' alt='Avatar' />\n  );\n}\n",
    );
    const result = runScript(directory, "check-next-parity.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Next parity violations");
    expect(result.output).toContain("Use next/image <Image> instead of <img>");
    expect(result.output).toContain("src/app/page.tsx:3:5");
  });

  test("framework-native navigation passes when i18n routing is absent", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app/demo"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/demo/page.tsx"),
      'import Link from "next/link"; import { useRouter } from "next/navigation"; export default function Page(){ const router=useRouter(); return <Link href="/" onClick={()=>router.refresh()}>Home</Link>; }\n',
    );
    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode).toBe(0);
  });

  test("i18n routing rejects framework-native imports with the i18n remedy", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app/demo"), { recursive: true });
    mkdirSync(resolve(directory, "src/i18n"), { recursive: true });
    mkdirSync(resolve(directory, "src/lib"), { recursive: true });
    writeFileSync(resolve(directory, "src/i18n/routing.ts"), "export const Link = 1;\n");
    writeFileSync(resolve(directory, "src/lib/value.ts"), "export const value = 1;\n");
    writeFileSync(
      resolve(directory, "src/app/demo/page.tsx"),
      'import Link from "next/link"; import { useRouter } from "next/navigation"; import { value } from "../../lib/value"; export default () => <Link href="/">{value}</Link>;\n',
    );
    const navigation = runScript(directory, "check-navigation-imports.cjs");
    expect(navigation.exitCode).toBe(1);
    expect(navigation.output).toContain("Navigation import violations");
    expect(navigation.output).toContain('Use "@/i18n/routing"');
    const aliases = runScript(directory, "check-import-aliases.cjs");
    expect(aliases.exitCode).toBe(1);
    expect(aliases.output).toContain("Relative imports forbidden");
  });

  test("Next parity chooses its internal-anchor remedy from capability state", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(
      resolve(directory, "src/app/page.tsx"),
      'export default function Page(){ return <a href="/settings">Settings</a>; }\n',
    );
    const native = runScript(directory, "check-next-parity.cjs");
    expect(native.exitCode).toBe(1);
    expect(native.output).toContain('Use next/link instead of <a href="/settings">');
    mkdirSync(resolve(directory, "src/i18n"), { recursive: true });
    writeFileSync(resolve(directory, "src/i18n/routing.ts"), "export const Link = 1;\n");
    const localized = runScript(directory, "check-next-parity.cjs");
    expect(localized.exitCode).toBe(1);
    expect(localized.output).toContain('Use "@/i18n/routing" instead of <a href="/settings">');
  });

  test("parser diagnostics fail closed with the source path", () => {
    const { directory } = fixture();
    mkdirSync(resolve(directory, "src/app"), { recursive: true });
    writeFileSync(resolve(directory, "src/app/page.tsx"), "export default function Page( {\n");
    const result = runScript(directory, "check-next-parity.cjs");
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("Parser diagnostics in src/app/page.tsx");
    expect(result.output).not.toContain("skipped");
  });
});
```

- [ ] **Step 2: Run RED**

```bash
bun test tests/unit/lint-scripts-template.test.ts --timeout 100000
```

Expected: the root-manifest assertion fails because neither generated root declares OXC; emitted-CJS lint fails on RTL `no-useless-escape` and dead `srcAttr`; Next/navigation/alias assertions fail because host TypeScript 7.0.2 has no compiler API and current scripts throw a TypeError instead of their policy diagnostic; malformed input does not produce the required parser diagnostic.

- [ ] **Step 3: Emit one fail-closed OXC helper**

Emit `scripts/lib/oxc.cjs` with these concrete APIs:

```js
const { parseSync } = require("oxc-parser");
const path = require("node:path");

function toPosix(value) {
  return value.replaceAll("\\", "/");
}
function relative(file) {
  return toPosix(path.relative(process.cwd(), file));
}
function language(file) {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".jsx")) return "jsx";
  return undefined;
}
function parseOwned(file, source) {
  const result = parseSync(file, source, { sourceType: "module", lang: language(file) });
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => error.message).join("; ");
    throw new Error(`Parser diagnostics in ${relative(file)}: ${details}`);
  }
  return result.program;
}
function walk(root, visit) {
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    visit(node);
    for (const [key, child] of Object.entries(node)) {
      if (["loc", "range", "start", "end"].includes(key)) continue;
      if (child && typeof child === "object") stack.push(child);
    }
  }
}
function stringValue(node) {
  return node && typeof node === "object" && typeof node.value === "string" ? node.value : null;
}
function sourceValue(node) {
  return stringValue(node?.source);
}
function positionOf(source, node) {
  const end = Number.isInteger(node?.start) ? node.start : 0;
  let line = 1;
  let column = 1;
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}
function importDeclarations(program) {
  const imports = [];
  walk(program, (node) => {
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      sourceValue(node)
    )
      imports.push(node);
  });
  return imports;
}
function moduleReferences(program) {
  const references = [];
  walk(program, (node) => {
    const declarationSource = sourceValue(node);
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      declarationSource
    )
      references.push({ node, specifier: declarationSource, kind: node.type });
    if (node.type === "ImportExpression") {
      const specifier = stringValue(node.source);
      if (specifier) references.push({ node, specifier, kind: "ImportExpression" });
    }
    if (node.type === "CallExpression") {
      const first = node.arguments?.[0];
      const specifier = stringValue(first);
      const isRequire = node.callee?.type === "Identifier" && node.callee.name === "require";
      const isImport = node.callee?.type === "Import";
      if (specifier && (isRequire || isImport)) {
        references.push({ node, specifier, kind: isRequire ? "require" : "import()" });
      }
    }
  });
  return references;
}
function importedNames(node) {
  return (node.specifiers ?? [])
    .filter((specifier) => specifier.type === "ImportSpecifier")
    .map(
      (specifier) => specifier.imported?.name ?? specifier.imported?.value ?? specifier.local?.name,
    )
    .filter((name) => typeof name === "string");
}
function jsxName(node) {
  if (node?.type === "JSXIdentifier") return node.name;
  if (node?.type === "JSXNamespacedName") return `${node.namespace.name}:${node.name.name}`;
  return null;
}
function jsxAttribute(opening, name) {
  return (
    (opening?.attributes ?? []).find(
      (attribute) => attribute.type === "JSXAttribute" && jsxName(attribute.name) === name,
    ) ?? null
  );
}
function jsxAttributeString(opening, name) {
  const attribute = jsxAttribute(opening, name);
  const value = attribute?.value;
  if (!value) return null;
  if (typeof value.value === "string") return value.value;
  const expression = value.type === "JSXExpressionContainer" ? value.expression : null;
  return typeof expression?.value === "string" ? expression.value : null;
}
function jsxOpenings(program) {
  const openings = [];
  walk(program, (node) => {
    if (node.type === "JSXOpeningElement") openings.push(node);
  });
  return openings;
}
module.exports = {
  importDeclarations,
  importedNames,
  jsxAttribute,
  jsxAttributeString,
  jsxName,
  jsxOpenings,
  parseOwned,
  positionOf,
  relative,
  sourceValue,
  moduleReferences,
  toPosix,
  walk,
};
```

Each consuming script invokes its complete scan through this exact fail-closed boundary; it does not continue with a partial file set:

```js
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
```

- [ ] **Step 4: Port the three TypeScript-API scripts and make navigation capability-aware**

- Alias: read `moduleReferences(program)` and retain the current blanket non-style relative-reference diagnostic until Task 7 changes ownership semantics.
- Navigation: inspect only static `ImportDeclaration` records. Resolve the source root and capability once per file:

```js
function sourceRootFor(file) {
  const normalized = toPosix(file);
  const marker = normalized.includes("/apps/web/src/") ? "/apps/web/src/" : "/src/";
  return normalized.slice(0, normalized.indexOf(marker) + marker.length - 1);
}
function hasI18nRouting(file) {
  return fs.existsSync(path.join(sourceRootFor(file), "i18n", "routing.ts"));
}
```

When `hasI18nRouting(file)` is false, allow framework-native `next/link` and `next/navigation`. When true, reject `next/link` and the existing disallowed `next/navigation` names with `Use "@/i18n/routing"`; keep the exact allowlist for Next APIs that the routing facade does not replace.

- Next parity: iterate `jsxOpenings(program)`; raw `<img>` always recommends `next/image`. For an internal raw anchor, recommend `next/link` when i18n routing is absent and `"@/i18n/routing"` when present. Use `positionOf(source, opening)` and remove dead `srcAttr`.

All three format findings as `relativePath:line:column message`; none reads `node.loc`. Alias and navigation consumers likewise compute diagnostics with `positionOf(source, reference.node)`.

In the emitted RTL regular expressions, represent a backtick as `\x60` rather than emitting `\``. For example:

```js
/(?:^|\s)(?:[^\s"'\x60]+:)*text-left(?=$|\s|["'\x60])/;
```

- [ ] **Step 5: Declare the already-pinned parser at both generated roots**

Add exact (no caret) `"oxc-parser": v.tooling["oxc-parser"]` to the monorepo root `devDependencies` and every single root manifest branch that emits these scripts. Do not modify the existing `0.139.0` catalog entry.

- [ ] **Step 6: Run GREEN**

```bash
bun test tests/unit/lint-scripts-template.test.ts --timeout 100000
bun run check
```

Expected: emitted CJS is clean; RTL, Next, navigation, and alias fixtures produce their intended diagnostics; malformed TSX exits 2 with `Parser diagnostics`; host check exits zero.

- [ ] **Step 7: Commit**

```bash
git add src/templates/tooling/lint-scripts.ts src/templates/root/package.ts src/templates/modes/single/package.ts tests/unit/lint-scripts-template.test.ts
git commit -m "fix: emit OXC-backed semantic lint scripts"
```

---

### Task 3: Restore the shared controlled UI and interaction wiring

**Files:**

- Create: `tests/unit/generated-web-ui-contract.test.ts`
- Create: `tests/unit/generated-frontend-primitives.test.ts`
- Create: `tests/integration/generated-web-primitives.test.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- Modify: `packages/versions/src/index.ts`
- Modify: `src/templates/apps/core.ts`
- Modify: `src/templates/apps/tanstack-core.ts`
- Modify: `src/templates/modes/single/package.ts`
- Modify: `src/templates/apps/fragments/web-ui/missing.ts`
- Modify: `src/templates/apps/fragments/web-ui/form-fields.ts`
- Modify: `src/templates/apps/fragments/web-ui/forms.ts`
- Modify: `src/templates/apps/fragments/web-ui/primitives.ts`
- Modify: `src/templates/apps/fragments/web-ui/feedback.ts`
- Modify: `src/templates/apps/fragments/web-ui/layout.ts`
- Modify: `src/templates/apps/fragments/web-ui/dropdown.ts`
- Modify: `src/templates/apps/fragments/web-ui/overlays.ts`
- Modify: `src/templates/apps/fragments/lib/notifications.ts`
- Modify: `src/templates/apps/fragments/lib/surface-styles.ts`
- Modify: `src/templates/apps/fragments/settings/two-factor-card.ts`
- Modify: `src/templates/apps/fragments/auth/sign-in.ts`
- Modify: `src/templates/apps/fragments/auth/sign-up.ts`
- Modify: `src/templates/apps/fragments/auth/two-factor.ts`
- Modify: `src/templates/apps/fragments/recovery/forgot-password.ts`
- Modify: `src/templates/apps/fragments/recovery/reset-password.ts`
- Modify: `src/templates/auth.ts`

**Interfaces:**

- `Select` is a controlled single-string Base UI root. It requires `items`, forwards `value`, `onValueChange`, and `disabled`, and maps nullable Base UI selection to the local `(value: string) => void` callback only when non-null.
- `SelectContent` owns Portal/Positioner/Popup/List; every `SelectItem` is inside `SelectGroup`.
- `NotificationBell` formats every visible item and calls `onMarkRead(id)` directly from the unread item's Button click.
- `SubmitButton` is a plain submit Button; pending UI is composed by the caller with `Spinner`, never an `isPending` prop.
- Primitive wrappers contain no manual overlay z-index, component-internal icon sizing, Radix-only trigger API, or raw Select implementation. `PasswordField` composes `Field` + `InputGroup`; `SelectField` composes `Field` + a grouped controlled Select.
- `generated-web-primitives.test.ts` uses the generated app's already-declared Playwright stack; no host/runtime dependency is added.

- [ ] **Step 1: Complete the mandatory frontend implementer evidence prompt**

Report the fresh Impeccable loader result, product register, shadcn docs commands, `@base-ui/react@1.6.0` Select declarations, and chosen local components before editing.

- [ ] **Step 2: Write the failing structural interaction contract**

```ts
import { describe, expect, test } from "bun:test";
import { webUiFiles } from "../../src/templates/apps/fragments/web-ui/index.js";
import { notificationsLibFiles } from "../../src/templates/apps/fragments/lib/notifications.js";
import { authPackage } from "../../src/templates/auth.js";
import { settingsTwoFactorCard } from "../../src/templates/apps/fragments/settings/two-factor-card.js";

const content = (files: Array<{ path: string; content: string }>, path: string): string =>
  files.find((file) => file.path === path)?.content ?? "";

describe("shared web UI contracts", () => {
  test("Select is controlled Base UI composition", () => {
    const source = content(webUiFiles(), "apps/web/src/components/ui/select.tsx");
    expect(source).toContain('from "@base-ui/react/select"');
    expect(source).toContain("<BaseSelect.Root");
    expect(source).toContain("items={resolvedItems}");
    expect(source).toContain("value={value}");
    expect(source).toContain("onValueChange={handleValueChange}");
    expect(source).toContain("disabled={disabled}");
    expect(source).toContain("BaseSelect.Positioner");
    expect(source).toContain("BaseSelect.List");
    expect(source).toContain("export const SelectGroup");
    expect(source).not.toContain("<button");
  });

  test("SelectField supplies items and groups item children", () => {
    const source = content(webUiFiles(), "apps/web/src/components/form-fields/SelectField.tsx");
    expect(source).toContain("<Select items={options}");
    expect(source).toContain("<SelectGroup>");
    expect(source).toContain("</SelectGroup>");
  });

  test("notification items format content and mark unread items from the click", () => {
    const source = content(notificationsLibFiles(), "apps/web/src/components/NotificationBell.tsx");
    expect(source).toContain("formatNotification(notification.type, notification.payload)");
    expect(source).toContain("onClick={() => onMarkRead?.(notification.id)}");
    expect(source).toContain("<PopoverTitle>Notifications</PopoverTitle>");
    expect(source).toContain("<Empty>");
    expect(source).not.toContain('<Bell className="size-5"');
  });

  test("shared auth output has no stale pending or callback bindings", () => {
    const form = content(webUiFiles(), "apps/web/src/components/ui/form.tsx");
    expect(form).not.toContain("isPending?:");
    const twoFactor = settingsTwoFactorCard().content;
    expect(twoFactor).not.toContain("import { Button }");
    expect(twoFactor).not.toContain("as unknown as");
    const auth = content(authPackage(), "packages/auth/src/server.ts");
    expect(auth).not.toContain("({ user, url, token })");
    expect(auth).not.toContain("as unknown as");
  });
});
```

- [ ] **Step 3: Run RED**

```bash
bun test tests/unit/generated-web-ui-contract.test.ts --timeout 100000
```

Expected: failures identify the div Select stub, absent grouped items, unused notification formatter/action, `isPending`, stale Button import, and unused callback tokens.

- [ ] **Step 4: Prove the configured icon dependency and declare it**

```bash
npm view lucide-react@1.33.0 version peerDependencies engines --json
```

Expected: exact `1.33.0`, React peer includes React 19. Add only `"lucide-react": "1.33.0"` to `v.ui`; declare it in Next/TanStack web app manifests and flat `buildDeps`. Those same three manifests also declare Task 1's `server-only` pin because their emitted feature-flag modules import it directly. Do not change an existing pin.

- [ ] **Step 5: Emit a controlled Base UI Select**

Use this public shape; keep styling on the local wrapper and use regular React 19 `ref` props rather than adding new `forwardRef` wrappers:

```tsx
export interface SelectOption {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
}

export interface SelectProps {
  children: React.ReactNode;
  items: readonly SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
}

export function Select({
  items,
  placeholder,
  value,
  onValueChange,
  disabled,
  ...props
}: SelectProps) {
  const resolvedItems = placeholder ? [{ label: placeholder, value: null }, ...items] : items;
  const handleValueChange = (next: string | null): void => {
    if (next !== null) onValueChange?.(next);
  };
  return (
    <BaseSelect.Root<string>
      items={resolvedItems}
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      {...props}
    />
  );
}
```

Compose `Trigger`, `Value`, `Portal`, `Positioner alignItemWithTrigger={false}`, `Popup`, `List`, `Group`, `Item`, `ItemIndicator`, and `ItemText`. Use lucide objects from the configured icon library with no icon sizing classes. `SelectField` passes `items={options}` and wraps mapped `SelectItem` nodes in `SelectGroup`.

- [ ] **Step 6: Implement the notification interaction**

Compose `Popover`, `PopoverTrigger render={<Button ... />}`, `PopoverContent`, `PopoverTitle`, `PopoverDescription`, local `Empty`, `Badge`, and `Button`. The item action is exactly:

```tsx
const formatted = formatNotification(notification.type, notification.payload);
return (
  <Button
    key={notification.id}
    type="button"
    variant="ghost"
    disabled={notification.readAt !== null}
    onClick={() => onMarkRead?.(notification.id)}
  >
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="truncate font-medium">{formatted.title}</span>
      {formatted.message ? (
        <span className="line-clamp-2 text-muted-foreground">{formatted.message}</span>
      ) : null}
    </span>
  </Button>
);
```

The Bell icon has `data-icon="inline-start"` and no manual size class. The click performs mark-read directly; do not model it as state plus Effect.

- [ ] **Step 7: Remove stale auth/2FA wiring and compose pending UI**

Remove the unused Button import. Read `session?.user.twoFactorEnabled`, `result.data.totpURI`, and `result.data.backupCodes` directly from the configured Better Auth client, deriving optimistic state during render rather than mirroring it through an Effect. Remove `token` from callbacks that use only `user` and `url`. Replace the magic-link fallback/casts with the already-emitted `MagicLinkEmail` component and the typed four-argument `sendEmail` call. Make `SubmitButton` accept only `ButtonProps` plus a React 19 `ref` prop. At every existing `form.Subscribe`, replace `isPending={isSubmitting}` with composed local `Spinner` content and `disabled={!canSubmit || isSubmitting}`.

- [ ] **Step 8: Close every shared primitive gap and add structural guards**

Apply the inventory mechanically:

- `SelectField` uses `Field`, `FieldLabel`, `FieldDescription`, stable `aria-describedby`, `SelectGroup`, and the controlled Base Select.
- `PasswordField` uses `Field` + `InputGroup` + `InputGroupInput` + `InputGroupAddon`; its Button remains keyboard reachable and Eye/EyeOff carry `data-icon` with no size class.
- Checkbox/Bell/Select indicators have no component-internal icon sizing.
- Remove every manual `z-*` token from alert-dialog, dialog, dropdown, popover, select, sheet, tooltip, and `surface-styles.ts`; Base UI portal/positioner/popup ownership supplies stacking.
- `SubmitButton` composes local `Spinner`; it has no pending boolean and no hand-built spinner.

`generated-frontend-primitives.test.ts` generates monorepo and single default outputs, counts the shared inventory categories, and asserts zero primitive-owned records after this task. It also parses JSX and rejects raw `button`, `input`, or `select` only in files whose approved local primitive is being tested, avoiding false positives for semantic document markup.

Extend the unsafe baseline test so occurrences assigned to these Task 3 owners are absent: `web-ui/missing.ts`, `web-ui/form-fields.ts`, `web-ui/forms.ts`, `web-ui/primitives.ts`, `web-ui/feedback.ts`, `web-ui/layout.ts`, `web-ui/dropdown.ts`, `web-ui/overlays.ts`, `lib/notifications.ts`, `lib/surface-styles.ts`, `settings/two-factor-card.ts`, and `auth.ts`.

- [ ] **Step 9: Add rendered keyboard/focus/value tests with existing Playwright**

`generated-web-primitives.test.ts` generates the next-monorepo corner in a private temp root, installs it, writes the client route plus the exact spec path `apps/web/e2e/__primitive-contract.spec.ts`, and composes only emitted local components:

```tsx
const [role, setRole] = useState("user");
const [marked, setMarked] = useState("none");
<Field><FieldLabel htmlFor="name">Name</FieldLabel><InputGroup><InputGroupInput id="name" /></InputGroup></Field>
<Field><FieldLabel id="role-label">Role</FieldLabel>
  <Select items={roles} value={role} onValueChange={setRole}>
    <SelectTrigger aria-labelledby="role-label"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectGroup></SelectContent>
  </Select>
</Field>
<Select items={roles} value="user" disabled><SelectTrigger aria-label="Disabled role"><SelectValue /></SelectTrigger></Select>
<NotificationBell notifications={notifications} onMarkRead={setMarked} />
<output data-testid="role-value">{role}</output><output data-testid="marked-value">{marked}</output>
```

Define focused harness interfaces `reservePort(): Promise<number>`, `startServer(root, port, env): RunningServer`, `waitForHttp200(url, child, timeoutMs)`, `runLocalPlaywright(webRoot, args, env)`, and `terminateProcessTree(child)`. `reservePort` binds `127.0.0.1:0`, reads the assigned port, then closes the socket. Before launch assert `apps/web/node_modules/@playwright/test/package.json` exists. For each target create one merged environment object, `{ ...process.env, NEXT_PUBLIC_APP_URL: url, VITE_APP_URL: url }`, where `url` is `http://127.0.0.1:<port>`. Pass that same object identity to Playwright install, Playwright test, generated server, and any route-generation subprocess; no helper rebuilds or mutates it.

For the Next monorepo target, `startServer` uses the exact cwd `<generated-root>/apps/web` and exact command `bun run dev -- --hostname 127.0.0.1 --port <port>`. Resolve `bun` with `Bun.which("bun")`, fail if absent, and pass the merged environment unchanged to `spawn`.

Resolve `bunx` with `Bun.which("bunx")` and fail if absent. Run exactly once per integration test root:

```ts
runLocalPlaywright(webRoot, ["--bun", "--no-install", "playwright", "install", "chromium"], env);
runLocalPlaywright(
  webRoot,
  ["--bun", "--no-install", "playwright", "test", "e2e/__primitive-contract.spec.ts"],
  env,
);
```

Spawn the app with `windowsHide: true`; on non-Windows also use `detached: true` so it owns a process group. `waitForHttp200` polls the fixture URL until HTTP 200, but immediately throws with captured stderr if the child exits. In `finally`, Windows runs `taskkill /PID <pid> /T /F` with `windowsHide: true`; POSIX sends `SIGTERM` to `-pid`, waits, then sends `SIGKILL` to the group if necessary. Only after termination does it recursively remove the verified temp root.

The Playwright spec proves: clicking the Name label focuses its input; Tab reaches the role trigger; Space opens it; ArrowDown + Enter changes the controlled value to `admin`; the disabled trigger cannot open; the notification trigger and unread item are keyboard reachable; Enter calls mark-read and updates `marked-value`; focus remains visible after each keyboard action. No new test dependency is installed because `@playwright/test` is already a generated web dev dependency.

- [ ] **Step 10: Run GREEN and lint the generated shared corner**

```bash
bun test tests/unit/generated-web-ui-contract.test.ts tests/unit/generated-frontend-primitives.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/generation-matrix.test.ts --timeout 100000
bun test tests/integration/generated-web-primitives.test.ts --timeout 300000
bun run build
```

Expected: focused tests, matrix, and build pass. The installed corner is deliberately reserved for Task 7 because the shared Form type and alias policy remain RED until Tasks 5 and 7; no intermediate failure is reclassified or suppressed.

- [ ] **Step 11: Run the mandatory fresh frontend reviewer prompt**

Require a fresh loader/register/docs report and an `APPROVED` verdict with no open Critical/Important finding.

- [ ] **Step 12: Commit**

```bash
git add packages/versions/src/index.ts src/templates/apps/core.ts src/templates/apps/tanstack-core.ts src/templates/modes/single/package.ts src/templates/apps/fragments/web-ui/missing.ts src/templates/apps/fragments/web-ui/form-fields.ts src/templates/apps/fragments/web-ui/forms.ts src/templates/apps/fragments/web-ui/primitives.ts src/templates/apps/fragments/web-ui/feedback.ts src/templates/apps/fragments/web-ui/layout.ts src/templates/apps/fragments/web-ui/dropdown.ts src/templates/apps/fragments/web-ui/overlays.ts src/templates/apps/fragments/lib/notifications.ts src/templates/apps/fragments/lib/surface-styles.ts src/templates/apps/fragments/settings/two-factor-card.ts src/templates/apps/fragments/auth/sign-in.ts src/templates/apps/fragments/auth/sign-up.ts src/templates/apps/fragments/auth/two-factor.ts src/templates/apps/fragments/recovery/forgot-password.ts src/templates/apps/fragments/recovery/reset-password.ts src/templates/auth.ts tests/unit/generated-web-ui-contract.test.ts tests/unit/generated-frontend-primitives.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/integration/generated-web-primitives.test.ts
git commit -m "fix: restore generated web interaction contracts"
```

---

### Task 4: Close flat dependencies, localize flags, and unify auth email sending

**Files:**

- Modify: `tests/unit/generated-import-closure.test.ts`
- Create: `tests/unit/single-next-contract.test.ts`
- Create: `tests/unit/email-capability.test.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- Modify: `src/templates/modes/single/package.ts`
- Modify: `src/templates/modes/single/composers/next.ts`
- Modify: `src/templates/modes/single/composers/tanstack.ts`
- Modify: `src/templates/apps/core.ts`
- Modify: `src/templates/apps/tanstack-core.ts`
- Modify: `src/templates/apps/fragments/web-lib.ts`
- Modify: `src/templates/apps/fragments/lib/feature-flags.ts`
- Modify: `src/templates/packages/config.ts`
- Modify: `src/templates/modes/single/fragments/env.ts`
- Modify: `src/templates/shared/analytics-env.ts`
- Modify: `src/templates/shared/env/builders.ts`
- Modify: `src/templates/email.ts`
- Modify: `src/templates/auth.ts`
- Modify: `src/templates/modes/single/server/auth.ts`
- Modify: `src/templates/modes/single/fragments/agents-content.ts`
- Modify: `src/templates/modes/single/index.ts`
- Modify: `src/templates/modes/single/pages/auth.ts`
- Modify: `src/templates/modes/single/pages/password.ts`
- Modify: `src/templates/modes/single/tanstack/pages/auth.ts`
- Modify: `src/templates/modes/monorepo/index.ts`
- Modify: `src/templates/modes/monorepo/auth-composer.ts`
- Modify: `src/templates/modes/monorepo/services-composer.ts`
- Modify: `src/templates/modes/monorepo/apps-composer.ts`
- Modify: `src/templates/apps/fragments/recovery/index.ts`
- Modify: `src/templates/apps/fragments/auth/sign-in.ts`

**Interfaces:**

- Each mode computes `hasEmail` once from normalized addons/config and passes it to package, auth, app/recovery, service, environment, and documentation composers.
- `buildDeps(..., hasEmail)` and monorepo package manifests declare email dependencies only when email files remain emitted.
- `webLibFiles(base, framework)` selects `@repo/config` for monorepo and `@/lib/env` for single. Server flags read typed `ANALYTICS_DISABLED`; clients read exactly one framework public key.
- `sendEmail(to, subject, Component, props)` throws on placeholder configuration, rendering failure, Resend error, or missing response; every auth callback awaits it and lets failure propagate.
- Unused Motion starter output is not emitted; no Motion dependency is added.

- [ ] **Step 1: Complete the frontend evidence prompt for the feature-flag client boundary**

Report fresh Impeccable product-register and React/Next evidence. This task changes client/server flag modules even though it does not redesign a screen.

- [ ] **Step 2: Write the eight-corner email capability contract and the failing single contract**

Create `email-capability.test.ts` with mode × framework × enabled/disabled configurations:

```ts
const EMAIL_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    ([false, true] as const).map((email) => ({
      key: `${mode}/${framework}/email-${email ? "on" : "off"}`,
      email,
      files: generateProjectFiles(
        projectConfigSchema.parse({
          name: "demo",
          mode,
          framework,
          preset: "custom",
          auth: true,
          api: true,
          email,
          analytics: false,
          database: "postgres",
          billing: [],
          apps: ["web"],
        }),
      ),
    })),
  ),
);
```

For enabled corners assert: the mode-correct email implementation exists; root/package dependencies include Resend and all three React Email packages; auth server contains `sendResetPassword` and `sendVerificationEmail`; recovery route paths and `/forgot-password` navigation exist; `.env.example` contains `RESEND_API_KEY`. For disabled corners assert every one is absent, including `@repo/email`, email imports, hooks, recovery paths, navigation strings, route registrations, and Resend environment lines. In every enabled send implementation assert failure branches `throw` and never return `{ success: false }`.

Create `tests/unit/single-next-contract.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const filesConfig = projectConfigSchema.parse({
  name: "demo",
  runtime: "bun",
  version: "0.1.0",
  mode: "single",
  billing: ["stripe"],
  features: [],
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
});
const files = generateProjectFiles(filesConfig);
const read = (path: string): string => files.find((file) => file.path === path)?.content ?? "";

describe("single Next boundary contracts", () => {
  test("uses local typed env for flags", () => {
    const server = read("src/lib/feature-flags.ts");
    const client = read("src/lib/feature-flags-client.ts");
    expect(server).toContain('from "@/lib/env"');
    expect(server).toContain('env.ANALYTICS_DISABLED !== "true"');
    expect(client).toContain('from "@/lib/env"');
    expect(client).toContain('env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true"');
    expect(`${server}\n${client}`).not.toContain("as unknown as");
  });

  test("TanStack client flags use only the VITE public key", () => {
    const tanstackFiles = generateProjectFiles(
      projectConfigSchema.parse({
        ...filesConfig,
        framework: "tanstack-start",
      }),
    );
    const client =
      tanstackFiles.find(({ path }) => path === "src/lib/feature-flags-client.ts")?.content ?? "";
    expect(client).toContain('env.VITE_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain("NEXT_PUBLIC_ANALYTICS_DISABLED");
  });

  test("auth sends the typed ResetPassword component", () => {
    const source = read("src/server/auth/index.ts");
    expect(source).toContain(
      'import ResetPasswordEmail from "@/server/email/templates/ResetPassword"',
    );
    expect(source).toContain("await sendEmail(user.email, subject, ResetPasswordEmail,");
    expect(source).not.toContain("forgotPasswordTemplate");
    expect(read("src/server/email/send.ts")).not.toContain("sendEmailHtml");
  });
});
```

- [ ] **Step 3: Run RED**

```bash
bun test tests/unit/generated-import-closure.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts --timeout 100000
```

Expected: FAIL for `motion`, `@repo/config`, the three missing `@react-email/*` declarations, email-disabled files/imports/routes/env leakage, the incompatible auth object call, and send failures that return false instead of throwing.

- [ ] **Step 4: Make flat dependencies follow emitted capabilities**

Add a final `hasEmail = true` parameter to `singlePackageJson` and `singlePackageJsonTanstack`, pass `hasAddon(addonMap, "email")` explicitly from both composers, remove the current unconditional `resend` entries from both base dependency objects, and emit:

```ts
"server-only": `^${v.runtime["server-only"]}`,
...(hasEmail
  ? {
      "@react-email/components": `^${v.email["@react-email/components"]}`,
      "@react-email/render": `^${v.email["@react-email/render"]}`,
      "@react-email/tailwind": `^${v.email["@react-email/tailwind"]}`,
      resend: `^${v.email.resend}`,
    }
  : {}),
```

Keep the Task 3 lucide declaration. Remove `animationsLibFiles` from `webLibFiles`; no emitted component imports it, so adding Motion would be an unjustified dependency. Add a test assertion that `src/lib/animations.ts` is absent.

In `single/index.ts` and `monorepo/index.ts`, compute `const hasEmail = hasAddon(addonMap, "email")` once before composing files. Pass it to package, auth, services, app/recovery, environment, and agent-doc composers. Apply these exact branches:

```ts
...(hasEmail ? emailFiles({ mode: "single", runtime }, runtime) : []),
...(hasEmail ? recoveryFiles(framework) : []),
authPackage(framework, addonMap, { hasEmail }),
```

The monorepo branch calls `emailFiles({ mode: "monorepo", runtime }, runtime)` under the same predicate.

When false, `authPackage` omits `@repo/email`, React Email exports, `sendResetPassword`, `sendVerificationEmail`, and email-backed magic-link setup. Sign-in content omits the Forgot link. Next/TanStack route composers and single/monorepo route registrations omit forgot/reset pages. Environment builders receive `includeResend: hasEmail`. Do not generate then substring-filter these artifacts.

- [ ] **Step 5: Make feature flags mode/framework-aware without casts**

Change the signature to:

```ts
export function webLibFiles(
  base = "apps/web/src",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): TemplateFile[];
```

Pass `nextjs` or `tanstack-start` at all four call sites. In `featureFlagsLibFiles`, choose:

```ts
const configImport = base === "src" ? "@/lib/env" : "@repo/config";
const clientAnalyticsDisabledKey =
  framework === "tanstack-start" ? "VITE_ANALYTICS_DISABLED" : "NEXT_PUBLIC_ANALYTICS_DISABLED";
```

Add the already-manifested server key to both config emitters:

```ts
ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
// runtimeEnv
ANALYTICS_DISABLED: process.env.ANALYTICS_DISABLED,
```

Add `ANALYTICS_DISABLED=false` alongside the public analytics-disabled line in both `.env.example` and `.env.local` builders. Then emit distinct server and client modules:

```ts
// feature-flags.ts, both frameworks
export const FEATURE_FLAGS = {
  ANALYTICS: env.ANALYTICS_DISABLED !== "true",
} as const;
```

```ts
// feature-flags-client.ts, Next
export const CLIENT_FEATURE_FLAGS = {
  ANALYTICS: env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true",
} as const;
```

```ts
// feature-flags-client.ts, TanStack
export const CLIENT_FEATURE_FLAGS = {
  ANALYTICS: env.VITE_ANALYTICS_DISABLED !== "true",
} as const;
```

The three keys already exist in `GLOBAL_ENV_KEYS`; do not add a second flag family or cast the env object.

- [ ] **Step 6: Use one typed component-email API**

Delete `sendEmailHtml`, `legacyForgotWrapper`, `legacyVerificationWrapper`, and their emitted files. Make the one exported API throw on every failure:

```ts
export async function sendEmail<T>(
  to: string | string[],
  subject: string,
  EmailComponent: React.ComponentType<T>,
  componentProps: T,
  options?: SendEmailOptions,
): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.includes("REPLACE_WITH")) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const html = await render(React.createElement(EmailComponent, componentProps));
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: options?.from ?? env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });
  if (error) throw new Error(error.message ?? "Email delivery failed");
  if (!data?.id) throw new Error("Email provider returned no delivery ID");
  return { id: data.id };
}
```

In both single Postgres server auth variants and the monorepo auth server, emit only when `hasEmail`:

```ts
import { sendEmail } from "@/server/email";
import ResetPasswordEmail from "@/server/email/templates/ResetPassword";

sendResetPassword: async ({ user, url }) => {
  const appName = process.env.APP_NAME ?? "GhostInit";
  const subject = `Reset your password - ${appName}`;
  await sendEmail(
    user.email,
    subject,
    ResetPasswordEmail,
    { link: url, appName },
  );
},
```

Update the generated agent text to name this component API, not `forgotPasswordTemplate`.

Remove every `remove-in-stabilization` unsafe-baseline occurrence assigned to the Task 4 feature-flag, auth, recovery, and single page owners, and assert those disposition IDs are absent in `generated-unsafe-syntax-baseline.test.ts`.

- [ ] **Step 7: Run GREEN**

```bash
bun test tests/unit/generated-import-closure.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/generation-matrix.test.ts --timeout 100000
bun run build
```

Expected: closure and single boundary tests pass; disabled email has no artifact/dependency leakage.

- [ ] **Step 8: Run a fresh frontend reviewer pass and commit**

After `APPROVED`:

```bash
git add tests/unit/generated-import-closure.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts src/templates/modes/single/package.ts src/templates/modes/single/composers/next.ts src/templates/modes/single/composers/tanstack.ts src/templates/modes/single/index.ts src/templates/modes/single/pages/auth.ts src/templates/modes/single/pages/password.ts src/templates/modes/single/tanstack/pages/auth.ts src/templates/modes/monorepo/index.ts src/templates/modes/monorepo/auth-composer.ts src/templates/modes/monorepo/services-composer.ts src/templates/modes/monorepo/apps-composer.ts src/templates/apps/core.ts src/templates/apps/tanstack-core.ts src/templates/apps/fragments/recovery/index.ts src/templates/apps/fragments/auth/sign-in.ts src/templates/apps/fragments/web-lib.ts src/templates/apps/fragments/lib/feature-flags.ts src/templates/packages/config.ts src/templates/modes/single/fragments/env.ts src/templates/shared/analytics-env.ts src/templates/shared/env/builders.ts src/templates/email.ts src/templates/auth.ts src/templates/modes/single/server/auth.ts src/templates/modes/single/fragments/agents-content.ts
git commit -m "fix: close generated single-mode runtime contracts"
```

---

### Task 5: Type single-mode forms and Better Auth flows end to end

**Files:**

- Modify: `tests/unit/single-next-contract.test.ts`
- Modify: `tests/unit/generated-frontend-primitives.test.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- Modify: `tests/integration/generated-web-primitives.test.ts`
- Modify: `src/templates/apps/fragments/web-ui/forms.ts`
- Modify: `src/templates/modes/single/pages/auth.ts`
- Modify: `src/templates/modes/single/pages/password.ts`
- Modify: `src/templates/modes/single/pages/two-factor.ts`
- Modify: `src/templates/modes/single/pages/settings.ts`
- Modify: `src/templates/modes/single/pages/admin.ts`
- Modify: `src/templates/modes/single/fragments/kernel.ts`
- Modify: `src/templates/apps/fragments/admin/user-row.ts`
- Modify: `src/templates/apps/fragments/admin/users-page.ts`
- Modify: `src/templates/apps/fragments/admin/create-user-page.ts`
- Modify: `src/templates/apps/fragments/admin/index.ts`
- Modify: `src/templates/apps/fragments/settings/danger-card.ts`
- Modify: `src/templates/apps/fragments/settings/tanstack-page.ts`
- Modify: `src/templates/apps/fragments/header/header.ts`
- Modify: `src/templates/modes/single/components/header.ts`
- Modify: `src/templates/modes/single/tanstack/pages/admin.ts`
- Modify: `src/templates/modes/single/tanstack/pages/auth.ts`
- Modify: `src/templates/modes/single/tanstack/components.ts`

**Interfaces:**

- `FormController` exposes only `handleSubmit(): Promise<void>`; it preserves the concrete `useForm` inference instead of restating invariant generic slots.
- `UserRole` is `"user" | "admin"`; `AdminUser.role` and admin callbacks use it.
- Better Auth plugin results are consumed directly from 1.6.23 inferred types.
- `AdminUser` is imported from its owning `@/lib/kernel` module, never from a hook that does not export it.
- Every Next/TanStack, monorepo/single admin/settings/header consumer uses local Field/Input/Select/Empty and Base `render` trigger composition; the combined 71-record primitive inventory is zero.

- [ ] **Step 1: Complete the fresh frontend implementer evidence prompt and reread Better Auth guidance**

In addition to the mandatory frontend report, read the Better Auth core, security, email/password, and two-factor skills. Re-run the installed-type searches from the research baseline.

- [ ] **Step 2: Expand the failing single contract**

Add these assertions:

```ts
test("preserves TanStack inference and composes pending state", () => {
  const form = read("src/components/ui/form.tsx");
  expect(form).toContain("interface FormController");
  expect(form).toContain("handleSubmit(): Promise<void>");
  expect(form).not.toContain("FormApi<");
  expect(form).not.toContain("isPending");
});

test("uses Better Auth 1.6.23 inferred contracts without type escapes", () => {
  const affectedPaths = [
    "src/components/ui/form.tsx",
    "src/app/sign-in/page.tsx",
    "src/app/forgot-password/page.tsx",
    "src/app/reset-password/page.tsx",
    "src/app/2fa/page.tsx",
    "src/app/settings/components/profile-card.tsx",
    "src/app/settings/components/two-factor-card.tsx",
    "src/app/admin/users/hooks/use-admin-users.ts",
    "src/app/admin/users/components/user-row.tsx",
    "src/app/admin/users/create/page.tsx",
    "src/lib/kernel.ts",
  ];
  const owned = files
    .filter(({ path }) => affectedPaths.includes(path))
    .map(({ content }) => content)
    .join("\n");
  expect(owned).not.toMatch(/\bas unknown as\b|:\s*any\b|@ts-ignore/);
  expect(read("src/app/forgot-password/page.tsx")).toContain("authClient.requestPasswordReset");
  expect(read("src/app/sign-in/page.tsx")).toContain("context.data.twoFactorRedirect");
  expect(read("src/app/settings/components/two-factor-card.tsx")).toContain("result.data.totpURI");
  expect(read("src/app/settings/components/two-factor-card.tsx")).toContain(
    "result.data.backupCodes",
  );
});

test("owns a closed role union and uses the local Select", () => {
  const kernel = read("src/lib/kernel.ts");
  expect(kernel).toContain('export const USER_ROLES = ["user", "admin"] as const');
  expect(kernel).toContain("export type UserRole = (typeof USER_ROLES)[number]");
  expect(kernel).toContain("export interface AdminUser");
  expect(read("src/app/admin/users/components/user-row.tsx")).toContain('from "@/lib/kernel"');
  const create = read("src/app/admin/users/create/page.tsx");
  expect(create).toContain("<Select items={ROLE_OPTIONS}");
  expect(create).not.toContain("<select");
});
```

- [ ] **Step 3: Run RED**

```bash
bun test tests/unit/single-next-contract.test.ts --timeout 100000
```

Expected: FAIL on the twelve-slot `FormApi`, `as unknown as string`, `u: any`, fallback `forgetPassword`, role assertion, raw select, and wrong `AdminUser` import.

- [ ] **Step 4: Narrow the local Form contract and compose loading state**

Replace the invariant generic type with:

```tsx
export interface FormController {
  handleSubmit(): Promise<void>;
}

export interface FormProps {
  form: FormController;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  className?: string;
}
```

Keep field inference at each concrete `useForm` call. `SubmitButton` is a regular React 19 component over `ButtonProps`. Each form uses `form.Subscribe` and composes:

```tsx
{
  ([canSubmit, isSubmitting]) => (
    <SubmitButton disabled={!canSubmit || isSubmitting}>
      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
      {isSubmitting ? "Submitting…" : "Submit"}
    </SubmitButton>
  );
}
```

Use action-specific text. Do not put controlled-input updates in a transition and do not replay the submit from an Effect.

- [ ] **Step 5: Consume Better Auth results at their real types**

Apply these exact contracts:

```ts
await authClient.signIn.email(
  { email: value.email, password: value.password, callbackURL: "/dashboard" },
  {
    onSuccess(context) {
      router.push(context.data.twoFactorRedirect ? "/2fa" : "/dashboard");
    },
    onError(context) {
      setError(context.error.message ?? "Sign in failed");
    },
  },
);
```

```ts
const redirectTo = new URL("/reset-password", window.location.origin).toString();
const result = await authClient.requestPasswordReset({ email: value.email, redirectTo });
```

```ts
const result = await authClient.twoFactor.enable({ password });
if (result.error) {
  setError(result.error.message ?? "Failed to enable two-factor authentication");
  return;
}
setTotpUri(result.data.totpURI);
setBackupCodes(result.data.backupCodes);
```

Use `string[] | null` for backup-code state and render `backupCodes.join("\n")`. Derive `enabled` as `optimisticEnabled ?? session?.user.twoFactorEnabled ?? false`; remove the Effect that mirrors session state. Read `session?.user.name/email/role` directly.

In reset-password, derive URL/token errors during render instead of an Effect. Keep `useSearchParams` inside the existing Suspense client boundary.

- [ ] **Step 6: Close admin roles and Select typing**

Emit:

```ts
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  banned: boolean;
}
export interface UseAdminUsersReturn {
  data: { users: AdminUser[]; total: number } | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  toggleBan: (userId: string, banned: boolean) => Promise<void>;
  setRole: (userId: string, currentRole: UserRole) => Promise<void>;
}
export function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin";
}
```

Map Better Auth users with an inferred callback and `isUserRole(user.role) ? user.role : "user"`. Type `setRole(userId, currentRole: UserRole)` and pass the resulting union directly to `authClient.admin.setRole`.

In the create-user page:

```tsx
const ROLE_OPTIONS = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
] satisfies readonly { label: string; value: UserRole }[];

<Select
  items={ROLE_OPTIONS}
  value={field.state.value}
  onValueChange={(role) => {
    if (isUserRole(role)) field.handleChange(role);
  }}
>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="user">User</SelectItem>
      <SelectItem value="admin">Admin</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>;
```

Import `AdminUser`, `UserRole`, and `isUserRole` from `@/lib/kernel`. Do not re-export an imported type from a hook as a workaround.

- [ ] **Step 7: Close every consumer gap in Next and TanStack variants**

Apply the same explicit composition to shared Next, shared TanStack, single Next, and single TanStack emitters:

- Dialog/Dropdown triggers use Base `render={<Button ... />}` and put their label/content in the trigger body; no direct `asChild` reaches a Base primitive.
- Admin search is `Field` + visible/screen-reader `FieldLabel` + local `Input`, with its description/error IDs wired.
- No-results/users output is the approved full `Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription`/`EmptyContent` composition, not a styled fallback div.
- Create-user role controls use the controlled grouped local Select from Step 6, never raw `<select>`.
- Next and TanStack equivalents import the same local primitives and expose the same label, disabled, focus, and value-change behavior.

Expand `generated-frontend-primitives.test.ts` to enumerate the 36 next-monorepo and 35 single-next reviewed records and their TanStack equivalents. Assert all categories are zero: Base `asChild`, ad-hoc empty state, raw form control, missing Field/InputGroup composition, ungrouped SelectItem, internal icon sizing, manual overlay z-index, nonfunctional Select, partial NotificationBell, and pending boolean/custom spinner.

Parameterize `generated-web-primitives.test.ts` over a Next monorepo project and a TanStack single project. The host harness uses the already-installed Playwright binary from the Next generated app to drive both servers. For the single TanStack target, use the exact cwd `<generated-root>` for both subprocesses: first run `bunx --no-install tsr generate`, then start `bun run dev -- --host 127.0.0.1 --port <port>`. Pass that target's one merged `{ ...process.env, NEXT_PUBLIC_APP_URL: url, VITE_APP_URL: url }` object unchanged to route generation, server start, `runLocalPlaywright(webRoot, installArgs, env)`, and `runLocalPlaywright(webRoot, testArgs, env)`. Both targets run the label/focus/disabled/keyboard/value-change/mark-read assertions from Task 3 and always use the process-tree cleanup path.

Remove the `remove-in-stabilization` entries assigned to Task 5 files, then add those exact disposition-ID assertions to `generated-unsafe-syntax-baseline.test.ts`. Do not broaden the tracked `deferred-v1` policy merely because an unrelated line in the same legacy owner changes.

- [ ] **Step 8: Run GREEN structural, rendered, and build gates**

```bash
bun test tests/unit/single-next-contract.test.ts tests/unit/generated-web-ui-contract.test.ts tests/unit/generated-frontend-primitives.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts --timeout 100000
bun test tests/integration/generated-web-primitives.test.ts --timeout 300000
bun test tests/unit/generation-matrix.test.ts --timeout 100000
bun run build
```

Expected: structural tests, matrix, and build pass. The assertions directly cover the former TS2322/TS2344 Form invariance, TS2339 auth fields/endpoints, TS2345/TS2322 roles, and TS2459 `AdminUser`; the installed gate stays reserved for Task 7 while Stripe and alias failures remain RED.

- [ ] **Step 9: Run the mandatory fresh frontend reviewer prompt and commit**

After `APPROVED`:

```bash
git add tests/unit/single-next-contract.test.ts tests/unit/generated-frontend-primitives.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/integration/generated-web-primitives.test.ts src/templates/apps/fragments/web-ui/forms.ts src/templates/modes/single/pages/auth.ts src/templates/modes/single/pages/password.ts src/templates/modes/single/pages/two-factor.ts src/templates/modes/single/pages/settings.ts src/templates/modes/single/pages/admin.ts src/templates/modes/single/fragments/kernel.ts src/templates/apps/fragments/admin/user-row.ts src/templates/apps/fragments/admin/users-page.ts src/templates/apps/fragments/admin/create-user-page.ts src/templates/apps/fragments/admin/index.ts src/templates/apps/fragments/settings/danger-card.ts src/templates/apps/fragments/settings/tanstack-page.ts src/templates/apps/fragments/header/header.ts src/templates/modes/single/components/header.ts src/templates/modes/single/tanstack/pages/admin.ts src/templates/modes/single/tanstack/pages/auth.ts src/templates/modes/single/tanstack/components.ts
git commit -m "fix: type generated single auth and forms"
```

---

### Task 6: Narrow Stripe 19.1.0 events and analytics cookie sources

**Files:**

- Create: `tests/unit/stripe-analytics-contract.test.ts`
- Create: `tests/unit/stripe-webhook-runtime.test.ts`
- Create: `tests/integration/stripe-webhook-typecheck.test.ts`
- Create: `src/templates/billing/webhooks/providers/stripe-postgres-runtime.ts`
- Modify: `src/templates/billing/webhooks/providers/stripe.ts`
- Modify: `src/templates/billing/schema/tables/webhook_events.ts`
- Modify: `src/templates/analytics/utils.ts`
- Modify: `tests/unit/billing-webhooks.test.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`

**Interfaces:**

- Stripe client construction uses the installed SDK default API version; no broad string assertion.
- `errorMessage(error: unknown)` is the only error-to-message boundary.
- The observed single/monorepo Next + PostgreSQL Stripe switch cases rely on the discriminated `Stripe.Event` union and typed expandable-ID/metadata helpers.
- `stripePostgresRuntimeFile(mode: "monorepo" | "single"): TemplateFile` emits the pure runtime at exactly `apps/web/src/app/api/webhooks/stripe/_stripe-runtime.ts` or `src/app/api/webhooks/stripe/_stripe-runtime.ts`. Each PostgreSQL route imports it through `./_stripe-runtime.js`.
- `_stripe-runtime.ts` imports neither Stripe nor Drizzle. It owns bounded streaming plus verification/transaction orchestration through injected `StripeEventVerifier<Event>` and `StripeDeliveryStore<Context>` ports; only the winning claim runs its handler and marks processed before commit.
- `webhook_events.payload` accepts `string | Record<string, unknown>` so the transaction stores the already-bounded serialized Stripe event while all existing object-valued provider payloads remain valid.
- `CookieSource` is `CookieGetter | Map<string, string>` and narrows by `instanceof Map`.

- [ ] **Step 1: Write the failing boundary contract**

```ts
import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const variants = [
  {
    label: "single/postgres",
    mode: "single",
    database: "postgres",
    path: "src/app/api/webhooks/stripe/route.ts",
    runtimePath: "src/app/api/webhooks/stripe/_stripe-runtime.ts",
    schemaPath: "src/server/db/schema/tables/webhook_events.ts",
  },
  {
    label: "monorepo/postgres",
    mode: "monorepo",
    database: "postgres",
    path: "apps/web/src/app/api/webhooks/stripe/route.ts",
    runtimePath: "apps/web/src/app/api/webhooks/stripe/_stripe-runtime.ts",
    schemaPath: "packages/database/src/schema/tables/webhook_events.ts",
  },
] as const;

const generated = variants.map((variant) => {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "demo",
      mode: variant.mode,
      billing: ["stripe"],
      database: variant.database,
      framework: "nextjs",
      apps: ["web"],
    }),
  );
  const read = (path: string): string => files.find((file) => file.path === path)?.content ?? "";
  return {
    ...variant,
    files,
    read,
    stripe: read(variant.path),
    runtime: read(variant.runtimePath),
    schema: read(variant.schemaPath),
  };
});

describe("generated vendor boundaries", () => {
  for (const variant of generated) {
    test(`${variant.label} uses Stripe 19 event types without unsafe assertion chains`, () => {
      expect(variant.stripe.length).toBeGreaterThan(0);
      expect(variant.stripe).toContain("new Stripe(stripeSecretKey)");
      expect(variant.stripe).not.toContain("apiVersion:");
      expect(variant.stripe).toContain("function errorMessage(error: unknown): string");
      expect(variant.stripe).toContain("string | { id: string } | null | undefined");
      expect(variant.stripe).not.toMatch(/\bas unknown as\b|\bas any\b|:\s*any\b|@ts-ignore/);
      expect(variant.stripe).not.toContain("err.message");
      expect(variant.stripe).not.toContain("2025-03-31.basil");
      expect(variant.stripe).toContain("invoice.parent?.subscription_details?.subscription");
      expect(variant.stripe).toContain('from "./_stripe-runtime.js"');
      expect(variant.stripe).toContain("executeClaimedDelivery");
      expect(variant.stripe).toContain(
        "stripe.webhooks.constructEvent(Buffer.from(body), signature, secret)",
      );
      expect(variant.stripe).toContain("db.transaction");
      expect(variant.stripe).toContain("onConflictDoNothing");
      expect(variant.stripe).toContain("returning");
      const claimStart = variant.stripe.indexOf("claim: async (input)");
      const claimEnd = variant.stripe.indexOf("markProcessed:", claimStart);
      const claim = variant.stripe.slice(claimStart, claimEnd);
      expect(claimStart).toBeGreaterThan(-1);
      expect(claimEnd).toBeGreaterThan(claimStart);
      expect(claim).toContain("provider: input.provider");
      expect(claim).toContain("providerEventId: input.eventId");
      expect(claim).toContain("type: input.eventType");
      expect(claim).toContain("payload: input.payloadJson");
      expect(claim).not.toMatch(/\bevent\.|(?<!input\.)\bpayloadJson\b/);
      expect(variant.runtime).toContain("export async function readBoundedBody");
      expect(variant.runtime).toContain("export async function executeClaimedDelivery");
      expect(variant.runtime).not.toMatch(/from ["'](?:stripe|drizzle-orm)/);
      expect(variant.schema).toContain('provider: billingProviderEnum("provider").notNull()');
      expect(variant.schema).toContain(
        'payload: jsonb("payload").$type<string | Record<string, unknown>>()',
      );
    });
  }

  test("narrows the declared cookie union", () => {
    const source =
      generated
        .find(({ label }) => label === "single/postgres")
        ?.read("src/server/analytics/utils.ts") ?? "";
    expect(source).toContain("const cookieStore = opts.cookies;");
    expect(source).toContain("cookieStore instanceof Map");
    expect(source).not.toContain("opts.cookies as");
    expect(source).not.toContain("as unknown as string");
  });

  test("disabled Stripe emits no route, dependency, or environment requirement", () => {
    for (const mode of ["single", "monorepo"] as const) {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "demo",
          mode,
          framework: "nextjs",
          database: "postgres",
          billing: [],
        }),
      );
      expect(files.some(({ path }) => path.includes("api/webhooks/stripe"))).toBe(false);
      const manifests = files
        .filter(({ path }) => path.endsWith("package.json"))
        .map(({ content }) => content)
        .join("\n");
      expect(manifests).not.toContain('"stripe"');
      expect(files.find(({ path }) => path === ".env.example")?.content ?? "").not.toContain(
        "STRIPE_",
      );
    }
  });
});
```

In the same RED step, create `stripe-webhook-runtime.test.ts`. Import the planned `stripePostgresRuntimeFile`, call it for both modes, assert the two exact emitted paths, write each `TemplateFile.content` to that path under a private temp root, and import the materialized `.ts` file with `pathToFileURL`. Assert the content has no Stripe/Drizzle import. Exercise its planned `readBoundedBody` and `executeClaimedDelivery` exports with an in-memory store whose transaction snapshots and restores its claim map on rejection. Define four exact cases: concurrent duplicate calls execute the handler once; a thrown first handler rolls back so the retry processes; a verifier throw performs no transaction or handler work; and 700 KiB followed by 400 KiB cancels/rejects before retaining the second chunk.

Also create `stripe-webhook-typecheck.test.ts` as an installed generated-project test, not a declaration-stub test. For each of monorepo and single mode, materialize a Next.js + PostgreSQL + web + Stripe-only project from `generateProjectFiles` into its own private temp root, assert the exact route/runtime/schema paths and the contract strings above, run `bun install`, then run that generated project's `bun run typecheck`. Capture stdout/stderr, require both commands to exit zero, and always remove the verified temp roots. This compiles the real route adapter against the emitted Drizzle schema and real Stripe 19.1.0 declarations; no ambient `any`, rewritten import, or synthetic table type may make the test pass.

Update the existing Stripe cases in `billing-webhooks.test.ts` to require the `_stripe-runtime.js` import, `constructEvent(Buffer.from(body), signature, secret)`, input-scoped claim fields, and the payload union instead of the obsolete inline `arrayBuffer` and `2025-03-31.basil` assertions. Leave the raw-body expectations for Chargily, Paddle, and Polar unchanged.

- [ ] **Step 2: Run RED**

```bash
bun test tests/unit/stripe-analytics-contract.test.ts tests/unit/stripe-webhook-runtime.test.ts tests/unit/billing-webhooks.test.ts --timeout 100000
bun test tests/integration/stripe-webhook-typecheck.test.ts --timeout 600000
```

Expected: FAIL because `stripePostgresRuntimeFile`, both exact `_stripe-runtime.ts` files, their runtime exports, and route imports are absent, alongside obsolete `2025-03-31.basil`, `err.message` on unknown, chained assertions around invoice/subscription/payment fields, and the cookie-to-string cast.

- [ ] **Step 3: Emit the exact pure PostgreSQL runtime and explicit configuration guards**

In `stripe-postgres-runtime.ts`, import `file` and `type TemplateFile` from the established shared template helper and export exactly:

```ts
import { file, type TemplateFile } from "../../../shared.js";

export function stripePostgresRuntimeFile(mode: "monorepo" | "single"): TemplateFile {
  const path =
    mode === "monorepo"
      ? "apps/web/src/app/api/webhooks/stripe/_stripe-runtime.ts"
      : "src/app/api/webhooks/stripe/_stripe-runtime.ts";
  return file(path, stripePostgresRuntimeSource());
}
```

The source returned by `stripePostgresRuntimeSource()` is framework-neutral and has no import from `stripe`, `drizzle-orm`, or any generated package. It exports exactly `StripeDeliveryClaim`, `VerifiedStripeDelivery<Event>`, `StripeEventVerifier<Event>`, `StripeDeliveryTransaction<Context>`, `StripeDeliveryStore<Context>`, `StripeDeliveryResult`, `ExecuteClaimedDeliveryOptions<Event, Context>`, `readBoundedBody`, and `executeClaimedDelivery`.

Keep Stripe-specific event helpers in the two route adapters:

```ts
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function expandableId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const periods = subscription.items.data.map((item) => item.current_period_end);
  return periods.length > 0 ? Math.max(...periods) : null;
}
```

Check both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for missing/placeholder values before body consumption. Construct `new Stripe(stripeSecretKey)` with no override. Reject an oversized declared or streamed body before `constructEvent`.

In `webhook_events.ts`, change only the TypeScript JSONB payload contract and preserve the existing table, provider enum column, indexes, and stored provider objects:

```ts
provider: billingProviderEnum("provider").notNull(),
providerEventId: text("provider_event_id").notNull(),
type: text("type").notNull(),
payload: jsonb("payload").$type<string | Record<string, unknown>>(),
processed: boolean("processed").notNull().default(false),
```

This is a widening of the JSONB TypeScript type, not a destructive schema or data migration. Existing Chargily, Paddle, Polar, and legacy Stripe object payloads remain valid; the new PostgreSQL Stripe adapter may store its bounded `payloadJson` string.

The emitted runtime contract and implementation are:

```ts
export interface StripeDeliveryClaim {
  provider: "stripe";
  eventId: string;
  eventType: string;
  payloadJson: string;
}

export interface VerifiedStripeDelivery<Event> {
  event: Event;
  claim: StripeDeliveryClaim;
}

export interface StripeEventVerifier<Event> {
  verify(body: Uint8Array, signature: string): VerifiedStripeDelivery<Event>;
}

export interface StripeDeliveryTransaction<Context> {
  context: Context;
  claim(input: StripeDeliveryClaim): Promise<string | null>;
  markProcessed(claimId: string): Promise<void>;
}

export interface StripeDeliveryStore<Context> {
  transaction<Result>(
    work: (transaction: StripeDeliveryTransaction<Context>) => Promise<Result>,
  ): Promise<Result>;
}

export type StripeDeliveryResult =
  { status: "processed"; eventId: string } | { status: "duplicate"; eventId: string };

export interface ExecuteClaimedDeliveryOptions<Event, Context> {
  body: ReadableStream<Uint8Array> | null;
  signature: string;
  limit: number;
  verifier: StripeEventVerifier<Event>;
  store: StripeDeliveryStore<Context>;
  handle(event: Event, context: Context): Promise<void>;
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > limit) {
        await reader.cancel("payload-too-large");
        throw new Error("STRIPE_WEBHOOK_BODY_TOO_LARGE");
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  } finally {
    reader.releaseLock();
  }
}

export async function executeClaimedDelivery<Event, Context>(
  options: ExecuteClaimedDeliveryOptions<Event, Context>,
): Promise<StripeDeliveryResult> {
  const body = await readBoundedBody(options.body, options.limit);
  const verified = options.verifier.verify(body, options.signature);
  if (new TextEncoder().encode(verified.claim.payloadJson).byteLength > options.limit) {
    throw new Error("STRIPE_WEBHOOK_BODY_TOO_LARGE");
  }
  return options.store.transaction(async (transaction) => {
    const claimId = await transaction.claim(verified.claim);
    if (!claimId) return { status: "duplicate", eventId: verified.claim.eventId };
    await options.handle(verified.event, transaction.context);
    await transaction.markProcessed(claimId);
    return { status: "processed", eventId: verified.claim.eventId };
  });
}
```

Each Next/PostgreSQL route imports the runtime from `./_stripe-runtime.js`, checks numeric `content-length` first, then calls `executeClaimedDelivery` with `body: req.body`, `limit: 1_048_576`, and route-owned verifier/store/handler adapters. A chunk that crosses the limit is never stored or joined. The injected verifier is the only adapter that knows Stripe and uses the raw bytes exactly:

```ts
verify(body, signature) {
  const event = stripe.webhooks.constructEvent(Buffer.from(body), signature, secret);
  const payloadJson = JSON.stringify(event);
  return {
    event,
    claim: { provider: "stripe", eventId: event.id, eventType: event.type, payloadJson },
  };
}
```

The injected store wraps `db.transaction` and is the only adapter that knows Drizzle.

`executeClaimedDelivery` runs claim, handler-specific writes through the injected transaction context, and mark inside one store callback. The Drizzle adapter implements claim as:

```ts
claim: async (input) => {
  const [claim] = await tx
    .insert(webhook_events)
    .values({
      provider: input.provider,
      providerEventId: input.eventId,
      type: input.eventType,
      payload: input.payloadJson,
      processed: false,
    })
    .onConflictDoNothing({ target: [webhook_events.provider, webhook_events.providerEventId] })
    .returning({ id: webhook_events.id });
  return claim?.id ?? null;
},
```

The claim implementation may reference only `input.provider`, `input.eventId`, `input.eventType`, and `input.payloadJson`; `event` and a free `payloadJson` identifier are out of scope by design. Both contract extraction and installed typechecking reject either regression.

No claim means duplicate success with no handler execution. Any handler/mark error rejects the transaction so the insert rolls back and the provider retry can claim again. Mark processed occurs before the transaction callback returns.

- [ ] **Step 4: Replace record casts with discriminated event cases**

Use `event.data.object` directly in each separate case:

- `checkout.session.completed`: `Stripe.Checkout.Session`, `expandableId(session.subscription)`, `session.metadata?.userId`, and `session.metadata ?? {}`.
- `invoice.paid` and `invoice.payment_succeeded`: `Stripe.Invoice`, `invoice.parent?.subscription_details?.subscription`, `invoice.amount_paid`, `invoice.currency`, and `invoice.customer`.
- `payment_intent.succeeded`: `Stripe.PaymentIntent`, `paymentIntent.id`, `amount_received`.
- `charge.succeeded`: `Stripe.Charge`, `charge.id`, `charge.amount`.
- `customer.subscription.updated/deleted`: `Stripe.Subscription`, `status`, `subscriptionPeriodEnd(subscription)`, and `trial_end`.

Do not group dissimilar event types into a record-shaped object. Inside the injected route verifier, immediately after `constructEvent`, serialize the already typed `Stripe.Event` once:

```ts
const payloadJson = JSON.stringify(event);
if (new TextEncoder().encode(payloadJson).byteLength > 1_048_576) {
  return new Response("Webhook payload too large", { status: 413 });
}
```

Persist/pass that bounded string as `payloadJson`; do not parse it back, cast the event to a record, or introduce a second untyped representation.

Complete Convex provider ingress, raw-body verification, idempotency, internal mutations, and user-ID normalization are explicitly deferred to V2 Phases 5A/5B/7, where their data blueprint, application ports, provider contracts, and runtime acceptance scenarios are designed together. Phase 1A does not edit a Convex billing or HTTP template and does not add a Convex/root Stripe dependency.

Event processing must fail closed. Wrap the discriminated switch once; on an unknown handler error, log `errorMessage(error)` and return status 500 with `Retry-After: 60`. Write `processed: true` only after the selected handler succeeds. If recording the processed event fails, return 500 rather than logging and returning `ok`. Remove the per-case catches that currently swallow a failed mutation and allow the delivery to be marked processed.

The Step 1 runtime test now imports and exercises the materialized pure helper using Bun's existing test/runtime primitives, with no dependency addition. Its executable cases prove:

1. two concurrent calls for the same `(stripe,eventId)` execute the handler exactly once;
2. a first handler throw rolls back the claim and a second call processes successfully;
3. an invalid-signature verifier throw performs no transaction/handler work;
4. a stream of 700 KiB then 400 KiB rejects/cancels before storing or concatenating the second chunk.

The fake transaction snapshots its in-memory claim map and restores it on callback rejection, matching the required rollback semantics. RED currently observes two handler executions, a poisoned failed claim, and full-body allocation.

- [ ] **Step 5: Narrow cookies directly**

Emit:

```ts
export interface CookieGetter {
  get(name: string): { value: string } | undefined;
}

export type CookieSource = CookieGetter | Map<string, string>;

const cookieStore = opts.cookies;
if (cookieStore instanceof Map) {
  const value = cookieStore.get("posthog_distinct_id") ?? cookieStore.get("distinct_id");
  if (value) return value;
} else if (cookieStore) {
  const value =
    cookieStore.get("posthog_distinct_id")?.value ?? cookieStore.get("distinct_id")?.value;
  if (value) return value;
}
```

Do not catch this pure narrowing block; neither branch throws. Keep fallback ID creation after header lookup.

Remove all unsafe-baseline entries assigned to `src/templates/billing/webhooks/providers/stripe.ts` for the two PostgreSQL handlers and to `src/templates/analytics/utils.ts`; add those owner assertions to the baseline test. Convex entries retain their committed deferred-V1 disposition.

- [ ] **Step 6: Run GREEN boundary and build gates**

```bash
bun test tests/unit/stripe-analytics-contract.test.ts tests/unit/stripe-webhook-runtime.test.ts tests/unit/billing-webhooks.test.ts --timeout 100000
bun test tests/integration/stripe-webhook-typecheck.test.ts --timeout 600000
bun test tests/unit/generation-matrix.test.ts --timeout 100000
bun run build
```

Expected: focused tests, both installed PostgreSQL route typechecks, matrix, and build pass. Each claim reads only its `input` fields, the verifier consumes `Buffer.from(body)`, and the widened JSONB type accepts the bounded string without invalidating existing provider objects. The emitted contracts no longer contain the constructs that produced TS2322/TS18046/TS2339/TS2571 Stripe diagnostics or analytics TS2358/TS2352; Task 7 performs the first fully green installed lint gate after alias migration.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/stripe-analytics-contract.test.ts tests/unit/stripe-webhook-runtime.test.ts tests/integration/stripe-webhook-typecheck.test.ts tests/unit/billing-webhooks.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts src/templates/billing/webhooks/providers/stripe.ts src/templates/billing/webhooks/providers/stripe-postgres-runtime.ts src/templates/billing/schema/tables/webhook_events.ts src/templates/analytics/utils.ts
git commit -m "fix: narrow generated vendor boundaries"
```

---

### Task 7: Enforce ownership-aware aliases and pass both generated corners

**Files:**

- Create: `tests/unit/import-alias-policy.test.ts`
- Modify: `tests/unit/generation-matrix.test.ts`
- Modify: `tests/unit/lint-scripts-template.test.ts`
- Modify: `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- Modify: `src/templates/tooling/lint-scripts.ts`
- Modify: `src/templates/apps/fragments/auth/two-factor.ts`
- Modify: `src/templates/apps/fragments/auth/sign-in.ts`
- Modify: `src/templates/apps/fragments/auth/sign-up.ts`
- Modify: `src/templates/apps/fragments/admin/layout.ts`
- Modify: `src/templates/apps/fragments/admin/create-user-page.ts`
- Modify: `src/templates/apps/fragments/admin/hooks.ts`
- Modify: `src/templates/apps/fragments/dashboard.ts`
- Modify: `src/templates/apps/fragments/recovery/forgot-password.ts`
- Modify: `src/templates/apps/fragments/recovery/reset-password.ts`
- Modify: `src/templates/apps/fragments/layout.ts`
- Modify: `src/templates/apps/fragments/marketing/page.ts`
- Modify: `src/templates/apps/fragments/settings/danger-card.ts`
- Modify: `src/templates/apps/fragments/settings/password-card.ts`
- Modify: `src/templates/apps/fragments/settings/profile-card.ts`
- Modify: `src/templates/apps/fragments/settings/sessions-card.ts`
- Modify: `src/templates/apps/fragments/settings/two-factor-card.ts`
- Modify: `src/templates/apps/fragments/settings/hook.ts`
- Modify: `src/templates/apps/fragments/header/header.ts`
- Modify: `src/templates/apps/fragments/theme.ts`
- Modify: `src/templates/apps/fragments/core/hooks.ts`
- Modify: `src/templates/apps/fragments/web-ui/data.ts`
- Modify: `src/templates/apps/fragments/web-ui/dropdown.ts`
- Modify: `src/templates/apps/fragments/web-ui/primitives.ts`
- Modify: `src/templates/apps/fragments/web-ui/forms.ts`
- Modify: `src/templates/apps/fragments/web-ui/overlays.ts`
- Modify: `src/templates/apps/fragments/web-ui/feedback.ts`
- Modify: `src/templates/apps/fragments/web-ui/layout.ts`
- Modify: `src/templates/apps/fragments/web-ui/missing.ts`
- Modify: `src/templates/apps/fragments/header/guards.ts`
- Modify: `src/templates/analytics/feature-flags.ts`
- Modify: `src/templates/analytics/hooks.ts`
- Modify: `src/templates/analytics/provider.ts`
- Modify: `src/templates/analytics/pageview.ts`
- Modify: `src/templates/billing-generator.ts`

**Interfaces:**

- A relative style import is always allowed.
- A code import is allowed relatively only when source and resolved target share the same logical owner.
- Logical owners are `app/<route>`, `components/<family>`, `server/<capability>`, or the first `src` segment (`hooks`, `lib`, and `src-root`).
- Cross-owner source imports use `@/`; package-local monorepo imports keep their package-relative form where no `@/` app alias exists.
- Alias analysis consumes Task 2's exact `oxc-parser@0.139.0` helper. Missing parser or parser diagnostics exit nonzero; no TypeScript compiler API is used.
- The semantic test materializes both default outputs and proves the reviewed 51 next-monorepo + 37 single-next crossings fall to zero; the generation-matrix guard applies the same owner policy to every monorepo and single variant.

- [ ] **Step 1: Complete the fresh frontend implementer evidence prompt**

Report the product-register and Next/React evidence. This policy changes how frontend ownership is expressed and reviewed.

- [ ] **Step 2: Write the failing executable policy tests**

In `lint-scripts-template.test.ts`, replace its Task 2 blanket-policy assertion with the new exact contract:

```ts
expect(aliases.exitCode).toBe(1);
expect(aliases.output).toContain("app/demo -> lib");
expect(aliases.output).toContain("Use @/lib/value");
expect(aliases.output).not.toContain("Relative imports forbidden");
```

Then create the focused policy test:

```ts
import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const root = resolve(import.meta.dir, "../..");
const temporary: string[] = [];
afterEach(() =>
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function run(files: Record<string, string>): { exitCode: number; output: string } {
  const directory = mkdtempSync(resolve(root, ".alias-policy-test-"));
  temporary.push(directory);
  const emitted = lintScriptFiles();
  const script = emitted.find(({ path }) => path === "scripts/check-import-aliases.cjs");
  if (!script) throw new Error("missing alias checker");
  const generated = Object.fromEntries(emitted.map(({ path, content }) => [path, content]));
  for (const [path, content] of Object.entries({ ...generated, ...files })) {
    const target = resolve(directory, path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, content);
  }
  const result = spawnSync("node", [resolve(directory, script.path)], {
    cwd: directory,
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

test("allows same-owner and style relatives", () => {
  expect(
    run({
      "src/server/billing/index.ts": 'export { map } from "./mapper.js"; import "./billing.css";\n',
      "src/server/billing/mapper.ts": "export const map = 1;\n",
    }).exitCode,
  ).toBe(0);
});

test("rejects cross-owner relative imports with an alias remedy", () => {
  const result = run({
    "src/components/ui/button.tsx": 'import { cn } from "../../lib/utils.js"; export { cn };\n',
    "src/lib/utils.ts": "export const cn = () => '';\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("components/ui -> lib");
  expect(result.output).toContain("Use @/lib/utils");
});

test("accepts the aliased cross-owner import", () => {
  expect(
    run({
      "src/components/ui/button.tsx": 'import { cn } from "@/lib/utils"; export { cn };\n',
      "src/lib/utils.ts": "export const cn = () => '';\n",
    }).exitCode,
  ).toBe(0);
});

test("normalizes query/hash before style classification", () => {
  expect(
    run({
      "src/components/ui/theme.ts": 'import "../../styles/app.css?url#theme";\n',
    }).exitCode,
  ).toBe(0);
});

test("normalizes query/hash before owner resolution and alias remedies", () => {
  const result = run({
    "src/components/ui/load.ts": 'export const lazy = () => import("../../lib/utils#client");\n',
    "src/lib/utils.ts": "export const cn = () => '';\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.output.match(/Use (@\/\S+)/)?.[1]).toBe("@/lib/utils");
});

test("rejects cross-owner re-export, literal import(), and literal require()", () => {
  const result = run({
    "src/components/ui/load.ts": [
      'export { cn } from "../../lib/utils";',
      'export const lazy = () => import("../../lib/utils");',
      'export const loaded = require("../../lib/utils");',
    ].join("\n"),
    "src/lib/utils.ts": "export const cn = () => '';\n",
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("ExportNamedDeclaration");
  expect(result.output).toContain("ImportExpression");
  expect(result.output).toContain("require");
  expect(result.output).toContain("Use @/lib/utils");
});

test("both default generated corners have zero owner crossings", () => {
  for (const [label, config] of [
    [
      "next-monorepo",
      projectConfigSchema.parse({
        name: "demo",
        mode: "monorepo",
        framework: "nextjs",
        database: "postgres",
        billing: ["stripe", "chargily"],
      }),
    ],
    [
      "single-next",
      projectConfigSchema.parse({
        name: "demo",
        mode: "single",
        framework: "nextjs",
        database: "postgres",
        billing: ["stripe"],
      }),
    ],
  ] as const) {
    const files = Object.fromEntries(
      generateProjectFiles(config).map(({ path, content }) => [path, content]),
    );
    const result = run(files);
    expect(result.exitCode, `${label}: ${result.output}`).toBe(0);
  }
});
```

- [ ] **Step 3: Run RED**

```bash
bun test tests/unit/import-alias-policy.test.ts tests/unit/lint-scripts-template.test.ts --timeout 100000
```

Expected: the focused same-owner fixture incorrectly exits 1, and the updated Task 2 assertion receives `Relative imports forbidden` instead of `app/demo -> lib` plus `Use @/lib/value`. The OXC helper runs successfully, so RED is caused by policy semantics rather than a TypeScript 7 TypeError.

- [ ] **Step 4: Implement the exact logical-owner policy**

In emitted CJS, consume the Task 2 helper and implement:

```js
const path = require("node:path");
const { moduleReferences, parseOwned, positionOf, toPosix } = require("./lib/oxc.cjs");
function normalizedSpecifier(specifier) {
  return specifier.split(/[?#]/, 1)[0];
}
function isStyle(specifier) {
  return [".css", ".scss", ".sass", ".less"].some((extension) =>
    normalizedSpecifier(specifier).endsWith(extension),
  );
}
function logicalOwner(file) {
  const relative = toPosix(path.relative(process.cwd(), file));
  const source = relative.startsWith("apps/web/src/")
    ? relative.slice("apps/web/src/".length)
    : relative.startsWith("src/")
      ? relative.slice(4)
      : relative;
  const parts = source.split("/");
  if (parts.length === 1) return "src-root";
  if (["app", "components", "server"].includes(parts[0])) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}
function resolvedOwner(file, specifier) {
  return logicalOwner(path.resolve(path.dirname(file), normalizedSpecifier(specifier)));
}
function aliasFor(file, specifier) {
  const normalizedFile = toPosix(file);
  const marker = normalizedFile.includes("/apps/web/src/") ? "/apps/web/src/" : "/src/";
  const sourceRoot = normalizedFile.slice(0, normalizedFile.indexOf(marker) + marker.length - 1);
  const target = path.resolve(path.dirname(file), normalizedSpecifier(specifier));
  const relative = toPosix(path.relative(sourceRoot, target))
    .replace(/\.(?:[cm]?[jt]sx?)$/, "")
    .replace(/\/index$/, "");
  return `@/${relative}`;
}
```

For each file, call `parseOwned(file, source)` and iterate `moduleReferences(program)`, covering static imports/re-exports plus literal `import()` and `require()`. Normalize query/hash before style classification and path resolution. Only report a non-style relative reference when `logicalOwner(file) !== resolvedOwner(file, specifier)`. Include `reference.kind`, both owners, and `aliasFor(file, specifier)` in the diagnostic. Let parser/helper errors exit 2.

- [ ] **Step 5: Migrate all 88 reviewed crossings in both default corners**

The Task 7 Files block freezes the reviewed 34-owner inventory that produces 51 next-monorepo and 37 single-next crossings. Update every owner, not only shared UI:

- All eight `web-ui` emitters listed above: `../../lib/utils(.js)` becomes `@/lib/utils`.
- Header guard: `../lib/auth-client(.js)` becomes `@/lib/auth-client`.
- Single analytics components/hooks: use `@/lib/analytics`, `@/server/analytics/types`, and `@/components/analytics/posthog-provider`; keep monorepo package-internal relatives selected by the existing `mode` branch.
- Single billing schema facade: `../../db/schema/billing` becomes `@/server/db/schema/billing`; monorepo remains `@repo/database`.
- Task 5 user row imports `AdminUser` from `@/lib/kernel`, so no hook-owned cross-import remains.

Migrate all page/layout/settings/auth/dashboard/marketing/header/theme/core-hook owners listed in Files so the next-monorepo count falls from 51 to 0, and all shared UI/analytics/billing owners so single-next falls from 37 to 0. Remove the unsafe-baseline occurrences assigned to the touched analytics hook/provider/pageview owners using their real PostHog public types; assert those removal IDs are absent.

Finally enable the baseline's aggregate removal assertion:

```ts
const stillPresent = actualIds.filter((id) =>
  baseline.entries.some(
    (entry) => entry.id === id && entry.disposition === "remove-in-stabilization",
  ),
);
expect(stillPresent).toEqual([]);
expect(actualIds.filter((id) => !baselineIds.has(id))).toEqual([]);
```

Deferred V1 IDs remain allowed; V2 Phase 6, not this plan, changes that second ceiling to zero.

Do not mass-rewrite same-owner relatives such as `server/analytics/shared -> server/analytics/types`, `app/billing/components -> app/billing/hooks`, or `server/api/procedures -> server/api/context`.

- [ ] **Step 6: Add the fast matrix guard**

Add the same `logicalOwner` and `moduleReferences` calculation to `generation-matrix.test.ts`. For every monorepo and single corner, scan TS/TSX/JS/JSX/MTS/CTS/MJS/CJS, normalize query/hash before style checks, and assert cross-owner static import/re-export, literal `import()`, and literal `require()` findings are empty.

- [ ] **Step 7: Run GREEN and both corners separately**

```bash
bun test tests/unit/import-alias-policy.test.ts tests/unit/lint-scripts-template.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/generation-matrix.test.ts --timeout 100000
bun run build
bun run test:generated -- --only next-monorepo
bun run test:generated -- --only single-next
```

Expected: policy tests pass; each installed corner reports install, typecheck, and lint PASS. No checker is removed and no relative-import exception is blanket-added.

- [ ] **Step 8: Run the mandatory fresh frontend reviewer prompt**

Reviewer must inspect representative allowed same-owner and rejected cross-owner imports, then report `APPROVED` with no open Critical/Important finding.

- [ ] **Step 9: Run the default combined gate**

```bash
bun run test:generated
```

Expected: `next-monorepo` and `single-next` both pass with no KNOWN/expected failure.

- [ ] **Step 10: Commit**

```bash
git add tests/unit/import-alias-policy.test.ts tests/unit/generation-matrix.test.ts tests/unit/lint-scripts-template.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts src/templates/tooling/lint-scripts.ts src/templates/apps/fragments/auth/two-factor.ts src/templates/apps/fragments/auth/sign-in.ts src/templates/apps/fragments/auth/sign-up.ts src/templates/apps/fragments/admin/layout.ts src/templates/apps/fragments/admin/create-user-page.ts src/templates/apps/fragments/admin/hooks.ts src/templates/apps/fragments/dashboard.ts src/templates/apps/fragments/recovery/forgot-password.ts src/templates/apps/fragments/recovery/reset-password.ts src/templates/apps/fragments/layout.ts src/templates/apps/fragments/marketing/page.ts src/templates/apps/fragments/settings/danger-card.ts src/templates/apps/fragments/settings/password-card.ts src/templates/apps/fragments/settings/profile-card.ts src/templates/apps/fragments/settings/sessions-card.ts src/templates/apps/fragments/settings/two-factor-card.ts src/templates/apps/fragments/settings/hook.ts src/templates/apps/fragments/header/header.ts src/templates/apps/fragments/header/guards.ts src/templates/apps/fragments/theme.ts src/templates/apps/fragments/core/hooks.ts src/templates/apps/fragments/web-ui/data.ts src/templates/apps/fragments/web-ui/dropdown.ts src/templates/apps/fragments/web-ui/primitives.ts src/templates/apps/fragments/web-ui/forms.ts src/templates/apps/fragments/web-ui/overlays.ts src/templates/apps/fragments/web-ui/feedback.ts src/templates/apps/fragments/web-ui/layout.ts src/templates/apps/fragments/web-ui/missing.ts src/templates/analytics/feature-flags.ts src/templates/analytics/hooks.ts src/templates/analytics/provider.ts src/templates/analytics/pageview.ts src/templates/billing-generator.ts
git commit -m "fix: enforce generated import ownership aliases"
```

---

## Final verification

- [ ] **Step 1: Verify exact host executables and no expected-failure entry**

```bash
bun --version
bunx --no-install tsc --version
rg -n 'expectedFailures\s*:\s*\[' scripts/test-generated.ts
```

Expected: `1.4.0`, `Version 7.0.2`, and `rg` exits 1 with no match.

- [ ] **Step 2: Run every focused contract**

```bash
bun test --timeout 100000 tests/unit/generated-import-closure.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/lint-scripts-template.test.ts tests/unit/generated-web-ui-contract.test.ts tests/unit/generated-frontend-primitives.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts tests/unit/stripe-analytics-contract.test.ts tests/unit/stripe-webhook-runtime.test.ts tests/unit/billing-webhooks.test.ts tests/unit/import-alias-policy.test.ts
bun test tests/integration/generated-web-primitives.test.ts --timeout 300000
bun test tests/integration/stripe-webhook-typecheck.test.ts --timeout 600000
```

Expected: all focused tests pass with pristine output.

- [ ] **Step 3: Run the full structural matrix**

```bash
bun test tests/unit/generation-matrix.test.ts --timeout 100000
```

Expected: all corners parse, imports resolve, package/env conditions hold, and every single cross-owner code import uses `@/`.

- [ ] **Step 4: Build, then prove each installed corner and the default pair**

```bash
bun run build
bun run test:generated -- --only next-monorepo
bun run test:generated -- --only single-next
bun run test:generated
```

Expected: every command exits zero; no corner reports KNOWN, skipped typecheck, or skipped lint.

- [ ] **Step 5: Run host quality, compiler, registry, and full tests**

```bash
bun run check
bun run typecheck
bun run check:versions
bun run test
bun run pretest:fixtures
bun run test:fixtures
```

Expected: all exit zero. `check:versions` confirms the two narrowly added missing pins exist; no existing generated pin changed; every frozen compatibility fixture installs and passes.

- [ ] **Step 6: Inspect the final diff and whitespace**

```powershell
$base = (Get-Content -Raw -LiteralPath '.superpowers/sdd/generated-gate-stabilization-base.txt').Trim()
if ($base -notmatch '^[0-9a-f]{40}$') { throw "Invalid recorded base SHA: $base" }
git cat-file -e "$base^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Recorded base commit is missing: $base" }
git diff --check "$base..HEAD"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --stat "$base..HEAD"
git status --short
```

Expected: the recorded pre-Task-1 commit exists, `BASE..HEAD` has no whitespace error, the stat contains only planned paths/review evidence, and the worktree is clean.

## Plan self-review

- **Coverage:** The prerequisite commits both governing plans and the complete tracked disposition evidence together, then records ignored progress/base evidence. Task 0 validates all 1,011 occurrences across 16 projection and two exact gate keys against one of 101 disjoint provenance rules, including the 15 gate-only Chargily occurrences, assigns `sourceOwner` through that rule, and freezes the schema-validated V1 ceiling with stable `configKey::path::kind::fingerprint::ordinal` IDs. Task 1 owns 16-corner closure and compiled access roles. Task 2 owns capability-aware OXC alias/navigation/Next parity parsing. Tasks 3/5 close all 71 reviewed frontend gaps with structural and rendered Next/TanStack evidence. Task 4 owns complete email on/off emission and typed flags. Task 6 is limited to the two observed Next/PostgreSQL Stripe routes plus analytics cookies, emits/imports the exact pure runtime paths, widens only the webhook JSONB payload type, proves bounded streaming and transactional claim/rollback/idempotency, installed-typechecks both exact route adapters, and defers Convex. Task 7 owns all 88 alias crossings and both default installed gates.
- **Placeholder scan:** The plan contains concrete paths, signatures, RED diagnostics, GREEN commands, and commit commands. No implementation step delegates an unspecified behavior.
- **Type consistency:** Every generated-config test calls `projectConfigSchema.parse`, so schema defaults produce the required `ProjectConfig` fields without a cast. Better Auth server assertions target `server.ts`, client assertions target `client.ts`, and `index.ts` is only the barrel. Custom `ac`, `roles`, and `AccessRole` exist only in the monorepo auth package; single mode keeps bare `admin()`/`adminClient()` and narrows Better Auth's default `"admin" | "user"` union locally. UI `UserRole` is always `"user" | "admin"`; `AdminUser.role`, Select options, `setRole`, and Better Auth calls use it. `Select` exposes string values while its Base UI null placeholder is narrowed internally. Stripe claim persistence reads only `input.provider`, `input.eventId`, `input.eventType`, and `input.payloadJson`; `webhook_events.payload` is exactly `string | Record<string, unknown>`, preserving existing object payloads. `CookieSource`, `FormController`, and the undefined-aware Stripe helpers have one definition each.
- **Conditional consistency:** Closure scans both modes, both frameworks, PostgreSQL/Convex, and capability on/off across root/apps/packages/Convex/config/scripts. Email's eight corners and disabled Stripe prove absence of files, imports, dependencies, routes, navigation, environment, and registrations. Single TanStack proves `@t3-oss/env-core` without env-nextjs. Navigation/Next parity remedies depend on emitted i18n routing.
- **Runtime evidence:** The executable Playwright harness reserves a free loopback port, builds one merged environment object for Playwright install/test, route generation, and server, uses the exact Next apps/web and single-TanStack root commands/cwds, launches the generated server with a hidden Windows process, polls HTTP readiness, runs the exact primitive spec, and always cleans up the process tree. Stripe runtime tests materialize both exact `_stripe-runtime.ts` paths, reject Stripe/Drizzle imports in the pure helper, and cover concurrent exactly-once delivery, rollback followed by retry, invalid signatures before transaction work, and 700 KiB + 400 KiB bounded-stream cancellation before the second chunk is stored or concatenated. The installed typecheck test compiles both unmodified generated PostgreSQL projects against real Stripe and Drizzle declarations, so a free `event`/`payloadJson` reference or incompatible JSONB payload fails.
- **Check strength:** Retained type evidence uses asserted durable package-local paths (or a freshly printed kept root). OXC diagnostics compute real line/column positions from source text and `node.start`; module references include static import/re-export, literal `import()`, and literal `require()`. `normalizedSpecifier` is called by both `resolvedOwner` and `aliasFor`, so query/hash suffixes are removed before owner comparison and exact remedy construction as well as before style checks. The tracked unsafe ceiling rejects new ordinal IDs and all assigned stabilization IDs while honestly preserving reviewed deferred V1 IDs until the V2 Phase 6 zero gate. No expected failure, parser skip, TypeError-as-success assertion, blanket alias relaxation, partial Convex redesign, or fake provider fallback is introduced. Final review reads the ignored base state, runs host/generated/fixture gates, and inspects `BASE..HEAD`.

Plan complete and saved to `docs/superpowers/plans/2026-08-23-ghostinit-v2-generated-gate-stabilization.md`.
