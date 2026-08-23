# GhostInit V2 Toolchain and Compatibility Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current working state in an isolated implementation branch, freeze V1-to-V2 behavioral decisions, and establish a reproducible Bun 1.4.0/TypeScript 7.0.2 host, CI, script, and packed-package baseline.

**Architecture:** This phase changes host/tooling/release boundaries only. It does not create V2 domain contracts or switch the public CLI. The compatibility ledger becomes the source consumed by the following domain/command-protocol plan.

**Tech Stack:** Git worktrees, Bun 1.4.0, TypeScript 7.0.2, Bun test/YAML, npm pack.

## Global Constraints

- Read and follow `superpowers:using-git-worktrees` before any execution action.
- The current workspace must remain untouched after the implementation worktree is created.
- Preserve the current tracked working-tree state and `tests/integration/init-upgrade.test.ts`; do not copy `.agents/` or `.playwright-mcp/` runtime artifacts.
- Bun is exactly `1.4.0`; TypeScript is exactly `7.0.2`; peers are never overridden.
- `packages/versions/src/index.ts` remains the legacy generated-project registry during this phase except for correcting the audited nonexistent `expo-updates` pin from `0.29.13` to published `29.0.13` and the generated-gate amendment below.
- The public `src/cli.ts` remains on V1.
- Every task follows red-green-refactor and is independently reviewed.

### Phase 1A generated-gate amendment (2026-08-23)

- Phase 1A additionally permits only the registry-verified missing direct dependencies `server-only@0.0.1` and `lucide-react@1.33.0`; every existing generated dependency pin otherwise remains unchanged.
- The already-pinned `oxc-parser@0.139.0` generated-lint migration moves forward from Phase 3 into Phase 1A solely because TypeScript 7.0.2 exposes no legacy JavaScript compiler API and the mandatory `bun run test:generated` lint gate cannot run without it. This is dependency placement/migration of an existing pin, not a version refresh.
- No other dependency addition, pin refresh, V2 production source, generated architecture cutover, or public CLI cutover is permitted by this amendment.
- `docs/superpowers/plans/2026-08-23-ghostinit-v2-generated-gate-stabilization.md`, `evidence/generated/v1-unsafe-syntax-dispositions.json`, and this amendment must be committed together before stabilization execution or base-SHA recording begins.

---

## Execution prerequisite: isolated preservation branch

- [ ] **Step 1: Read the worktree skill and verify the exact sibling root**

Run the worktree skill first, then use this verified sibling path:

```powershell
$repo = (Resolve-Path -LiteralPath 'D:\MyWork\Clis\ghostinit').Path
$parent = Split-Path -Parent $repo
$worktree = Join-Path $parent 'ghostinit-v2-implementation'
if ($worktree -eq $repo -or -not $worktree.StartsWith($parent + [IO.Path]::DirectorySeparatorChar)) {
  throw "Unsafe worktree path: $worktree"
}
if (Test-Path -LiteralPath $worktree) {
  throw "Worktree path already exists; inspect it instead of deleting it: $worktree"
}
```

- [ ] **Step 2: Export the current tracked state without modifying the current index**

From `D:\MyWork\Clis\ghostinit`, write a binary patch outside the repository:

```powershell
$repo = (Resolve-Path -LiteralPath 'D:\MyWork\Clis\ghostinit').Path
$baseSha = (git -C $repo rev-parse HEAD).Trim()
$artifactRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ghostinit-preservation-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $artifactRoot | Out-Null
$patch = Join-Path $artifactRoot 'working-tree.patch'
git diff --binary HEAD --output=$patch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$patchHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $patch).Hash
$sourceTest = Join-Path $repo 'tests\integration\init-upgrade.test.ts'
$sourceTestHash = if (Test-Path -LiteralPath $sourceTest) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceTest).Hash
} else { $null }
$trackedPaths = @(git -C $repo diff --name-only HEAD --) | Where-Object { $_ }
$approvedUntracked = if ($sourceTestHash) { @('tests/integration/init-upgrade.test.ts') } else { @() }
$manifestPath = Join-Path $artifactRoot 'manifest.json'
[pscustomobject]@{
  BaseSha=$baseSha
  Patch=$patch
  PatchHash=$patchHash
  TrackedPaths=$trackedPaths
  SourceTest=$sourceTest
  SourceTestHash=$sourceTestHash
  ApprovedUntracked=$approvedUntracked
} |
  ConvertTo-Json | Set-Content -NoNewline -LiteralPath $manifestPath
$pointer = Join-Path ([System.IO.Path]::GetTempPath()) 'ghostinit-v2-preservation.pointer'
if (Test-Path -LiteralPath $pointer) { throw "Preservation pointer already exists: $pointer" }
Set-Content -NoNewline -LiteralPath $pointer -Value $manifestPath
Get-Content -Raw -LiteralPath $manifestPath
```

Expected: a nonempty patch containing both staged and unstaged tracked changes relative to `HEAD`; the current index/status is unchanged.

- [ ] **Step 3: Create the implementation worktree from the plan commit**

Create from the immutable SHA printed in Step 2:

```powershell
$repo = (Resolve-Path -LiteralPath 'D:\MyWork\Clis\ghostinit').Path
$parent = Split-Path -Parent $repo
$worktree = Join-Path $parent 'ghostinit-v2-implementation'
$pointer = Join-Path ([System.IO.Path]::GetTempPath()) 'ghostinit-v2-preservation.pointer'
$manifestPath = Get-Content -Raw -LiteralPath $pointer
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$baseSha = [string]$manifest.BaseSha
git -C $repo worktree add -b br/ghostinit-v2-implementation $worktree $baseSha
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ((git -C $worktree rev-parse HEAD).Trim() -ne $baseSha) { throw 'Worktree base SHA mismatch' }
```

- [ ] **Step 4: Apply preserved tracked changes and copy the relevant untracked test**

Inside the new worktree:

```powershell
$repo = (Resolve-Path -LiteralPath 'D:\MyWork\Clis\ghostinit').Path
$parent = Split-Path -Parent $repo
$worktree = Join-Path $parent 'ghostinit-v2-implementation'
$pointer = Join-Path ([System.IO.Path]::GetTempPath()) 'ghostinit-v2-preservation.pointer'
$manifestPath = Get-Content -Raw -LiteralPath $pointer
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$baseSha = [string]$manifest.BaseSha
$patch = [string]$manifest.Patch
$patchHash = [string]$manifest.PatchHash
$sourceTest = [string]$manifest.SourceTest
$sourceTestHash = [string]$manifest.SourceTestHash
if (-not (Test-Path -LiteralPath $patch)) { throw "Missing preservation patch: $patch" }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $patch).Hash -ne $patchHash) {
  throw 'Preservation patch hash changed'
}
Set-Location -LiteralPath $worktree
git apply --index --whitespace=nowarn -- $patch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (Test-Path -LiteralPath $sourceTest) {
  Copy-Item -LiteralPath $sourceTest -Destination 'tests\integration\init-upgrade.test.ts'
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'tests\integration\init-upgrade.test.ts').Hash -ne $sourceTestHash) {
    throw 'Copied integration test hash mismatch'
  }
  git add -- 'tests/integration/init-upgrade.test.ts'
}
```

Substitute the printed absolute patch path from Step 2; do not construct a different path.

- [ ] **Step 5: Verify and snapshot the preserved baseline**

```powershell
$worktree = Join-Path (Split-Path -Parent 'D:\MyWork\Clis\ghostinit') 'ghostinit-v2-implementation'
Set-Location -LiteralPath $worktree
$pointer = Join-Path ([System.IO.Path]::GetTempPath()) 'ghostinit-v2-preservation.pointer'
$manifestPath = Get-Content -Raw -LiteralPath $pointer
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bun run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
bun run test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git status --short
$expected = @($manifest.TrackedPaths) + @($manifest.ApprovedUntracked) | Sort-Object -Unique
$actual = @(git diff --cached --name-only --) | Sort-Object -Unique
$difference = Compare-Object -ReferenceObject $expected -DifferenceObject $actual
if ($difference) { $difference | Format-Table; throw 'Preservation staged-path manifest mismatch' }
git commit -m "chore: preserve pre-rewrite working state"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Expected: host check and full baseline report zero failures. Before committing, compare `git diff --cached --name-only` to the source tracked patch manifest plus the approved integration test. The preservation commit intentionally records the user-authored pre-rewrite state so later rewrite commits are cleanly attributable. `.agents/` and `.playwright-mcp/` are absent.

---

### Task 1: Freeze the V1-to-V2 compatibility ledger

**Files:**

- Create: `docs/compatibility/v1-to-v2.schema.json`
- Create: `docs/compatibility/v1-to-v2.json`
- Create: `tests/unit/compatibility-ledger.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**

