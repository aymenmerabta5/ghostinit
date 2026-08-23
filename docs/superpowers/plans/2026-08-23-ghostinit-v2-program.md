# GhostInit V2 Rewrite Program Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GhostInit with a secure, layered, deterministic CLI whose supported generated projects work end to end.

**Architecture:** The program follows the approved ports-and-adapters design in `docs/superpowers/specs/2026-08-23-ghostinit-v2-full-rewrite-design.md`. Work is split into independently reviewable phase plans because toolchain, safety, generation, architecture enforcement, platform UIs, backend capabilities, and release engineering have different interfaces and verification environments.

**Tech Stack:** Bun 1.4.0, TypeScript 7.0.2, OXC parser/lint/format, React 19, current compatible Next.js/TanStack Start/Expo/Electron, oRPC, Better Auth, PostgreSQL/Drizzle, Convex, Playwright.

## Global Constraints

- Bun is pinned exactly to `1.4.0`; TypeScript is pinned exactly to `7.0.2`.
- Any advertised target that cannot pass the exact toolchain blocks V2 release; no peer override or compiler downgrade is allowed.
- Direct external dependencies use exact pins, internal dependencies use `workspace:*`, peers use verified ranges, and lockfiles freeze transitives.
- Preserve all pre-existing working-tree changes; never reset or overwrite them. One explicitly labelled preservation commit on the isolated implementation branch is authorized before rewrite commits so the user-authored baseline is immutable and attributable.
- Production V2 code follows `CLI -> Application -> Domain`, with adapters implementing application-owned ports and composition roots selecting implementations.
- Generated code follows UI/transport/application/domain/infrastructure/bootstrap dependency rules from the approved spec.
- Every behavior change follows red-green-refactor TDD and receives spec-compliance plus code-quality review.
- Every phase leaves required branch suites green; critical security/data-loss fixes to still-published legacy paths are not deferred.
- No supported feature may use fake success, silent fallback, swallowed architecture errors, unbounded secret output, or unverified third-party credentials.
- Each detailed phase plan reads the relevant skills and version-matched official documentation before implementation.

---

## Program file map

### New V2 host boundaries

- `src/domain/**` — pure project, capability, generation, architecture, and error models.
- `src/application/**` — command use cases, ports, and orchestration.
- `src/adapters/**` — CLI, filesystem, process, registry, prompt, Git, config, and architecture implementations.
- `src/generation/**` — target-neutral renderer adapter, target adapters, capability adapters, and packaging adapters.
- `src/composition/**` — private V2 harness and final production composition root.

### V2 tests and evidence

- `tests/unit/domain/**` — pure model and policy tests.
- `tests/unit/application/**` — use-case tests with in-memory ports.
- `tests/unit/adapters/**` — adversarial filesystem/process/config/architecture tests.
- `tests/integration/v2/**` — private packed/composed CLI and generation integration.
- `tests/generated/**` — structural catalog, build, runtime, platform, and acceptance-manifest runners.
- `tests/security/audit-reproductions.json` — versioned audit finding corpus.
- `evidence/dependencies/**` — timestamped selected/rejected dependency compatibility evidence.

### Packaged schemas and catalogs

- `schemas/project-config.schema.json` — final V2 desired-state schema.
- `schemas/cli-envelope.schema.json` — JSON protocol schema.
- `schemas/support-catalog.schema.json` — capabilities response schema.
- `src/domain/project/support-catalog.ts` — finite supported axes and bindings.

---

## Phase plan sequence

### Phase 1A: Exact toolchain and compatibility baseline

**Detailed plan:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-toolchain.md`

**Deliverable:** Clean implementation worktree containing the preserved pre-rewrite state, a versioned V1-to-V2 compatibility ledger, Bun 1.4.0/TypeScript 7.0.2 host baseline, TypeScript 7.0.2 compatibility inventory, script typecheck, CI branch/runtime correction, and packed V1 CLI smoke.

**Exit gate:**

```bash
bun install --frozen-lockfile
bun --version
bunx --no-install tsc --version
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

Then run:

```powershell
git diff --exit-code -- bun.lock
foreach ($path in @('src/domain','src/application','src/adapters','src/generation','src/composition')) {
  if (Test-Path -LiteralPath $path) { throw "Phase 1A created V2 source early: $path" }
}
$status = git status --porcelain
if ($status) { $status; throw 'Phase 1A worktree is not clean' }
```

Expected versions are exactly `1.4.0` and `7.0.2`; all commands exit zero. Two fresh independent reviews—spec compliance and code quality—must both report approved before Phase 1B.

### Phase 1B: V2 domain and application foundation

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-domain.md`

**Deliverable:** Pure V2 desired-state types/schema, proof-gated support bindings, resolver, acceptance manifests, project plan model, stable JSON protocol, typed command registry, application ports/use cases, and a nonempty private harness.

**Exit gate:** all domain/application/adapter tests pass, the OXC boundary test proves dependency direction, and the public V1 entry cannot reach V2 transitively.

### Phase 2: Filesystem, locking, subprocess, Git, and redaction safety

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-safety.md`

