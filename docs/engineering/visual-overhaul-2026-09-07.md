# Visual overhaul, 2026-09-07

This report records the implementation decisions behind the generated interface
overhaul. The design follows `design-taste-frontend`; [DESIGN.md](../../DESIGN.md)
owns the visual rules, and [VISION.md](../../VISION.md) defines the product scope.
Run results, screenshots, measurements and release receipts belong in the ignored
local review artifacts and the pull request, rather than this packaged report.

## Architecture and ownership

The CLI keeps parsing, application orchestration, domain policy and effectful
adapters separate. The immutable `GenerationPlan` carries ownership and provenance
through rendering and transactional writes. Generated responsibilities follow the
versioned [layer policy](../../src/lib/architecture/rules/layer-policy.ts) and its
specific isolation rules; they do not impose a mandatory six-hop call chain.

Next initial server reads call application services directly. TanStack uses its
server functions. Within client features, remote execution belongs in root
`queries.ts` and `mutations.ts`; `permissions.ts` contains pure projections and
types. Retry and refetch stay with the query owner. Component placement follows
feature ownership and reuse; `_components` is an optional colocation convention.

Feature state and request snapshots retain their identity, account or organization
owner. Late team creation cannot replace a newly selected organization's team or
draft. Shell identity distinguishes pending, authenticated, anonymous and error
states: pending alone renders skeletons, authenticated alone exposes private
navigation, and errors retry through the identity owner. The outer query boundary
and logout cache clearing remain intact.

The private billing shell matches `/billing` exactly, preserving public success,
cancel and Paddle checkout routes. Dead web `/workspace` and `/two-factor` aliases
are removed. Workspace mutations retain server authorization and membership
checks; unresolved permissions keep controls unavailable. The notification composer
is controlled presentation; its feature workflow owns interaction and effect
lifetimes, while remote writes remain in the mutation adapter.

## Visual composition and recovery

Light/cobalt and charcoal themes share semantic colors, elevation, radius and
control sizing. Web uses self-hosted Geist and Noto Sans Arabic; native uses
platform typography. Tailwind v4, owned Base UI and native components, TanStack
forms and the existing functional icon family remain the foundation. The shared
class merger recognizes the named shadows, allowing caller overrides such as
`shadow-none` without per-screen importance flags.

The text-only `BrandWordmark` renders adjacent `Ghost` in `text-primary` and `Init`
in `text-secondary-foreground`. Web preserves its Latin reading order in RTL;
native renders it with `Text`. The Electron renderer owns its component under the
renderer tree. Branding has no image, symbol, tile or generated-art favicon.

Single and monorepo Next applications share not-found, loading, route-error and
standalone global-error templates. Recovery presents localized guidance instead
of raw exception messages. Alert actions retain their natural width, and admin
filter actions align with the input while preserving helper and error messages.

The desktop workspace uses a 232px rail, 64px utility header and shared 72rem
content alignment. Mobile navigation uses a Sheet with focus and Escape behavior.
Dashboard content presents actual account data and useful actions, without a
repeated identity paragraph or fabricated metrics. Landing previews describe the
selected project's real structure. Nested workspace headings and desktop
`CardTitle` composition preserve the page's heading hierarchy.

Settings groups profile, security, passkeys and sessions. Authentication and
recovery use focused forms, localized explanations and inline errors. Account
deletion reports errors inside its dialog while retaining transaction integrity.
Session and passkey device labels are best-effort display information and never
authorization inputs. Maintenance presents its public unavailable state before
the administrator form; capability pages describe user tasks rather than internal
transport details.

Next locale changes synchronize the canonical document `lang` and `dir` before
paint, preserving cookie persistence and server refresh. TanStack retains its
provider synchronization. Logical spacing, localized recovery states and native
heading semantics belong to the same design contract.

## Maintained regression coverage

The suite protects behavior and generated contracts, including:

- Identity ownership, shell admission and retry boundaries in
  `workspace-shell`, `dashboard-identity-ownership` and
  `workspace-removal-scope-recovery` unit tests.
- Feature adapter placement and permission handling in
  `workspace-data-adapter-architecture` and `workspace-ui-permissions` unit tests.
- Destructive account behavior in `account-deletion-policy`; display-only device
  labels in `session-device-label` and `passkey-device-label` unit tests.
- Locale switching and native parity in
  `backend-capabilities/locale-routing-behavior` and `native-i18n-parity` unit tests.
- Heading composition, wordmark ownership and persisted desktop themes in
  `workspace-heading-composition`, `desktop-card-title`, `brand-wordmark` and
  `desktop-theme-persistence` unit tests.
- Shared Next fallback output, locale data and import closure in
  `next-fallback-parity` unit tests.
- Component size boundaries in `generated-shell-auth-size`,
  `generated-notification-messaging-size` and `settings-dashboard-size`; emitted
  syntax, imports and capability isolation in `generation-matrix` unit tests.

The [generated primitive integration test](../../tests/integration/generated-web-primitives.test.ts)
exercises real browser behavior. The [generated-project runner](../../scripts/test-generated.ts)
validates installed output. The [product record](frontend-task-records/visual-overhaul-product-2026-09-07.json)
and [brand record](frontend-task-records/visual-overhaul-brand-2026-09-07.json)
bind the maintained inventory, evidence paths, component IDs and design-context
hashes to these decisions. Record validation establishes record integrity, not
visual acceptance or release readiness.

## Validation policy and limits

Host checks alone cannot validate string-generated applications. Acceptance uses
the exact local CLI artifact against normalized, installed output: dependency
bootstrap with the seven-day policy, vulnerability audit, formatting, architecture
check, typecheck, lint and application tests. Production build and HTML/runtime
checks remain separate from that installed gate. Browser acceptance covers the
selected routes and features, keyboard behavior, responsive layouts, themes,
locales and relevant account-security flows.

Local checks use fresh guarded `bun --smol` processes where appropriate. Generated
Next builds select two static-generation workers locally; CI retains its default
parallelism and complete workload. Worker count is not a RAM cap, so process-tree
guards, full route coverage and cleanup verification remain necessary.

Each validation receipt must identify its source and generated artifacts, commands,
exit codes, scope, skips and interruptions. A focused replay cannot replace a
failed full run. Representative configurations do not prove every combination;
native runtime acceptance, browser coverage and performance measurements require
their own evidence. Live vendor operations require actual credentials and direct
proof. No fabricated credentials, weakened assertions or unsupported completion
claims can substitute for those checks.