- Produces: versioned ledger schema and exhaustive V1 command/option/exit-code ledger.
- Consumes: `COMMANDS`, `CLI_OPTIONS`, `ExitCode`, and current capability constants.

- [ ] **Step 1: Install the exact JSON Schema test validator**

```bash
bun add --dev --exact ajv@8.17.1
```

Expected: `package.json` contains `"ajv": "8.17.1"` and `bun.lock` records the exact direct spec. Ajv is test/tooling infrastructure, not GhostInit runtime code.

- [ ] **Step 2: Write the failing exhaustive ledger test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CLI_OPTIONS } from "../../src/cli/args.js";
import { COMMANDS } from "../../src/cli/registry.js";
import { ExitCode } from "../../src/lib/errors.js";
import { BILLING_PROVIDERS, CACHE_PROVIDERS, PRESETS } from "../../src/lib/constants.js";
import {
  availableApps,
  availableDatabases,
  availableDeployTargets,
  availableFeatures,
  availableFrameworks,
  availableModes,
  availableStacks,
} from "../../src/lib/addons.js";

const root = resolve(import.meta.dir, "../..");
const ledger = JSON.parse(
  readFileSync(resolve(root, "docs/compatibility/v1-to-v2.json"), "utf8"),
) as {
  version: number;
  commands: Array<{ name: string; status: string }>;
  options: Array<{ name: string; status: string }>;
  exitCodes: Array<{ name: string; value: number; status: string }>;
  capabilities: Record<string, string[]>;
};
const ledgerSchema = JSON.parse(
  readFileSync(resolve(root, "docs/compatibility/v1-to-v2.schema.json"), "utf8"),
);