**Deliverable:** Application ports implemented by crash-recoverable, symlink-safe transactions; nonce/heartbeat locks; bounded subprocesses; fail-closed Git; uniform human/JSON/generated log redaction.

**Mandatory regression IDs:** arbitrary attachment path read, staging symlink overwrite, junction escape, stale cleanup deletion, partial transaction, stolen lock, Git fail-open, error-message secret leak, URL credential leak, install-hook secret exposure.

**Exit gate:**

```bash
bun test --timeout 100000 tests/unit/adapters/fs tests/unit/adapters/lock tests/unit/adapters/process tests/unit/adapters/git tests/unit/adapters/redaction tests/security
```

### Phase 3: Deterministic generation engine and canonical layouts

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-generation.md`

**Deliverable:** Conditional plan renderers with no post-hoc filtering/remapping, canonical monorepo/single logical layout, manifest/dependency/export/env validation, and baseline frontend-only Next/TanStack projects.

**Exit gate:** every support-catalog tuple can produce a deterministic plan; baseline Next/TanStack × monorepo/single outputs clean-install, typecheck, lint, and build with the exact toolchain.

### Phase 4: Architecture checker V2

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-architecture-checker.md`

**Deliverable:** Fixed-point OXC import graph and fail-closed rules across host, single, monorepo, web, mobile, desktop, Convex, Eve, tests, and modern module extensions.

**Exit gate:** every audit bypass fixture is blocking, every valid V2 baseline project is clean, and an injected generated-project violation makes both local and generated CI fail.

### Phase 5: Database, authentication, contracts, and transport

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-backend-core.md`

**Deliverable:** PostgreSQL/Convex/no-persistence adapters, version-correct Better Auth schemas/plugins/session facade, application use cases, oRPC/public transport, and real client round trips.

**Exit gate:** sign-up/sign-in/reset/2FA/admin/organization/passkey flows selected by config, PostgreSQL migrations, Convex identity mapping/codegen, public/protected API policies, and Next/TanStack round trips pass in single and monorepo where supported.

### Phase 6: React component system and platform pages

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-frontends.md`

**Deliverable:** Shared tokens/primitives/patterns, thin route orchestration, Next RSC/Actions, native TanStack routes/server functions, Expo screens, Electron bridge/renderer, and acceptance manifests for every page/screen.

**Exit gate:** production builds launch and Playwright/platform runners traverse every manifest entry with applicable state, access, responsive, accessibility, console/network, and performance checks.

### Phase 7: Production capabilities and providers

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-capabilities.md`

**Deliverable:** Billing, messaging/realtime, storage, email, cache, analytics, i18n, PDF, and Eve implemented through application ports and target adapters.

**Exit gate:** every declared operation passes contract, security, failure/retry/idempotency, ownership, observable-side-effect, generated build, and applicable sandbox tests. Disabled capabilities emit nothing.

### Phase 8: CI, documentation, migration, release, and cutover

**Detailed plan path:** `docs/superpowers/plans/2026-08-23-ghostinit-v2-cutover.md`

**Deliverable:** finite support catalog/coverage maps, cross-platform CI, executable docs, V1 compatibility ledger/migration, packed artifact release, V2 public entry, and deletion of production legacy code.

**Exit gate:** every acceptance criterion in section 23 of the approved spec passes against the SHA-256-identical tarball selected for publication.

---

## Autonomous execution protocol

- [ ] **Step 1: Create and self-review the current detailed phase plan**

The root agent writes the named plan with exact interfaces, test code, commands, expected failures, implementations, and commits. Later plans are written only after consumed interfaces from earlier phases are stable, preventing speculative signatures from becoming stale.

- [ ] **Step 2: Execute each phase task with TDD**

Use a fresh implementer context per task. The task brief includes only the exact files/interfaces and reminds the worker that other user changes exist and must not be reverted.

- [ ] **Step 3: Review each task twice**

First review spec compliance; then review architecture, security, types, tests, maintainability, and user-change preservation. Important findings return to the same implementer and are re-reviewed.

- [ ] **Step 4: Run the phase exit gate freshly**

No phase completion claim is made from subagent reports, partial commands, or previous runs.

- [ ] **Step 5: Commit only phase-owned files**

Use path-specific staging/commits so pre-existing staged or unstaged user changes are not absorbed.

- [ ] **Step 6: Write the next detailed phase plan and continue automatically**

The user has authorized the recommended autonomous path; no execution-choice prompt or routine checkpoint approval is required. Ask only if an external credential, destructive migration, or irreconcilable product decision cannot be inferred from the approved spec/catalog.
