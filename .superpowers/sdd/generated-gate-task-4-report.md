# Generated Gate Task 4 Report

## Status

Implemented Task 4 from base `8e869449dd7ad78f1325909c44c7a6b8bb5679f0`.

## RED evidence

Command:

```text
bun test tests/unit/generated-import-closure.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts --timeout 100000
```

Observed `5 pass, 13 fail`. Diagnostics matched the intended gaps:

- the root-aware scanner reported 133 undeclared generated imports, including Motion, single-mode `@repo/config`, TanStack `@t3-oss/env-core`, React Email packages, and root Convex imports;
- all eight email corners exposed disabled-capability route/hook/dependency/env leakage or non-throwing delivery;
- single flags used `@repo/config` and casts instead of typed local env;
- the single auth callback used the legacy HTML/object API;
- `src/lib/animations.ts` was emitted without a Motion dependency.

The focused Convex billing test was then added and observed failing against the Drizzle `db.select()` subscription route before the database-aware adapter implementation.

## GREEN evidence

```text
bun test tests/unit/generated-import-closure.test.ts tests/unit/single-next-contract.test.ts tests/unit/email-capability.test.ts tests/unit/generated-unsafe-syntax-baseline.test.ts tests/unit/generation-matrix.test.ts --timeout 100000
127 pass, 0 fail, 8917 assertions

bun run build
PASS: JS bundle and declarations

bun run check
PASS: oxlint, oxfmt --check, tsc --noEmit

generated next-monorepo/packages/email: bun run typecheck
PASS
```

The full generated gate was also run with `--only next-monorepo --keep`. Generation and installation passed. Task 4's generated email package typechecked independently. The overall corner remains red only in later-task/pre-existing areas: missing `@repo/services/billing` subpath exports in modules and analytics server-utils typing/lint. Per controller instruction, those Task 5–7 failures were not changed.

## Impeccable and frontend evidence

The Impeccable loader was run from the worktree and its full JSON was consumed. It resolved `PRODUCT.md` and `DESIGN.md` from the project root. The selected register is **Product** because feature flags and recovery/auth are application surfaces where design serves the task.

- `PRODUCT.md`: `6A7CAA75BC8A4E130B1AAFF89E67EE30F117F921ACDD5A2517243C7B84AECD4B`
- `DESIGN.md`: `C7E34B05B89FE253770764A01ADA96FFBFFC65600A370B17E6690CFA622A9F4D`
- Impeccable Product register: `55A701943BAAC17B552DDB8B35083D1CC77A27B986ED84EC9F7E92732CB5368F`

Applied evidence:

- Product register: familiar auth navigation, no decorative motion, no new styling vocabulary.
- Next RSC/directive guidance: distinct server and client feature-flag modules, with the client boundary reading exactly one public prefix.
- React performance guidance: unused Motion output was removed instead of adding a dependency; capability-specific modules/routes are not emitted when disabled.
- Component-size review: the largest affected generated sign-in/recovery component is 94 nonblank, non-comment lines (`apps/web/src/routes/reset-password.tsx`), below the 300-line guideline.

Relevant guidance hashes:

- Next RSC boundaries: `A0CF4E2E21EAC77A20CD2ED9D64D4CEB2E6A17B6A6E65F21838B1B4BA4A44DDE`
- Next directives: `7060405D45DB3F9E372428DF64B85CBF330F691490B45936A15D2314C45FB48D`
- Next bundling: `9DCE3EFCF3886841634D9898428C6691F3FF5EBC2219E76FB161F2BD6F8974EF`
- React conditional loading: `16992BEEAF9BDD1E7FF20989B8672CFFFC8B918DEB0783C058560C7A233DD37C`
- React barrel imports: `F3A0D74C71AAA98547D970901D73D1BC4C082762E891244E9103DEF40846EECB`

The nested frontend reviewer stalled and was interrupted by the controller. The controller explicitly directed commit and will perform the independent Impeccable-aware review.

## Better Auth and email evidence

Read and applied:

- Better Auth core: `E1FA8A7D1A12EDFA162444712E1A4F26C85BF3ECCAAC3DFEC88A0833D81FF8EE`
- Better Auth security: `C9D0BC218CF000ABC05EDF906786924D5545073DA3E7152E7C6D07BE2788FE71`
- Email/password: `EAF6ABEC84C6E5ECA8523C88ACF5BB5F0CC2BB076C0D9BCC8239FD2118FAA9D8`

Results:

- enabled Postgres auth variants await typed ResetPassword/VerifyEmail component delivery;
- every placeholder, render, Resend, and missing-ID failure propagates by throwing;
- disabled email removes callbacks, magic-link registration, packages/files, recovery routes, navigation, dependencies, and Resend env lines;
- vendor credentials remain placeholders.

## Changed files

Primary Task 4 files:

- `tests/unit/generated-import-closure.test.ts`
- `tests/unit/single-next-contract.test.ts`
- `tests/unit/email-capability.test.ts`
- `tests/unit/generated-unsafe-syntax-baseline.test.ts`
- `src/templates/email.ts`, `src/templates/auth.ts`
- `src/templates/apps/core.ts`, `src/templates/apps/tanstack-core.ts`
- `src/templates/apps/fragments/web-lib.ts`, `src/templates/apps/fragments/lib/feature-flags.ts`
- `src/templates/apps/fragments/recovery/index.ts`, `src/templates/apps/fragments/auth/sign-in.ts`
- `src/templates/modes/single/package.ts`, both single web composers, single index, auth/password/TanStack auth pages, auth server, env and agent content
- `src/templates/modes/monorepo/index.ts`, auth/services/apps composers
- `src/templates/packages/config.ts`, `src/templates/shared/analytics-env.ts`, `src/templates/shared/env/builders.ts`

Controller-approved adjacent generation-time ownership:

- `src/templates/apps/index.ts`, `src/templates/apps/pages.ts`, `src/templates/apps/tanstack-pages.ts`
- `src/templates/apps/components.ts`, `src/templates/apps/tanstack-components.ts`, `src/templates/apps/fragments/theme.ts`
- `src/templates/modes/monorepo/root-composer.ts`, `utils.ts`, `agents-composer.ts`
- `src/templates/modes/single/config.ts`, `fragments/docs.ts`
- `src/templates/root/package.ts`
- `src/templates/services/index.ts`, `src/templates/services/billing.ts`
- `src/templates/billing/api/routes.ts`, `src/templates/billing-generator.ts`

These adjacent edits are limited to exact capability propagation, nearest-owner dependency closure, or the required database-aware Convex subscription path. No post-generation substring filtering was introduced.

## Self-review

- All maintained generated imports resolve to the nearest declared root/workspace owner across mode, framework, Postgres/Convex, and capability on/off variants.
- Single TanStack declares `@t3-oss/env-core`, never `env-nextjs`; single output contains no workspace dependency alias.
- Server/Next/Vite analytics-disabled keys are distinct and typed; no feature-flag casts remain.
- No unused Motion file/dependency is emitted.
- Email-off artifacts are absent at composition time in all eight corners, not generated and filtered later.
- Convex subscription routes use `billingConvex.listSubscriptions(user.id)` in both modes/frameworks and contain no Drizzle imports, schema imports, or `db.select()`.
- Task 4 removed unsafe-baseline IDs without adding explicit `any`, assertion chains, or suppressions in the changed auth/flag/recovery output.
- `git diff --check` passes.

## Concerns

- Full generated-project typecheck/lint remains red in explicitly out-of-scope later-task areas documented above. Task 4's generated email package typecheck is green.
- Independent controller review is pending because the nested reviewer was interrupted by the controller.