describe("V1-to-V2 compatibility ledger", () => {
  test("covers every V1 command and option exactly once", () => {
    const sourceCommands = ledger.commands
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    const sourceOptions = ledger.options
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    expect(sourceCommands).toEqual([...COMMANDS].toSorted());
    expect(sourceOptions).toEqual(Object.keys(CLI_OPTIONS).toSorted());
    expect(new Set(ledger.commands.map(({ name }) => name)).size).toBe(ledger.commands.length);
    expect(new Set(ledger.options.map(({ name }) => name)).size).toBe(ledger.options.length);
  });

  test("covers every stable V1 exit code exactly", () => {
    const expected = Object.entries(ExitCode)
      .map(([name, value]) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    const actual = ledger.exitCodes
      .map(({ name, value }) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    expect(actual).toEqual(expected);
  });

  test("captures every V1 capability axis", () => {
    expect(ledger.capabilities).toEqual({
      modes: [...availableModes],
      frameworks: [...availableFrameworks],
      apps: [...availableApps],
      databases: [...availableDatabases],
      billingProviders: [...BILLING_PROVIDERS],
      features: [...availableFeatures],
      presets: [...PRESETS],
      cacheProviders: [...CACHE_PROVIDERS],
      deployTargets: [...availableDeployTargets],
      stacks: [...availableStacks],
    });
  });

  test("uses only explicit decisions with actionable migration text", () => {
    const items = [...ledger.commands, ...ledger.options, ...ledger.exitCodes] as Array<{
      status: string;
      v2?: string | null;
      reason?: string;
      migration?: string;
    }>;
    for (const item of items) {
      expect(["retained", "changed", "deprecated", "removed", "added"]).toContain(item.status);
      expect(item.reason?.trim().length).toBeGreaterThan(0);
      expect(item.migration?.trim().length).toBeGreaterThan(0);
      if (item.status === "removed") expect(item.v2).toBeNull();
      else expect(typeof item.v2 === "string" && item.v2.length > 0).toBe(true);
    }
  });

  test("validates against the committed Draft 2020-12 schema", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(ledgerSchema);
    expect(validate(ledger), JSON.stringify(validate.errors)).toBe(true);
  });
});
```

- [ ] **Step 3: Run and verify missing-ledger failure**

```bash
bun test tests/unit/compatibility-ledger.test.ts --timeout 100000
```

Expected: FAIL with `ENOENT` for `docs/compatibility/v1-to-v2.json`.

- [ ] **Step 4: Create the strict ledger schema**

Create `docs/compatibility/v1-to-v2.schema.json` with Draft 2020-12, `additionalProperties:false` on every object, and these required fields:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ghostinit.dev/schemas/v1-to-v2-compatibility.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "$schema",
    "version",
    "sourceVersion",
    "targetVersion",
    "commands",
    "options",
    "exitCodes",
    "protocols",
    "config",
    "capabilities",
    "upgrade"
  ],
  "properties": {
    "$schema": { "const": "./v1-to-v2.schema.json" },
    "version": { "const": 1 },
    "sourceVersion": { "type": "string", "minLength": 1 },
    "targetVersion": { "type": "string", "minLength": 1 },
    "commands": { "$ref": "#/$defs/items" },
    "options": { "$ref": "#/$defs/items" },
    "exitCodes": {
      "type": "array",
      "items": { "$ref": "#/$defs/exitItem" }
    },
    "protocols": { "$ref": "#/$defs/items" },
    "config": { "$ref": "#/$defs/items" },
    "capabilities": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "modes",
        "frameworks",
        "apps",
        "databases",
        "billingProviders",
        "features",
        "presets",
        "cacheProviders",
        "deployTargets",
        "stacks"
      ],
      "properties": {
        "modes": { "$ref": "#/$defs/stringArray" },
        "frameworks": { "$ref": "#/$defs/stringArray" },
        "apps": { "$ref": "#/$defs/stringArray" },
        "databases": { "$ref": "#/$defs/stringArray" },
        "billingProviders": { "$ref": "#/$defs/stringArray" },
        "features": { "$ref": "#/$defs/stringArray" },
        "presets": { "$ref": "#/$defs/stringArray" },
        "cacheProviders": { "$ref": "#/$defs/stringArray" },
        "deployTargets": { "$ref": "#/$defs/stringArray" },
        "stacks": { "$ref": "#/$defs/stringArray" }
      }
    },
    "upgrade": { "$ref": "#/$defs/item" }
  },
  "$defs": {
    "status": { "enum": ["retained", "changed", "deprecated", "removed", "added"] },
    "stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "item": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "status", "v2", "reason", "migration"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "status": { "$ref": "#/$defs/status" },
        "v2": { "type": ["string", "null"] },
        "reason": { "type": "string", "minLength": 1 },
        "migration": { "type": "string", "minLength": 1 }
      },
      "allOf": [
        {
          "if": { "properties": { "status": { "const": "removed" } } },
          "then": { "properties": { "v2": { "type": "null" } } },
          "else": { "properties": { "v2": { "type": "string", "minLength": 1 } } }
        }
      ]
    },
    "exitItem": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "value", "status", "v2", "reason", "migration"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "value": { "type": "integer" },
        "status": { "$ref": "#/$defs/status" },
        "v2": { "type": ["string", "null"] },
        "reason": { "type": "string", "minLength": 1 },
        "migration": { "type": "string", "minLength": 1 }
      },
      "allOf": [
        {
          "if": { "properties": { "status": { "const": "removed" } } },
          "then": { "properties": { "v2": { "type": "null" } } },
          "else": { "properties": { "v2": { "type": "string", "minLength": 1 } } }
        }
      ]
    },
    "items": { "type": "array", "items": { "$ref": "#/$defs/item" } }
  }
}
```

- [ ] **Step 5: Create the complete ledger**

Use this complete file (compact one-line entries are intentional so every decision is visible):

```json
{
  "$schema": "./v1-to-v2.schema.json",
  "version": 1,
  "sourceVersion": "0.1.0",
  "targetVersion": "2.0.0",
  "commands": [
    {
      "name": "create",
      "status": "retained",
      "v2": "create",
      "reason": "Project creation remains a core workflow.",
      "migration": "Keep using ghostinit create; V2 validates the complete desired state before writing."
    },
    {
      "name": "init",
      "status": "retained",
      "v2": "init",
      "reason": "Current-directory initialization remains supported.",
      "migration": "Keep using ghostinit init; V2 applies the same resolver as create."
    },
    {
      "name": "upgrade",
      "status": "retained",
      "v2": "upgrade",
      "reason": "Managed projects require a migration command.",
      "migration": "Run upgrade --dry-run first; V2 changes only proven generator-owned files."
    },
    {
      "name": "add",
      "status": "retained",
      "v2": "add",
      "reason": "Architectural artifact generation remains supported.",
      "migration": "Use the same add kinds; V2 validates kind-specific positional forms strictly."
    },
    {
      "name": "sync",
      "status": "retained",
      "v2": "sync",
      "reason": "Desired-state reconciliation remains supported.",
      "migration": "Keep using sync; V2 reconciles from ghostinit.config.json transactionally."
    },
    {
      "name": "status",
      "status": "retained",
      "v2": "status",
      "reason": "Humans and agents need project state visibility.",
      "migration": "Keep using status; V2 reports desired, owned, drifted, and pending state separately."
    },
    {
      "name": "check",
      "status": "retained",
      "v2": "check",
      "reason": "Architecture enforcement remains a first-class command.",
      "migration": "Keep using check; V2 fails closed on parser, resolver, and analysis-limit errors."
    },
    {
      "name": "doctor",
      "status": "retained",
      "v2": "doctor",
      "reason": "Configuration-aware diagnostics remain supported.",
      "migration": "Keep using doctor; V2 runs only checks applicable to resolved configuration."
    },
    {
      "name": "version",
      "status": "retained",
      "v2": "version",
      "reason": "Scripts rely on version discovery.",
      "migration": "No command change; JSON mode returns the versioned V2 envelope."
    },
    {
      "name": "help",
      "status": "retained",
      "v2": "help",
      "reason": "Human discoverability remains required.",
      "migration": "No command change; help is generated from the typed command registry."
    },
    {
      "name": "capabilities",
      "status": "added",
      "v2": "capabilities",
      "reason": "Agents need the finite proof-gated support catalog.",
      "migration": "Use capabilities --json to discover supported V2 bindings before create."
    }
  ],
  "options": [
    {
      "name": "cwd",
      "status": "retained",
      "v2": "cwd",
      "reason": "Commands need an explicit project root.",
      "migration": "Keep using --cwd; V2 canonicalizes and contains the path before IO."
    },
    {
      "name": "json",
      "status": "retained",
      "v2": "json",
      "reason": "Agents require machine output.",
      "migration": "Keep using --json; consume the versioned V2 schema instead of V1 field spreading."
    },
    {
      "name": "yes",
      "status": "retained",
      "v2": "yes",
      "reason": "Automation needs noninteractive defaults.",
      "migration": "Keep using --yes; unresolved required choices now fail before side effects."
    },
    {
      "name": "ci",
      "status": "retained",
      "v2": "ci",
      "reason": "CI must never prompt.",
      "migration": "Keep using --ci; V2 returns a typed missing-input error instead of prompting."
    },
    {
      "name": "dry-run",
      "status": "retained",
      "v2": "dry-run",
      "reason": "Safe preview is required.",
      "migration": "Keep using --dry-run; V2 performs no lock, write, cleanup, install, or secret action."
    },
    {
      "name": "force",
      "status": "retained",
      "v2": "force",
      "reason": "Explicit conflict override remains necessary.",
      "migration": "Keep using --force only where the command registry declares it applicable."
    },
    {
      "name": "no-install",
      "status": "retained",
      "v2": "no-install",
      "reason": "Users may defer dependency installation.",
      "migration": "Keep using --no-install; V2 still preflights the full project plan."
    },
    {
      "name": "runtime",
      "status": "retained",
      "v2": "execution-runtime",
      "reason": "Generated server execution runtime remains selectable.",
      "migration": "Map --runtime to the app/backend execution runtime; package manager and framework route runtime are separate."
    },
    {
      "name": "quiet",
      "status": "retained",
      "v2": "quiet",
      "reason": "Human progress verbosity remains configurable.",
      "migration": "Keep using --quiet; JSON stdout is unaffected."
    },
    {
      "name": "debug",
      "status": "retained",
      "v2": "debug",
      "reason": "Troubleshooting requires safe diagnostics.",
      "migration": "Keep using --debug; secrets remain redacted."
    },
    {
      "name": "version",
      "status": "retained",
      "v2": "version",
      "reason": "The global version flag remains supported.",
      "migration": "Keep using --version."
    },
    {
      "name": "help",
      "status": "retained",
      "v2": "help",
      "reason": "The long help flag remains supported.",
      "migration": "Keep using --help."
    },
    {
      "name": "h",
      "status": "retained",
      "v2": "help",
      "reason": "The short help alias remains useful.",
      "migration": "Keep using -h; it resolves to --help."
    },
    {
      "name": "kind",
      "status": "retained",
      "v2": "kind",
      "reason": "Module generation distinguishes command/query kinds.",
      "migration": "Keep using --kind only on registry-declared add forms."
    },
    {
      "name": "check",
      "status": "retained",
      "v2": "check",
      "reason": "Read-only sync checking remains supported.",
      "migration": "Keep using sync --check; drift returns exit code 8."
    },
    {
      "name": "mode",
      "status": "retained",
      "v2": "mode",
      "reason": "Single and monorepo packaging remain supported.",
      "migration": "Keep using --mode or set mode in ghostinit.config.json."
    },
    {
      "name": "framework",
      "status": "retained",
      "v2": "apps[].target",
      "reason": "Web target selection remains supported.",
      "migration": "Map --framework to the primary web app target."
    },
    {
      "name": "billing",
      "status": "retained",
      "v2": "capabilities.billing",
      "reason": "Billing provider selection remains supported.",
      "migration": "Keep using --billing or set provider IDs in capabilities.billing."
    },
    {
      "name": "features",
      "status": "deprecated",
      "v2": "capabilities",
      "reason": "The combined feature string hides independent capability configuration.",
      "migration": "Use explicit --with-eve/--with-i18n or ghostinit.config.json; alias removal target is 3.0.0."
    },
    {
      "name": "database",
      "status": "retained",
      "v2": "backend.database",
      "reason": "Persistence adapter selection remains supported.",
      "migration": "Keep using --database or set backend.database."
    },
    {
      "name": "apps",
      "status": "retained",
      "v2": "apps",
      "reason": "Application target selection remains supported.",
      "migration": "Keep using --apps; V2 expands each target into an explicit app object."
    },
    {
      "name": "preset",
      "status": "retained",
      "v2": "preset",
      "reason": "Goal-oriented defaults improve human setup.",
      "migration": "Keep using --preset; the resolved config records every resulting choice."
    },
    {
      "name": "cache",
      "status": "retained",
      "v2": "capabilities.cache",
      "reason": "Cache adapter selection remains supported.",
      "migration": "Keep using --cache or set capabilities.cache."
    },
    {
      "name": "deploy",
      "status": "retained",
      "v2": "apps[].deploy",
      "reason": "Deployment binding remains selectable.",
      "migration": "Map --deploy to the primary app; multi-app projects configure deploy per app."
    },
    {
      "name": "stack",
      "status": "deprecated",
      "v2": "apps",
      "reason": "Stack aliases conflate framework and app targets.",
      "migration": "Use --framework plus --apps or explicit app objects; alias removal target is 3.0.0."
    },
    {
      "name": "with-auth",
      "status": "retained",
      "v2": "capabilities.auth",
      "reason": "Authentication remains selectable.",
      "migration": "Keep using --with-auth for defaults or configure auth methods/plugins explicitly."
    },
    {
      "name": "with-api",
      "status": "retained",
      "v2": "transport",
      "reason": "Typed remote transport remains selectable.",
      "migration": "Keep using --with-api; V2 emits transport only when selected clients require it."
    },
    {
      "name": "with-email",
      "status": "retained",
      "v2": "capabilities.email",
      "reason": "Email remains selectable.",
      "migration": "Keep using --with-email or set capabilities.email."
    },
    {
      "name": "with-analytics",
      "status": "retained",
      "v2": "capabilities.analytics",
      "reason": "Analytics remains selectable.",
      "migration": "Keep using --with-analytics or set capabilities.analytics."
    },
    {
      "name": "with-cache",
      "status": "retained",
      "v2": "capabilities.cache",
      "reason": "The cache convenience flag remains supported.",
      "migration": "Use --with-cache for the default verified cache or select capabilities.cache explicitly."
    },
    {
      "name": "with-eve",
      "status": "retained",
      "v2": "capabilities.eve",
      "reason": "Eve remains selectable.",
      "migration": "Keep using --with-eve or set capabilities.eve."
    },
    {
      "name": "with-i18n",
      "status": "retained",
      "v2": "capabilities.i18n",
      "reason": "Internationalization remains selectable.",
      "migration": "Keep using --with-i18n or set capabilities.i18n."
    },
    {
      "name": "with-pdf",
      "status": "retained",
      "v2": "capabilities.pdf",
      "reason": "PDF generation remains selectable.",
      "migration": "Keep using --with-pdf or set capabilities.pdf."
    },
    {
      "name": "with-messaging",
      "status": "retained",
      "v2": "capabilities.messaging",
      "reason": "Messaging remains selectable.",
      "migration": "Keep using --with-messaging or set capabilities.messaging."
    },
    {
      "name": "fix",
      "status": "retained",
      "v2": "fix",
      "reason": "Explicit safe repair remains supported.",
      "migration": "Keep using --fix on check/doctor; V2 dry-run and locking rules apply."
    },
    {
      "name": "verbose",
      "status": "retained",
      "v2": "verbose",
      "reason": "Detailed status output remains useful.",
      "migration": "Keep using --verbose on registry-declared commands."
    },
    {
      "name": "list",
      "status": "retained",
      "v2": "list",
      "reason": "Discovering add kinds remains useful.",
      "migration": "Keep using add --list; values are generated from the command registry."
    }
  ],
  "exitCodes": [
    {
      "name": "OK",
      "value": 0,
      "status": "retained",
      "v2": "OK",
      "reason": "Successful commands remain zero.",
      "migration": "No change."
    },
    {
      "name": "GENERAL_ERROR",
      "value": 1,
      "status": "retained",
      "v2": "GENERAL_ERROR",
      "reason": "Unexpected failures retain the general code.",
      "migration": "No change."
    },
    {
      "name": "INVALID_ARGUMENTS",
      "value": 2,
      "status": "retained",
      "v2": "INVALID_ARGUMENTS",
      "reason": "Invalid invocation remains distinguishable.",
      "migration": "No change."
    },
    {
      "name": "DRIFT",
      "value": 8,
      "status": "retained",
      "v2": "DRIFT",
      "reason": "Read-only drift remains scriptable.",
      "migration": "sync --check now consistently returns 8."
    },
    {
      "name": "CANCELLED",
      "value": 130,
      "status": "retained",
      "v2": "CANCELLED",
      "reason": "Interactive cancellation keeps shell convention.",
      "migration": "No change."
    },
    {
      "name": "MISSING_DEPENDENCY",
      "value": 16,
      "status": "retained",
      "v2": "MISSING_DEPENDENCY",
      "reason": "Missing tools remain distinguishable.",
      "migration": "No change."
    },
    {
      "name": "VALIDATION_ERROR",
      "value": 17,
      "status": "retained",
      "v2": "VALIDATION_ERROR",
      "reason": "Configuration failures remain distinguishable.",
      "migration": "Read structured nested details in JSON mode."
    },
    {
      "name": "CONFLICT_ERROR",
      "value": 18,
      "status": "retained",
      "v2": "CONFLICT_ERROR",
      "reason": "Owned/user conflict remains distinguishable.",
      "migration": "Read structured conflict paths in JSON mode."
    },
    {
      "name": "LOCK_ERROR",
      "value": 19,
      "status": "retained",
      "v2": "LOCK_ERROR",
      "reason": "Concurrent mutation remains distinguishable.",
      "migration": "No change."
    },
    {
      "name": "GIT_DIRTY_ERROR",
      "value": 20,
      "status": "retained",
      "v2": "GIT_DIRTY_ERROR",
      "reason": "Dirty-tree protection remains distinguishable.",
      "migration": "Operational Git errors now fail closed with this code."
    },
    {
      "name": "INCOMPATIBLE_SCHEMA",
      "value": 21,
      "status": "retained",
      "v2": "INCOMPATIBLE_SCHEMA",
      "reason": "State/schema migration failures remain distinguishable.",
      "migration": "Run upgrade --dry-run and follow migration hints."
    },
    {
      "name": "GENERATION_ERROR",
      "value": 22,
      "status": "retained",
      "v2": "GENERATION_ERROR",
      "reason": "Planning/rendering failures remain distinguishable.",
      "migration": "Read versioned plan diagnostics in JSON details."
    },
    {
      "name": "INVALID_STATE",
      "value": 23,
      "status": "retained",
      "v2": "INVALID_STATE",
      "reason": "Corrupt/missing managed state remains distinguishable.",
      "migration": "Use status/upgrade recovery guidance."
    }
  ],
  "protocols": [
    {
      "name": "json-envelope-v1",
      "status": "changed",
      "v2": "json-envelope-v2",
      "reason": "V1 allowed details to overwrite protocol fields and did not redact the full error.",
      "migration": "Validate version 2, read error.details, and preserve the stable machine code/exit code."
    }
  ],
  "config": [
    {
      "name": "cli-create-flags",
      "status": "retained",
      "v2": "cli-overrides",
      "reason": "One-shot automation remains useful.",
      "migration": "Flags override the desired state only where the typed command registry permits."
    },
    {
      "name": ".ghostinit/state.json",
      "status": "changed",
      "v2": ".ghostinit/state.json",
      "reason": "V1 mixed desired and internal state.",
      "migration": "Treat V2 state as machine-owned hashes/history only; edit ghostinit.config.json instead."
    },
    {
      "name": "ghostinit.config.json",
      "status": "added",
      "v2": "ghostinit.config.json",
      "reason": "V2 needs human-editable desired state.",
      "migration": "upgrade --dry-run derives this file from V1 state and flags."
    }
  ],
  "capabilities": {
    "modes": ["monorepo", "single"],
    "frameworks": ["nextjs", "tanstack-start"],
    "apps": ["web", "mobile", "desktop"],
    "databases": ["postgres", "convex", "none"],
    "billingProviders": ["stripe", "chargily", "paddle", "polar"],
    "features": ["eve", "i18n"],
    "presets": ["saas", "frontend", "custom"],
    "cacheProviders": ["redis", "none"],
    "deployTargets": ["vercel", "fly", "docker", "none"],
    "stacks": ["nextjs", "tanstack-start", "expo", "both"]
  },
  "upgrade": {
    "name": "upgrade-v1",
    "status": "changed",
    "v2": "upgrade-v2",
    "reason": "V1 can overwrite fresh state and user-modified files.",
    "migration": "Run V2 upgrade --dry-run; only hash-proven owned files change automatically and every conflict is reported."
  }
}
```

- [ ] **Step 6: Validate JSON, schema shape, and exhaustive test**

```bash
bun -e "JSON.parse(await Bun.file('docs/compatibility/v1-to-v2.schema.json').text()); JSON.parse(await Bun.file('docs/compatibility/v1-to-v2.json').text()); console.log('compatibility JSON ok')"
bun test tests/unit/compatibility-ledger.test.ts --timeout 100000
```

Expected: `compatibility JSON ok`; 5 tests pass, including Draft 2020-12 validation.

- [ ] **Step 7: Commit**

```bash
git add docs/compatibility/v1-to-v2.schema.json docs/compatibility/v1-to-v2.json tests/unit/compatibility-ledger.test.ts package.json bun.lock
git diff --cached --name-only
git commit -m "docs: freeze V1 to V2 compatibility decisions"
```

Expected cached paths are exactly the five Task 1 files.

---

### Task 2: Pin Bun 1.4.0 and TypeScript 7.0.2 reproducibly

**Files:**

- Modify: `package.json`
- Modify: `bunfig.toml`
- Modify: `tooling/typescript-config/base.json`
- Modify: `packages/versions/src/index.ts`
- Modify: `bun.lock`
- Create: `tests/unit/toolchain-v2.test.ts`

**Interfaces:**

- Produces exact host package-manager/compiler metadata and frozen Bun 1.4.0 install behavior.
- Consumes the preserved baseline from the prerequisite.

- [ ] **Step 1: Write the failing toolchain test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

describe("exact V2 host toolchain", () => {
  test("pins package manager, compiler, and Bun types", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      packageManager: string;
      engines: { bun: string };
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.packageManager).toBe("bun@1.4.0");
    expect(pkg.engines.bun).toBe("1.4.0");
    expect(pkg.devDependencies.typescript).toBe("7.0.2");
    expect(pkg.devDependencies["@types/bun"]).toBe("1.4.0");
    for (const spec of [
      ...Object.values(pkg.dependencies),
      ...Object.values(pkg.devDependencies),
    ]) {
      expect(spec).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("uses strict isolated installs and supported lockfile configuration", () => {
    const bunfig = readFileSync(resolve(root, "bunfig.toml"), "utf8");
    const tsconfig = JSON.parse(
      readFileSync(resolve(root, "tooling/typescript-config/base.json"), "utf8"),
    ) as { compilerOptions: { types: string[] } };
    expect(bunfig).toContain('linker = "isolated"');
    expect(bunfig).toContain("hoist = false");
    expect(bunfig).toContain("frozenLockfile = true");
    expect(bunfig).not.toContain("[install.lockfile]");
    expect(tsconfig.compilerOptions.types).toEqual(["bun"]);
  });

  test("corrects the nonexistent Expo updates pin", async () => {
    const versions = await import("../../packages/versions/src/index.js");
    expect(versions.expo["expo-updates"]).toBe("29.0.13");
  });
});
```

- [ ] **Step 2: Run and verify failure against V1 metadata**

```bash
bun test tests/unit/toolchain-v2.test.ts --timeout 100000
```

Expected: FAIL on `bun@1.3.14`, Bun engine, ranged direct specs, `@types/bun`, bunfig lockfile section, `bun-types` ambient name, and `expo-updates@0.29.13`.

- [ ] **Step 3: Update metadata while keeping lock writes temporarily enabled**

Set these exact fields:

```json
{
  "devDependencies": {
    "@types/bun": "1.4.0",
    "typescript": "7.0.2"
  },
  "engines": {
    "bun": "1.4.0",
    "node": ">=22.0.0"
  },
  "packageManager": "bun@1.4.0"
}
```

Set `tooling/typescript-config/base.json` to `"types": ["bun"]`. Replace the install portion of `bunfig.toml` temporarily with:

Remove `^`/`~` from every root `dependencies` and `devDependencies` value so each is its existing exact semantic version. Change `packages/versions/src/index.ts` to `"expo-updates": "29.0.13"` and make no other V1 registry change.

```toml
[install]
linker = "isolated"
hoist = false
frozenLockfile = false

[install.scopes]
"@*" = { url = "https://registry.npmjs.org/" }
```

Remove the unsupported `[install.lockfile] path` section.

- [ ] **Step 4: Regenerate with Bun 1.4.0, then freeze**

```bash
bun --version
bun install
```

Expected first line: `1.4.0`; install exits zero and rewrites `bun.lock` with the exact direct specs.

Change only `frozenLockfile = false` to `frozenLockfile = true`, then run:

```powershell
$before = (Get-FileHash -Algorithm SHA256 -LiteralPath 'bun.lock').Hash
bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$after = (Get-FileHash -Algorithm SHA256 -LiteralPath 'bun.lock').Hash
if ($before -ne $after) { throw 'Frozen install modified bun.lock' }
```

Expected: exit zero and identical before/after SHA-256 hashes.

- [ ] **Step 5: Run exact version, test, check, and build gates**

```bash
bun --version
bunx --no-install tsc --version
bun test tests/unit/toolchain-v2.test.ts --timeout 100000
bun run check
bun run build
```

Expected: versions `1.4.0` and `Version 7.0.2`; 3 tests pass; check/build exit zero. Any missing isolated dependency is added to its owning manifest rather than enabling hoisting fallback.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add package.json bunfig.toml tooling/typescript-config/base.json packages/versions/src/index.ts bun.lock tests/unit/toolchain-v2.test.ts
git diff --cached --name-only
git commit -m "build: pin the host to Bun 1.4.0 and TypeScript 7.0.2"
```

Expected cached paths are exactly the six Task 2 files because the preservation baseline was already committed.

---

### Task 3: Typecheck every automation script with TypeScript 7.0.2

**Files:**

- Create: `tsconfig.scripts.json`
- Modify: `package.json`
- Modify: `scripts/build.ts`
- Create: `tests/unit/scripts-typecheck.test.ts`

**Interfaces:**

- Produces `bun run typecheck:scripts`; root `typecheck` invokes project builds then the script project without a TS6310 reference.
- Consumes Task 2 toolchain.

- [ ] **Step 1: Write the failing script-project test**

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("automation scripts are checked without an invalid project reference", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const rootConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8")) as {
    references: Array<{ path: string }>;
  };
  const scriptConfig = JSON.parse(readFileSync(resolve(root, "tsconfig.scripts.json"), "utf8")) as {
    include: string[];
    compilerOptions: {
      noEmit: boolean;
      composite: boolean;
      allowImportingTsExtensions: boolean;
    };
  };
  expect(pkg.scripts["typecheck:scripts"]).toBe(
    "bunx --no-install tsc -p tsconfig.scripts.json --noEmit",
  );
  expect(pkg.scripts.typecheck).toBe("bunx --no-install tsc -b && bun run typecheck:scripts");
  expect(rootConfig.references).not.toContainEqual({ path: "./tsconfig.scripts.json" });
  expect(scriptConfig).toMatchObject({
    include: ["scripts/**/*.ts"],
    compilerOptions: { noEmit: true, composite: false, allowImportingTsExtensions: true },
  });

  const buildScript = readFileSync(resolve(root, "scripts/build.ts"), "utf8");
  expect(buildScript).not.toContain("as any");
  expect(buildScript).not.toContain('["bunx", "tsc"');
  expect(buildScript).toContain("./node_modules/typescript/bin/tsc");
});
```

- [ ] **Step 2: Run and verify missing config/script failure**

```bash
bun test tests/unit/scripts-typecheck.test.ts --timeout 100000
```

Expected: FAIL because `tsconfig.scripts.json` and `typecheck:scripts` are absent.

- [ ] **Step 3: Add a standalone no-emit script project**

Create:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "allowImportingTsExtensions": true,
    "types": ["bun"]
  },
  "include": ["scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Add exact package scripts:

```json
"typecheck": "bunx --no-install tsc -b && bun run typecheck:scripts",
"typecheck:scripts": "bunx --no-install tsc -p tsconfig.scripts.json --noEmit"
```

Do not add the script project to root `references`.

- [ ] **Step 4: Re-run RED against the now-present configuration**

```bash
bun test tests/unit/scripts-typecheck.test.ts --timeout 100000
```

Expected: FAIL specifically because `scripts/build.ts` still contains `as any`, still invokes `["bunx", "tsc", ...]`, and lacks the exact local compiler path. The config/script assertions now pass.

- [ ] **Step 5: Replace the known unsafe build cast and compiler invocation**

In `scripts/build.ts`, replace the `as any` size expression with:

```ts
const bundleKiB = result.outputs.reduce((total, output) => total + output.size, 0) / 1024;
console.log(
  `[build]   ✓ JS bundle OK (${result.outputs.length} output(s), ${bundleKiB.toFixed(1)} KiB)`,
);
```

Define the exact local compiler command once:

```ts
const localTsc = [process.execPath, "./node_modules/typescript/bin/tsc"] as const;
```

Replace both `Bun.spawnSync` compiler command arrays with:

```ts
cmd: [...localTsc, "-p", "packages/versions/tsconfig.json"],
```

and:

```ts
cmd: [...localTsc, "-p", "src/tsconfig.json"],
```

respectively. This prevents an auto-installed compiler outside `bun.lock`.

- [ ] **Step 6: Run GREEN and the script compiler**

```bash
bun run typecheck:scripts
bun test tests/unit/scripts-typecheck.test.ts --timeout 100000
bun run typecheck
```

Expected: all exit zero. `allowImportingTsExtensions` is required because `scripts/sync-turbo-env.ts` intentionally imports the executable source module `../src/lib/env-manifest.ts` under no-emit checking.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.scripts.json package.json scripts/build.ts tests/unit/scripts-typecheck.test.ts
git diff --cached --name-only
git commit -m "build: typecheck automation scripts with TypeScript 7.0.2"
```

