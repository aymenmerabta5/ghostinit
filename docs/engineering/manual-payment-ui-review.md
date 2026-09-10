# Manual payment UI review

This dated report preserves the initial review and its limitations. The later
[frontend engineering report](frontend-architecture-2026-09-10.md) records the
universal ownership boundaries and subsequent recovery/localization changes.

Reviewed on 2026-09-08 with Headless Chrome 151 on Windows. The preview rendered
the actual emitted manual payment components, copied generated UI primitives,
and semantic theme. It used installed React 19.2.8, Base UI 1.7.0, and Tailwind
4.3.3. Only the application API and locale selection were replaced with explicit
fixture data; these browser results do not prove database, receipt storage,
authorization, or installed application startup behavior.

These screenshots predate the subsequent frontend ownership migration. They
remain a visual reference for the intended layout; they are not screenshots of
the final migrated source. The installed checks below verify types and lint,
not a new browser rendering of those scenarios.

The preview runtime and browser tooling outputs stayed outside the repository in
`E:\Temp\manual-billing-ui-preview`. The six inspected screenshots are retained
locally under `.ghostinit-release/verification/manual-ui/`.

| Surface                                        | Viewport   | Evidence                              | Result                                                                                               |
| ---------------------------------------------- | ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Customer form and populated payment history    | 1280 × 960 | `manual-customer-desktop.png`         | Clear balance, receiving instructions, labeled inputs, and separate pending/approved/rejected states |
| Customer form and history                      | 390 × 844  | `manual-customer-mobile.png`          | Fields stack; instructions, amounts, status badges, and actions fit the viewport                     |
| Administrator approval confirmation            | 1280 × 960 | `manual-admin-approval-desktop.png`   | Confirmation states the exact amount to credit; review note and cancel remain beside the decision    |
| Administrator rejection, Arabic and dark theme | 390 × 844  | `manual-admin-arabic-dark-mobile.png` | RTL labels, amount formatting, reason textarea, and decision buttons remain readable and contained   |
| Successful empty history                       | 1280 × 960 | `manual-empty-desktop.png`            | Empty instructions appear after a successful read                                                    |
| Initial read failure                           | 1280 × 960 | `manual-read-error-desktop.png`       | A local error and refresh action appear; no successful-empty message or invented balance appears     |

The browser measured `scrollWidth === innerWidth` at 1280 pixels and at 390 pixels
in the Arabic RTL view. Each amount, reference, and receipt input had one
associated label. The complete desktop and mobile screenshots were inspected
for clipping, hierarchy, spacing, contrast, and action visibility using the
existing semantic colors and controls.

Browser interactions also exercised the emitted behavior. Approval first opened
the explicit confirmation without changing the fixture balance. Confirming a
1,200 DZD payment updated the displayed balance from 2,500 to 3,700 DZD and emptied
the pending review queue after refreshing. Submitting a real file input with a
500.50 DZD amount produced a pending message, cleared the successful form, and
left the 3,700 DZD balance unchanged. Rejection exposed its required reason.
The failure scenario showed only the read error and refresh control; the empty
scenario showed the successful-empty instructions without the read error.

`tests/unit/manual-billing-ui.test.ts` separately executes emitted workflow
callbacks to verify rapid duplicate guards, unchanged retry keys, preservation
of failed form inputs and review notes, deliberate approval, required rejection
reasons, on-demand private receipt fetching, and object URL revocation on close.
It also checks DZD minor-unit parsing, receipt limits, conditional emission,
translation keys, and generated TypeScript/TSX parsing. Browser preview evidence
complements those checks and does not replace the installed generated-project
or backend lifecycle gates.

The migrated feature keeps remote read state in `queries.ts` and protected
writes in `mutations.ts`. The `use-*.ts` workflows own form values, retry keys,
review decisions, and receipt object URL lifetimes. Root TSX files compose those
workflows with typed, prop-driven views under `components/`. Receipt metadata
comes from its private query; local state holds only the allocated preview URL
and its allocation error. A changed account owner cannot submit after file
reading finishes or clear a form with an obsolete completion.

All eleven emitted manual TSX files remain below the existing 150-line formatted
limit. The largest is `screen.tsx` at 113 lines; the form controller has 11,
fields view 91, review controller 18, decision view 56, and queue view 25.
`tests/unit/manual-billing-ui-size.test.ts` guards the same limit.

Fresh single Next.js and TanStack Start projects selected Postgres, all auth
features from the SaaS preset, manual + Chargily + Stripe, i18n, and messaging.
Both passed verified dependency bootstrap/audit, formatting, installed
TypeScript checks, and `oxlint --deny-warnings`. Each used the retained process
ownership guard with 3 GiB root and 4 GiB tree limits; every stage recorded exit
zero, complete output capture, and descendant cleanup. Exact generated-file
hashes and stage results are retained under
`.ghostinit-release/verification/manual-payments/frontend-iteration/20260908233752574-nextjs/`
and the corresponding `20260908233752574-tanstack-start/` directory. These are
source iteration checks, not final packed-artifact or production-start proof.

The subsequent Next.js/Postgres monorepo selected web, Expo, and Electron with
the same billing, auth, i18n, and messaging capabilities. Its original parallel
typecheck hit compiler allocation failures and was retained as incomplete
verification. After the source fixes, a generator refresh contained 1,174 files;
its package manifests and Bun install policy were semantically unchanged from
the freshly audited installed graph. All 21 typecheck tasks then passed with
Turbo `--concurrency=1 --force --continue=always` and runtime-only
`GOMAXPROCS=2`, followed by strict oxlint. The compiler setting limits concurrency,
not memory; the same 3/4 GiB root/tree guard remained active. Peak tree memory was
2,143,281,152 bytes, with complete output capture and observed cleanup. The exact
refresh hash and stages are under
`.ghostinit-release/verification/manual-payments/frontend-iteration/20260909010208010-next-native/refresh-20260909010759985/`.
This verifies installed native types and lint, not an Expo or Electron launch.

Expo intentionally shows balance and history with a configured web handoff for
receipt submission and review. An Expo simulator, native picker, and Electron
window were not exercised in this browser review.
