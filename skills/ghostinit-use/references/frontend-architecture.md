# Frontend architecture

Read this before implementing or reviewing frontend code in a generated project.
The same responsibilities apply to Next.js, TanStack Start, Expo and Electron,
in single and monorepo layouts. Preserve the selected capabilities, design,
authentication/query ownership, SSR and platform behavior.

## Responsibility map

| Role                                         | Responsibility                                                                                                             | Keep outside this role                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Route                                        | Framework registration, params/search, loading and access guards; delegate to a feature screen or explicit server boundary | Feature workflows, large UI trees, copied query state                                   |
| Feature-root TSX composition                 | Screens, sections and controllers compose semantic feature hooks and focused views                                         | Raw state/effect/form/data-library hooks, direct remote clients and unrelated workflows |
| Feature-root `queries.ts` / `mutations.ts`   | Remote queries/subscriptions/mutations, query keys, cache invalidation and transport adaptation                            | JSX presentation and local dialog/form workflows                                        |
| Feature-root `use-*.ts`                      | One cohesive interaction: selected form state, submission, pending/error handling, cancellation and action sequencing      | A catch-all controller for unrelated features or direct clients that belong in adapters |
| Models, types, validation and helper modules | Deterministic transformations, schemas, formatting and types                                                               | React hooks/state, routing, networking and platform I/O                                 |
| Focused views                                | Typed data and callback props, rendering and tiny local UI state                                                           | Data/workflow hooks, authentication clients, remote I/O and business orchestration      |
| Shared primitives/infrastructure             | Reusable controls, semantic tokens, form/query providers and platform transport setup                                      | Feature-specific workflows hidden in a shared or primitive directory                    |

Use the app's existing source root. Web features normally live under
`src/features/<feature>/`; Electron uses its renderer source root and Expo uses
its native source root. Route locations remain framework-specific. Do not invent
`@repo/*` aliases in a single project or import DOM presenters into Expo.

Feature-root TSX is the composition boundary; a feature may have several cohesive
screens, sections or controllers. It does not need one giant `screen.tsx`.
Focused presentation belongs in the feature's `components/` directory or shared
app component modules. Root `use-*.ts` modules own workflows, and root
`queries.ts`/`mutations.ts` modules own remote adapters.

Only create modules that a feature needs. A static page can stay simple. A public
compatibility re-export can preserve an existing import path, but arbitrary
pass-through components and file splitting do not establish a real boundary.

## Forms, remote state and views

The selected form library owns field values, validation, touched state and form
submission state. DOM forms reuse the emitted `useAppForm` abstraction from the
app's form module. Native forms use a typed native adapter/workflow over the
declared form library; there is no implied native `useAppForm` export.

Keep a workflow cohesive. For example, a receipt-submission hook can coordinate
the form, file preparation, submit mutation and cancellation. Query/mutation
adapters own remote clients and cache invalidation; pure helpers handle amount
conversion and validation; the form view receives typed fields, statuses and
callbacks. Preserve server-side authorization regardless of which actions the
view renders.

Do not copy a query response into component state with an effect or maintain a
second pending/error/data model beside the query or form library. Derive values
during render or in pure models when no independent state is needed. Preserve
account/session cache keys, cancellation, stale-result rejection and identity
transitions when moving code.

A view may own a disclosure toggle, focus, an open menu or another tiny local
interaction. This allowance does not cover a multi-step submission/review
workflow, remote requests, file-transfer orchestration, or duplicated form state.
Pass typed data and action callbacks from the feature composition/workflow layer.

## Checker contract

Run `ghostinit check --json` from the generated project, using the explicitly
installed CLI. Its frontend finding identifiers are:

| Finding ID                      | Structural concern                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `frontend-remote-owner`         | Remote imports/calls outside the designated query/mutation adapter or explicit platform boundary |
| `frontend-form-owner`           | Form ownership/lifecycle outside the workflow boundary                                           |
| `frontend-view-workflow`        | A view imports data/workflow hooks or owns a network/form workflow                               |
| `frontend-server-state-copy`    | Known remote data is copied into local React state                                               |
| `frontend-derived-effect-state` | An effect recomputes local state from reactive/remote inputs                                     |
| `frontend-model-purity`         | A pure model/helper contains UI, hooks or effects                                                |
| `frontend-workflow-budget`      | A workflow exceeds the checker's supported responsibility/complexity budget                      |
| `frontend-policy-invalid`       | Persisted policy does not match the supported rule configuration                                 |

Type-only DTO imports are permitted; runtime data access is a different
responsibility. Existing server/client, vendor, module and database isolation
rules still apply. A route can use its legitimate server boundary without
granting a client view access to server code.

Read the actual finding and its source location. Do not invent a numeric limit,
change thresholds, widen exclusions, rename/move code to evade detection, or
suppress a finding merely to obtain a pass. Validate a suspected false positive
with a focused example and repair the detector while retaining positive and
negative controls.

These checks recognize defined syntax/import patterns, not every possible
semantic design flaw. Passing them is necessary; it does not establish that a
workflow is cohesive or that authorization, cancellation and rendered behavior
are correct. Review those properties and verify them with appropriate tests.

## Verification and completion

For a generated application, run its declared `typecheck`, `lint:all`,
`format:check`, `test`, build and applicable runtime commands, plus
`ghostinit check --json`. Inspect the manifest rather than inventing a command
for another platform or a disabled capability. Use `bun run install:bootstrap`
first for fresh `--no-install` output; subsequent checks use the verified locked
installation.

When developing GhostInit itself, use the exact local `dist/cli.js` against real
generated projects. Host source checks cannot validate emitted template strings,
dependency installation, SSR or native/Worker runtime behavior.

Do not describe work as acceptable or complete while architecture findings or
required gates fail. Report each failing or unrun gate and the exact scope
actually checked. Fix within the user's authorized task; a read-only review must
report the defect without silently becoming an implementation task. Required
gates remain blocking even when a visual demo or a subset of tests passes.

The project owner may change or remove GhostInit and its policies. Generated lint/typecheck commands remain independently usable. Agents must not silently remove or weaken safeguards to make work pass; changing those safeguards requires explicit developer authorization.