Expected cached paths are exactly the four Task 3 files.

---

### Task 4: Inventory TypeScript 7.0.2 migration obligations

**Files:**

- Create: `evidence/toolchain/typescript-7.0.2.json`
- Create: `tests/unit/typescript7-inventory.test.ts`

**Interfaces:**

- Produces a machine-checked migration inventory consumed by later target/generation plans.
- Consumes the exact compiler/install and script-project results from Tasks 2–3 plus repository source.

- [ ] **Step 1: Write the failing evidence test**

```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("TypeScript 7.0.2 obligations are enumerated and point to real sources", () => {
  const evidence = JSON.parse(
    readFileSync(resolve(root, "evidence/toolchain/typescript-7.0.2.json"), "utf8"),
  ) as {
    compiler: string;
    entries: Array<{
      id: string;
      sources: string[];
      phase: string;
      disposition: "proven" | "migration-required" | "proof-required";
      replacement: string;
    }>;
  };
  expect(evidence.compiler).toBe("typescript@7.0.2");
  expect(evidence.entries.map(({ id }) => id)).toEqual([
    "host-compiler",
    "automation-scripts",
    "generated-lint-compiler-api",
    "next-typescript-cli",
    "doctor-typescript-version",
    "desktop-base-url",
  ]);
  for (const entry of evidence.entries) {
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(entry.replacement.length).toBeGreaterThan(10);
    for (const source of entry.sources) expect(existsSync(resolve(root, source))).toBe(true);
  }
  const scriptSources = evidence.entries.find(({ id }) => id === "automation-scripts")?.sources;
  const actualScripts = readdirSync(resolve(root, "scripts"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `scripts/${name}`)
    .toSorted();
  expect(scriptSources?.toSorted()).toEqual(actualScripts);

  const reliancePatterns = [
    /require\(["']typescript["']\)/,
    /runCommand\(["']bunx["'],\s*\[["']tsc["']/,
    /cmd:\s*\[["']bunx["'],\s*["']tsc["']/,
    /baseUrl:\s*["']\.["']/,
  ];
  const roots = ["src", "scripts", "tooling", "packages"];
  const matched = new Set<string>();
  const visit = (relative: string): void => {
    const absolute = resolve(root, relative);
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory() && !["node_modules", "dist", ".git"].includes(entry.name))
        visit(child);
      else if (/\.(?:ts|tsx|js|json)$/.test(entry.name)) {
        const content = readFileSync(resolve(root, child), "utf8");
        if (reliancePatterns.some((pattern) => pattern.test(content))) matched.add(child);
      }
    }
  };
  roots.forEach(visit);
  const covered = new Set(evidence.entries.flatMap(({ sources }) => sources));
  expect([...matched].filter((source) => !covered.has(source))).toEqual([]);
});
```

