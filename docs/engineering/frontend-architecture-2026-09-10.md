# Frontend responsibility boundaries and recovery

GhostInit emits the same frontend responsibilities for Next.js, TanStack Start,
Expo, and Electron, in single and monorepo layouts. The existing semantic theme,
owned controls, translations, and server authorization remain the foundation.

## Ownership

Framework routes adapt route inputs, access guards, initial server reads, and
loading/error boundaries. Feature-root TSX screens, sections, and controllers
compose semantic hooks and focused views. A feature may have several meaningful
composition containers.

Feature-root `queries.ts` and `mutations.ts` own remote clients, query keys,
subscriptions, invalidation, and protected writes. Cohesive `use-*.ts` workflows
own form submission and related interaction state. Pure models own deterministic
projections and validation. Focused views under `components/` receive typed data
and callbacks; tiny disclosure, focus, or menu state can stay in the view.

DOM forms use the emitted `useAppForm`. Native forms use their declared form
library through typed native workflows. Extracting a workflow preserves account
and session ownership, cancellation, synchronous duplicate protection, and the
retirement of stale completions. Query results are not copied into component
state. Pass-through files and arbitrary fragmentation do not satisfy this design.

## Enforcement and developer ownership

The AST architecture checker and generated lint rules enforce their documented
syntax and import contracts. The [architecture reference](../../skills/ghostinit-use/references/frontend-architecture.md)
describes the role map and rule limits. Contributor instructions and both
`ghostinit-use` skill copies require agents to review responsibilities and
behavior as well as passing checks.

A required architecture finding blocks an acceptable verdict. A suspected false
positive needs a detector correction with positive and negative controls; raising
budgets or moving coupled behavior to evade detection is not a fix. The admin
workflow uses an optional total to express unknown data without a redundant
state flag or an expanded return-field budget.

The project owner can change or remove GhostInit. The generated lint, typecheck,
and test commands remain independently usable. Agents must not silently remove
or weaken safeguards to make their work pass.

## Recovery, localization, and composition

Unknown data, failed reads, confirmed empty results, and cached results are
different states. Sessions, passkeys, workspace panels, and admin counts preserve
those distinctions. Cached rows remain useful during a failed refresh, while an
unsuccessful first read does not invent a zero count or a successful-empty claim.
Workspace-dependent panels wait for a selected organization and unique sibling
keys preserve panel identity. On web and Electron, failed organization reads have a query-owned retry;
mutation failures retain their own feedback. On these surfaces, successful zero-team reads omit the empty selection group,
while cached choices and creation controls remain. Empty
session copy describes the available list without inventing a current device. An uncached paused conversation does not claim
there are no messages.

Manual-payment metadata keeps amount, date, reference, and status in readable
order in Arabic. Native metadata retains its accessibility grouping. Subscription
and invoice statuses use the existing EN/FR/AR catalog families, and passkey dates
use the active locale. Feature-flag JSON keeps left-to-right punctuation within
an RTL interface. Composed native button labels inherit the button variant's
semantic text style, including primary and destructive foregrounds.
User-authored reviewer notes, notification text, and Eve messages use automatic
text direction at their DOM boundaries so mixed-language punctuation remains
part of the text. Native text keeps its platform-specific rendering contract.

Conversation-read errors include an explanation beside their refresh action.
TanStack root error views receive a typed retry callback from their route
adapter, which invalidates the router to reload the failed route. Existing
server authorization remains part of that reload.

Manual payments remain a separate DZD workflow. A customer submits an amount and
private receipt; an administrator approves or rejects it. Client feedback never
credits the balance before the protected approval succeeds. Receipt previews
retain authenticated retrieval, object URL cleanup, and account ownership.
See [manual payment UI review](manual-payment-ui-review.md) for the earlier
baseline and its explicit limitations.

## Verification contract

Maintained regression coverage includes frontend ownership, generated import
closure, form recovery, stale-owner retirement, read-state presentation, manual
receipt workflows, locale rendering, native button composition, and component
size limits. Representative tests are listed in the
[frontend task record](frontend-task-records/frontend-responsibility-boundaries.json).

Installed generated-project checks, production startup, backend behavior, browser
interaction, and packaging provide separate evidence. A browser preview with
fixture transport does not prove server authorization or application SSR.
React Native Web does not establish Android or iOS rendering. Exact source and
artifact digests, commands, failures, screenshots, visual reviews, process
accounting, and cleanup receipts are retained in the local verification cohort.
A final result must identify its source and report every failed or unrun gate.
