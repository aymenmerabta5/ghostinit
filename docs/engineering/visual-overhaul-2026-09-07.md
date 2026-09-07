# Visual overhaul, 2026-09-07

The implementation uses the user's final text-only `GhostInit` wordmark: adjacent
`Ghost` in primary text and `Init` in readable secondary text. There is no symbol,
tile, image, or generated-art favicon. This report records the implemented design
and its verification limits; final browser acceptance remains outstanding.

The user requested the overhaul with `design-taste-frontend`. The direction and
rules are recorded in [DESIGN.md](../../DESIGN.md). Tailwind v4, the owned Base UI
and native components, TanStack forms, and existing icon family remain in place.
Geist and Noto Sans Arabic provide self-hosted web typography; native retains its
platform typography. The light/cobalt and charcoal themes share semantic tokens,
readable states, consistent control sizing, and a named overlay layer scale.

## Final composition

One `BrandWordmark` renderer per app supplies the header, rail, mobile Sheet and
appropriate Expo/Electron branding. Web preserves the Latin reading order in RTL.
The Electron renderer owns its wordmark under `src/renderer/components`; it does
not rely on an alias resolving into the Node-side source tree. The rejected image
data module, image imports, favicon wiring and special image seed policy are
absent from generation. Other icons retain their existing functional meanings.

Desktop workspace content uses a 232px rail, a 64px utility header and consistent
72rem alignment. Mobile retains the navigation control without a clipped duplicate
breadcrumb title. Dashboard content uses actual account data and useful actions;
the repeated account paragraph is removed, surfaces use the shared 12px radius,
and monorepo technical guidance remains a secondary disclosure. Landing visuals
describe real selected project directories and semantic colors, not fabricated
metrics, execution results or testimonials.

Settings groups profile, security, passkeys and sessions around a clear hierarchy.
Auth and recovery keep focused forms and inline errors. Session display labels
describe recognizable browsers/platforms without becoming authentication inputs.
Maintenance presents its public unavailable state before the administrator form.
PDF, jobs, messaging and workspace copy describe user tasks rather than internal
transport or implementation details.

Routes continue to own authorization and initial reads. Shell identity explicitly
distinguishes pending, authenticated, anonymous and error states. Only pending
renders skeletons; only authenticated identity exposes private navigation. Error
retry uses the existing identity owner. The outer query boundary and logout/cache
reset behavior remain intact. Billing matches the workspace root exactly, leaving
its public return pages outside the private shell. Workspace controls use existing
permission and membership boundaries; incomplete authorization keeps mutations
unavailable. The notification composer remains a controlled presenter while its
page owns mutations and effects. Size and permission assertions are unchanged.

The shared class merger understands the named shadow sizes, so caller overrides
such as `shadow-none` work without per-screen importance flags. Generated navigation
checks inspect actual shell mounts, canonical identity, role admission, selected
translation keys and mobile locale controls, with negative controls for missing
mounts and incorrect identity handoff.

## Verification status

The following runs are separate evidence. A later subset does not turn a failed
full run into a new full-suite pass.

| Run                       | Scope             | Passed tests | Failed tests | Assertions | Result                                   |
| ------------------------- | ----------------- | -----------: | -----------: | ---------: | ---------------------------------------- |
| Overhaul round 1          | 47 isolated files |          700 |           43 |     43,130 | Failed                                   |
| Overhaul round 2          | 50 isolated files |          767 |            0 |     43,834 | Passed on the earlier overhaul candidate |
| Overhaul round 3          | 70 isolated files |          955 |            5 |     48,042 | Failed in three files                    |
| Round 3 corrective replay | Four files        |          137 |            0 |        782 | Passed after the scoped corrections      |

Round 3 completed on 2026-09-07 at 19:15 UTC. Its failing files were
`design-system-contract.test.ts`, `generation-matrix.test.ts` and
`desktop-foundation.test.ts`. The corrective replay covered those three plus
`brand-wordmark.test.ts`, fixing the actual Electron renderer ownership/import
path and a stale font assertion without weakening alias or generation checks.
The complete 70-file suite was not rerun after those corrections.

Each file ran in a fresh guarded `bun --smol test` process. Round 2 sampled at most
457.1MB per process; round 3 sampled 440.0MB; the corrective replay sampled
444.3MB. Those runs had no memory guard stops or leftover processes. Local receipts
are retained under `.ghostinit-release/architecture-review/overhaul-focused-*.json`
and the corresponding `bounded-runs` logs.

The latest completed source-gate run passed project-reference typechecking,
dependency-version validation, capability evidence, lock-age policy, the
high-severity dependency audit and CLI build. Version validation covered 168
scopes (143 latest and 25 held pins) and 1,070 locked versions; source gates sampled
at most 485.8MB. A subsequent review identified and fixed a team-creation
completion race across an organization switch. The full source check, four
affected test files (32 tests and 674 assertions), and CLI build passed after
that correction. Late completion retains the currently selected organization's
team and draft in both Next and TanStack.

The product and brand frontend records retain the committed overhaul inventory
and add the final polish paths. Their schema, current design-context hashes,
referenced files and component IDs passed the record validator. This validates
the evidence records, not final visual or release readiness.

## Browser evidence and remaining work

Candidate v11 was generated from `cca8ad6d990544d8f1309f191ffcf7fb044ba5d4`
with CLI SHA-256
`afe254c4d52d6878299230c2cc0a37879bdbee7831919f273383f0a1cdda945d`.
Its 657-file output completed dependency bootstrap/audit, formatting, architecture,
typecheck, lint and root tests before browser work. That installed proof predates
the final wordmark and subsequent polish.

The v11 browser runs were partial. Actual light/dark and mobile/desktop captures,
including Arabic, informed the later shell, typography, spacing, shadow and state
corrections. They also exposed the public billing return-page skeleton defect.
The host was stopped by its process memory guard at a sampled 3,074.3MB per
process and 3,968.2MB for the owned tree; cleanup left no owned processes. These
runs do not establish complete route/feature coverage or a successful full local
memory workload. The final wordmark and later source fixes have not received a
complete final browser replay.

Candidate v12 was generated from `8c6aa904ec7ab0959d38bc5f266f9471f7f6f94b`
with CLI SHA-256
`27f9a7495e45ce3ec65be39bbd8a8e8e5a6c896adf025f81684e998e3a20943c`.
Its 665-file output passed dependency bootstrap/audit, formatting and format-check,
then failed architecture validation with exit code 1 and two HIGH findings.
`src/features/identity-workspace/permissions.ts` imported `@tanstack/react-query`
and `@/lib/orpc` outside the feature's root query/mutation adapters. Hosted
E2E-fast and packed-CLI gates also reported this boundary defect. The remaining
installed and browser acceptance sequence was blocked; v12 is retained as failed
candidate evidence. The repair must cover both Next and TanStack output while
preserving the isolation rule. The corrective source keeps permissions as pure
projection/types, puts remote execution in root `queries.ts`, and uses TanStack's
existing server function instead of the extra feature loader. Fresh generated
validation and the final browser replay remain outstanding.

Remaining evidence includes a fresh final generated candidate and its installed
gates, all selected page/feature/security lifecycles, keyboard and responsive
review in light/dark and EN/FR/AR, production build/runtime checks, a complete
memory-bounded local workload, current-commit hosted CI and the exact tested
release artifact. The earlier fully green CI for commit
`2f2a734353af086c6b37347aca491fe564dab00f` belongs to the pre-overhaul functional
baseline and does not certify this design. User authorization to commit, push and
merge after green checks does not replace those outstanding results.