- [ ] **Step 2: Run and verify missing evidence**

```bash
bun test tests/unit/typescript7-inventory.test.ts --timeout 100000
```

Expected: FAIL with `ENOENT` for the evidence file.

- [ ] **Step 3: Create the exact inventory**

Create `evidence/toolchain/typescript-7.0.2.json` with ordered entries:

```json
{
  "compiler": "typescript@7.0.2",
  "verifiedAt": "2026-08-23",
  "entries": [
    {
      "id": "host-compiler",
      "sources": ["package.json", "tooling/typescript-config/base.json"],
      "phase": "1A",
      "disposition": "proven",
      "replacement": "Host source and declaration builds invoke the exact installed tsc binary."
    },
    {
      "id": "automation-scripts",
      "sources": [
        "scripts/build.ts",
        "scripts/check-versions.ts",
        "scripts/sync-turbo-env.ts",
        "scripts/test-generated.ts"
      ],
      "phase": "1A",
      "disposition": "proven",
      "replacement": "A standalone strict no-emit project checks every scripts/**/*.ts file with TypeScript 7.0.2."
    },
    {
      "id": "generated-lint-compiler-api",
      "sources": ["src/templates/tooling/lint-scripts.ts"],
      "phase": "3",
      "disposition": "migration-required",
      "replacement": "Replace require('typescript') compiler API use with pinned OXC parser APIs and fixtures."
    },
    {
      "id": "next-typescript-cli",
      "sources": ["packages/versions/src/index.ts", "src/templates/apps/core.ts"],
      "phase": "3",
      "disposition": "migration-required",
      "replacement": "Select a stable Next release whose documented CLI typecheck path passes TypeScript 7.0.2 build fixtures."
    },
    {
      "id": "doctor-typescript-version",
      "sources": ["src/commands/doctor/versions.ts", "src/templates/agentic.ts"],
      "phase": "2",
      "disposition": "migration-required",
      "replacement": "Resolve the exact installed compiler metadata without executing bunx or untrusted project-local binaries."
    },
    {
      "id": "desktop-base-url",
      "sources": [
        "src/templates/apps/desktop-core.ts",
        "src/templates/modes/single/composers/desktop.ts"
      ],
      "phase": "6",
      "disposition": "proof-required",
      "replacement": "Compile a focused TypeScript 7.0.2 desktop fixture; retain baseUrl only if the exact compiler accepts it, otherwise resolve paths relative to each tsconfig."
    }
  ]
}
```

- [ ] **Step 4: Run the evidence and script-compiler gates**

```bash
bun test tests/unit/typescript7-inventory.test.ts --timeout 100000
bun run typecheck:scripts
```

Expected: test passes and scripts compile.

- [ ] **Step 5: Commit**

```bash
git add evidence/toolchain/typescript-7.0.2.json tests/unit/typescript7-inventory.test.ts
git diff --cached --name-only
git commit -m "test: inventory TypeScript 7.0.2 migration obligations"
```

Expected cached paths are exactly the two Task 4 files.

---

### Task 5: Fix required CI and verify the packed V1 CLI artifact

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `package.json`
- Modify: `src/cli.ts`
- Modify: `scripts/e2e-smoke.sh`
- Create: `tests/unit/ci-v2.test.ts`
- Create: `tests/integration/packed-cli.test.ts`

**Interfaces:**

- Produces required CI on `master`/`develop`, exact Bun 1.4.0 setup, script typecheck, foundation tests, declaration metadata, and tarball smoke.
- Consumes Tasks 1–4.

- [ ] **Step 1: Write the failing semantic CI test**

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

type Workflow = {
  on: {
    push: { branches: string[] };
    pull_request: { branches: string[] };
  };
  jobs: Record<
    string,
    {
      if?: string | boolean;
      steps: Array<{
        name?: string;
        if?: string | boolean;
        uses?: string;
        with?: Record<string, unknown>;
        run?: string;
      }>;
    }
  >;
};

const parseWorkflow = (name: string): Workflow =>
  Bun.YAML.parse(readFileSync(resolve(root, `.github/workflows/${name}`), "utf8")) as Workflow;

test("required CI uses exact branches, Bun, and retained gates", () => {
  const ci = parseWorkflow("ci.yml");
  const e2e = parseWorkflow("e2e.yml");
  expect(ci.on.push.branches).toEqual(["master", "develop"]);
  expect(ci.on.pull_request.branches).toEqual(["master", "develop"]);

  const allSteps = [...Object.values(ci.jobs), ...Object.values(e2e.jobs)].flatMap(
    ({ steps }) => steps,
  );
  const bunPins = allSteps
    .filter(({ uses }) => uses?.startsWith("oven-sh/setup-bun@"))
    .map(({ with: input }) => input?.["bun-version"]);
  expect(bunPins.length).toBeGreaterThan(0);
  expect(new Set(bunPins)).toEqual(new Set(["1.4.0"]));

  const normalizedRuns = (job: keyof typeof ci.jobs): string[] => {
    expect(ci.jobs[job].if).toBeUndefined();
    return ci.jobs[job].steps
      .filter((step) => step.if === undefined)
      .map(({ run }) => run)
      .filter((run): run is string => typeof run === "string")
      .map((run) => run.replace(/\s+/g, " ").trim());
  };
  const checkRuns = normalizedRuns("check-and-test");
  for (const required of [
    "bun install --frozen-lockfile",
    "bun run check",
    "bun run typecheck",
    "bun run typecheck:scripts",
    "bun run check:versions",
    "bun run test",
    "bun run pretest:fixtures",
    "bun run test:fixtures",
    "bun run build",
    "tests/unit/compatibility-ledger.test.ts",
    "tests/integration/packed-cli.test.ts",
  ]) {
    expect(checkRuns.some((run) => run.includes(required))).toBe(true);
  }
  expect(normalizedRuns("generated-project-smoke")).toContain("bun run test:generated");
  const fastJob = e2e.jobs["e2e-fast"];
  expect(fastJob.if).toBeUndefined();
  const packagedCheck = fastJob.steps.find(
    ({ name }) => name === "Run packaged architecture check",
  );
  expect(packagedCheck?.if).toBeUndefined();
  expect(packagedCheck?.run).toBe(
    './dist/cli.js check --cwd "$RUNNER_TEMP/gi-test/e2e-fast" --json',
  );

  const e2eRuns = Object.values(e2e.jobs).flatMap(({ steps }) =>
    steps.map(({ run }) => run).filter((run): run is string => typeof run === "string"),
  );
  expect(
    e2eRuns.some((run) =>
      /(?:\bghostinit|(?:^|\/)dist\/cli\.js)\s+check[^\n]*\|\|\s*true/.test(run),
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: Write the failing packed-artifact integration test**

```ts
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

test("the exact npm tarball contains types and runs when installed", () => {
  const temp = mkdtempSync(join(tmpdir(), "ghostinit-pack-"));
  try {
    execFileSync("bun", ["run", "build"], { cwd: root, stdio: "pipe", shell: false });
    const npmArgs = ["pack", "--json", "--pack-destination", temp];
    const packJson =
      process.platform === "win32"
        ? execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `npm pack --json --pack-destination "${temp}"`],
            { cwd: root, encoding: "utf8", shell: false },
          )
        : execFileSync("npm", npmArgs, { cwd: root, encoding: "utf8", shell: false });
    const [{ filename, files }] = JSON.parse(packJson) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    expect(files.map(({ path }) => path)).toContain("dist/cli.d.ts");
    expect(files.map(({ path }) => path)).toContain("dist/cli.js");

    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );
    execFileSync(
      "bun",
      ["add", "--exact", join(temp, filename), "typescript@7.0.2", "@types/bun@1.4.0"],
      { cwd: temp, stdio: "pipe", shell: false },
    );

    const installedPackage = JSON.parse(
      readFileSync(join(temp, "node_modules", "ghostinit", "package.json"), "utf8"),
    ) as { types: string; exports: { ".": { types: string; default: string } } };
    expect(installedPackage.types).toBe("dist/cli.d.ts");
    expect(installedPackage.exports["."].types).toBe("./dist/cli.d.ts");
    expect(installedPackage.exports["."].default).toBe("./dist/cli.js");
    expect(
      readFileSync(join(temp, "node_modules", "ghostinit", "src", "cli.ts"), "utf8").split(
        /\r?\n/,
        1,
      )[0],
    ).toBe("#!/usr/bin/env bun");

    writeFileSync(join(temp, "index.ts"), 'import { main } from "ghostinit";\nvoid main;\n');
    writeFileSync(
      join(temp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["bun"],
        },
        include: ["index.ts"],
      }),
    );
    expect(
      execFileSync("bunx", ["--no-install", "tsc", "--version"], {
        cwd: temp,
        encoding: "utf8",
        shell: false,
      }).trim(),
    ).toBe("Version 7.0.2");
    execFileSync("bunx", ["--no-install", "tsc", "--noEmit"], {
      cwd: temp,
      stdio: "pipe",
      shell: false,
    });

    const bin = [
      join(temp, "node_modules", ".bin", "ghostinit.exe"),
      join(temp, "node_modules", ".bin", "ghostinit"),
    ].find(existsSync);
    expect(bin).toBeDefined();
    const version = execFileSync(bin!, ["--version"], {
      cwd: temp,
      encoding: "utf8",
      shell: false,
    }).trim();
    expect(version).toMatch(/^ghostinit \d+\.\d+\.\d+$/);
    expect(readdirSync(temp)).toContain(filename);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 100_000);
```

- [ ] **Step 3: Run and verify failures**

```bash
bun test tests/unit/ci-v2.test.ts tests/integration/packed-cli.test.ts --timeout 100000
```

Expected: CI test fails on `main`/Bun 1.3.14/missing steps; packed test fails because declarations are not fully included/declared by package metadata.

- [ ] **Step 4: Correct package declaration metadata**

Set:

```json
{
  "types": "dist/cli.d.ts",
  "files": ["dist/**/*", "src/**/*", "schemas/**/*", "README.md", "CHANGELOG.md", "LICENSE"],
  "exports": {
    ".": {
      "types": "./dist/cli.d.ts",
      "default": "./dist/cli.js"
    }
  }
}
```

Also set the fixture installer script exactly to:

```json
"pretest:fixtures": "cd tests/fixtures/compatibility/drizzle-betterauth-orpc && bun install --frozen-lockfile && cd ../next-tailwind-biome && bun install --frozen-lockfile && cd ../expo-uniwind-rnr && bun install --frozen-lockfile"
```

Change the first line of `src/cli.ts` to `#!/usr/bin/env bun`. Do not add a publish script in this phase.

- [ ] **Step 5: Correct required CI while retaining existing gates**

Replace `.github/workflows/ci.yml` with this complete required workflow:

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master, develop]

permissions:
  contents: read

jobs:
  check-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - name: Install frozen dependencies
        run: bun install --frozen-lockfile
      - name: Check lint, format, and source types
        run: bun run check
      - name: Typecheck automation scripts
        run: bun run typecheck:scripts
      - name: Typecheck project references
        run: bun run typecheck
      - name: Check turbo environment manifest
        run: bun run scripts/sync-turbo-env.ts --check
      - name: Check dependency versions
        run: bun run check:versions
      - name: Run host tests
        run: bun run test
      - name: Install compatibility fixtures
        run: bun run pretest:fixtures
      - name: Run compatibility fixtures
        run: bun run test:fixtures
      - name: Build CLI
        run: bun run build
      - name: Test V2 compatibility and toolchain baseline
        run: >-
          bun test --timeout 100000
          tests/unit/compatibility-ledger.test.ts
          tests/unit/toolchain-v2.test.ts
          tests/unit/scripts-typecheck.test.ts
          tests/unit/typescript7-inventory.test.ts
          tests/unit/ci-v2.test.ts
      - name: Test packed CLI artifact
        run: bun test --timeout 100000 tests/integration/packed-cli.test.ts

  generated-project-smoke:
    runs-on: ubuntu-latest
    needs: check-and-test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - name: Install frozen dependencies
        run: bun install --frozen-lockfile
      - name: Build CLI
        run: bun run build
      - name: Run required generated-project gate
        run: bun run test:generated
```

In `scripts/e2e-smoke.sh`, immediately after the direct source-analyzer check, add the packaged check:

```bash
echo "[e2e-smoke] Checking packaged CLI architecture command..."
"$CLI" check --cwd "$PROJECT_ROOT" --json
```

Replace `.github/workflows/e2e.yml` with this complete workflow:

```yaml
name: E2E

on:
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:
    inputs:
      billing:
        description: "Billing providers"
        default: "all"
        required: false
      framework:
        description: "nextjs or tanstack-start"
        default: "tanstack-start"
        required: false
      features:
        description: "Feature list"
        default: "eve"
        required: false

permissions:
  contents: read

concurrency:
  group: e2e-${{ github.ref }}-${{ github.event_name }}
  cancel-in-progress: true

jobs:
  e2e-fast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Run fast generated/source checks
        env:
          E2E_TMP: ${{ runner.temp }}
        run: ./scripts/e2e-smoke.sh e2e-fast none nextjs none postgres
      - name: Run packaged architecture check
        run: ./dist/cli.js check --cwd "$RUNNER_TEMP/gi-test/e2e-fast" --json

  e2e-scheduled:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - id: tanstack-all
            framework: tanstack-start
            billing: all
            features: eve
          - id: next-all
            framework: nextjs
            billing: all
            features: eve,i18n
          - id: next-dual
            framework: nextjs
            billing: stripe,chargily
            features: eve
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Run scheduled full generated project
        env:
          E2E_TMP: ${{ runner.temp }}
          E2E_INSTALL: "1"
          E2E_HEALTH: "1"
        run: >-
          ./scripts/e2e-smoke.sh
          "${{ matrix.id }}"
          "${{ matrix.billing }}"
          "${{ matrix.framework }}"
          "${{ matrix.features }}"
          postgres

  e2e-manual:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Run requested full generated project
        env:
          E2E_TMP: ${{ runner.temp }}
          E2E_INSTALL: "1"
          E2E_HEALTH: "1"
        run: >-
          ./scripts/e2e-smoke.sh
          manual-demo
          "${{ inputs.billing }}"
          "${{ inputs.framework }}"
          "${{ inputs.features }}"
          postgres

  e2e-build-gated:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Run opt-in generated build tests
        run: E2E_BUILD=1 bun test --timeout 300000 tests/integration/e2e-build.test.ts
```

- [ ] **Step 6: Run semantic CI, packed artifact, and host gates**

```bash
bun test tests/unit/ci-v2.test.ts tests/integration/packed-cli.test.ts --timeout 100000
bun run check
bun run build
bun run test
```

Expected: all commands exit zero; packed output contains `dist/cli.js` and `dist/cli.d.ts`. V2 schemas become mandatory in Phase 1B when they exist.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/e2e.yml package.json src/cli.ts scripts/e2e-smoke.sh tests/unit/ci-v2.test.ts tests/integration/packed-cli.test.ts
git diff --cached --name-only
git commit -m "ci: gate the exact toolchain and packed CLI"
```

Expected cached paths are exactly the seven Task 5 files.

---

### Task 6: Migrate committed compatibility fixtures to the exact toolchain

**Files:**

- Modify: `tests/fixtures/compatibility/drizzle-betterauth-orpc/package.json`
- Modify: `tests/fixtures/compatibility/drizzle-betterauth-orpc/bun.lock`
- Modify: `tests/fixtures/compatibility/next-tailwind-biome/package.json`
- Modify: `tests/fixtures/compatibility/next-tailwind-biome/bun.lock`
- Modify: `tests/fixtures/compatibility/expo-uniwind-rnr/package.json`
- Modify: `tests/fixtures/compatibility/expo-uniwind-rnr/bun.lock`
- Create: `tests/unit/fixture-toolchain.test.ts`

**Interfaces:**

- Produces three committed fixtures whose direct manifests exactly match their Bun 1.4.0 frozen locks and whose compiler is TypeScript 7.0.2.
- Consumes the exact host toolchain from Tasks 2–3.

- [ ] **Step 1: Write the failing fixture/lock consistency test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixtures = ["drizzle-betterauth-orpc", "next-tailwind-biome", "expo-uniwind-rnr"] as const;

describe("committed compatibility fixture toolchains", () => {
  for (const fixture of fixtures) {
    test(`${fixture} uses Bun 1.4.0, TypeScript 7.0.2, and a matching lock root`, () => {
      const directory = resolve(root, "tests/fixtures/compatibility", fixture);
      const pkg = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")) as {
        name: string;
        packageManager?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const lock = Bun.JSONC.parse(readFileSync(resolve(directory, "bun.lock"), "utf8")) as {
        workspaces: {
          "": {
            name: string;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
        };
      };
      expect(pkg.packageManager).toBe("bun@1.4.0");
      expect(pkg.devDependencies?.typescript).toBe("7.0.2");
      expect(pkg.devDependencies?.["@typescript/native-preview"]).toBeUndefined();
      if (pkg.dependencies?.["bun-types"] !== undefined) {
        expect(pkg.dependencies["bun-types"]).toBe("1.4.0");
      }
      expect(lock.workspaces[""].name).toBe(pkg.name);
      expect(lock.workspaces[""].dependencies ?? {}).toEqual(pkg.dependencies ?? {});
      expect(lock.workspaces[""].devDependencies ?? {}).toEqual(pkg.devDependencies ?? {});
    });
  }
});
```

- [ ] **Step 2: Run RED and verify all legacy drifts are observed**

```bash
bun test tests/unit/fixture-toolchain.test.ts --timeout 100000
```

Expected: FAIL for missing/old `packageManager`, Expo TypeScript `6.0.3`, Drizzle `bun-types@1.3.14`, Next native-preview, and Next lock name/type specs that differ from its manifest.

- [ ] **Step 3: Update fixture manifests only**

For all three fixture manifests, add or set:

```json
"packageManager": "bun@1.4.0"
```

Set every `devDependencies.typescript` to `7.0.2`. In the Drizzle fixture set `dependencies["bun-types"]` to `1.4.0`. Remove `@typescript/native-preview` from the Next fixture. Do not upgrade framework/runtime libraries in this task; target adapter compatibility is proven in later phases.

- [ ] **Step 4: Re-run RED against stale locks**

```bash
bun test tests/unit/fixture-toolchain.test.ts --timeout 100000
```

Expected: FAIL only because committed lock workspace names/specs still differ from the updated manifests.

- [ ] **Step 5: Regenerate each lock with Bun 1.4.0 and freeze it**

Run in each fixture directory:

```powershell
foreach ($fixture in @('drizzle-betterauth-orpc','next-tailwind-biome','expo-uniwind-rnr')) {
  Push-Location "tests/fixtures/compatibility/$fixture"
  bun install
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  $before = (Get-FileHash -Algorithm SHA256 -LiteralPath 'bun.lock').Hash
  bun install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  $after = (Get-FileHash -Algorithm SHA256 -LiteralPath 'bun.lock').Hash
  if ($before -ne $after) { Pop-Location; throw "Frozen lock changed for $fixture" }
  Pop-Location
}
```

- [ ] **Step 6: Run GREEN and fixture gates**

```bash
bun test tests/unit/fixture-toolchain.test.ts --timeout 100000
bun run pretest:fixtures
bun run test:fixtures
bun run check
```

Expected: focused 3/3 pass; every frozen fixture install, fixture test, and host check exits zero.

- [ ] **Step 7: Commit only fixture migration files**

```bash
git add tests/fixtures/compatibility/drizzle-betterauth-orpc/package.json tests/fixtures/compatibility/drizzle-betterauth-orpc/bun.lock tests/fixtures/compatibility/next-tailwind-biome/package.json tests/fixtures/compatibility/next-tailwind-biome/bun.lock tests/fixtures/compatibility/expo-uniwind-rnr/package.json tests/fixtures/compatibility/expo-uniwind-rnr/bun.lock tests/unit/fixture-toolchain.test.ts
git diff --cached --name-only
git commit -m "test: migrate compatibility fixtures to Bun 1.4 and TypeScript 7"
```

Expected cached paths are exactly the seven Task 6 files.

---

## Phase 1A final verification

- [ ] **Step 1: Verify exact executables and frozen installation**

```bash
bun --version
bunx --no-install tsc --version
bun install --frozen-lockfile
git diff --exit-code -- bun.lock
```

Expected: `1.4.0`, `Version 7.0.2`, then zero exits.

- [ ] **Step 2: Run the complete Phase 1A gate freshly**

```bash
bun run check
bun run build
bun run typecheck
bun run check:versions
bun test --timeout 100000 tests/unit/compatibility-ledger.test.ts tests/unit/toolchain-v2.test.ts tests/unit/scripts-typecheck.test.ts tests/unit/typescript7-inventory.test.ts tests/unit/ci-v2.test.ts tests/unit/fixture-toolchain.test.ts tests/integration/packed-cli.test.ts
bun run test
bun run pretest:fixtures
bun run test:fixtures
bun run test:generated
```

Expected: all commands exit zero and the full suite reports zero failures.

- [ ] **Step 3: Verify V2 production code has not started or reached the public CLI**

```powershell
foreach ($path in @('src/domain','src/application','src/adapters','src/generation','src/composition')) {
  if (Test-Path -LiteralPath $path) { throw "Phase 1A must not create V2 source root: $path" }
}
$matches = rg -n 'v2|src/domain|src/application|src/adapters|src/composition' src/cli.ts
if ($LASTEXITCODE -eq 0) { $matches; throw 'Public CLI reaches V2 before cutover' }
if ($LASTEXITCODE -ne 1) { throw 'rg failed unexpectedly' }
```

Expected: no V2 source root and no match in `src/cli.ts`.

- [ ] **Step 4: Require a clean implementation worktree**

```powershell
$status = git status --porcelain
if ($status) { $status; throw 'Phase 1A left uncommitted changes' }
```

Expected: no output.

- [ ] **Step 5: Review and continue autonomously**

Generate the phase diff/review package and record separate spec-compliance and code-quality reviewer task IDs/verdicts in the subagent-driven-development progress ledger. Both must say `APPROVED`, with no open Critical/Important finding. Verify the worktree is clean, then write `docs/superpowers/plans/2026-08-23-ghostinit-v2-domain.md` from the frozen ledger/toolchain interfaces and begin Phase 1B without requesting routine user approval.
