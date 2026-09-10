# DESIGN.md - GhostInit Design System

## Direction

GhostInit provides a clear, polished application foundation for builders and
their users. The visual language is calm and precise: cool neutral surfaces,
one cobalt accent, generous but useful spacing, and readable account workflows.
The 2026-09-07 overhaul replaces the earlier dark-first terminal aesthetic at
the user's request. It uses `design-taste-frontend`; Impeccable is not applied.

The existing Tailwind v4, owned shadcn/Base UI wrappers, TanStack forms, and
Lucide icons remain the component system. The skill's marketing composition
guidance applies to the landing page; application controls keep the mechanics
appropriate to forms, lists, and tables. Product dials are DESIGN_VARIANCE 5,
MOTION_INTENSITY 3, and VISUAL_DENSITY 3. Marketing uses variance 6 with the same
restrained motion. No new motion or component library is required.

## Color and elevation

Design contract 1.1.0 records this visual overhaul; its schema and typed output
share the same version. `semanticThemeCssContent()` owns the OKLCH palette emitted to
`ResolvedUiLayout.stylesRoot/theme.css`. These approximate sRGB references
describe the palette; implementation must consume the semantic tokens.

| Role           | Light   | Dark    |
| -------------- | ------- | ------- |
| Canvas         | #F6F7F9 | #11151C |
| Surface        | #FDFEFF | #191F28 |
| Main text      | #202127 | #EEF2F8 |
| Muted text     | #626B79 | #A1ACBC |
| Primary accent | #3155D9 | #9BB8FF |

Light is the initial web theme; the header toggle persists the user's choice.
Electron retains its existing system-preference fallback. Dark mode is a complete charcoal palette with the same
hierarchy; individual sections never invert the page theme. Success, warning,
and destructive colors communicate actual state, not decorative categories.

Filled primary and destructive actions use near-white text in light mode and
dark text in dark mode. Calculations from the emitted tokens give primary
contrast of 6.06:1 light and 9.31:1 dark, destructive contrast of 6.01:1 and
8.74:1, and input boundaries above 3:1. Rendered combinations, hover states,
focus rings, and text on tinted surfaces still require browser review.

Cards use a quiet 1px border and subtle tinted `shadow-surface`. Popovers use
`shadow-popover`; modal containers use `shadow-modal`. Shadows express depth
without glows. The shared radius scale is 6px for labels, 8px for controls,
12px for cards and menus, and 16px for modals. Avatars remain circular.

Named layers live in the shared theme: navigation 20, overlay 40, modal 50,
popover 60, tooltip 70, and toast 80. The header and navigation rail stay below
modal scrims. Menus opened inside modals stay above the modal surface. Arbitrary
layer numbers are not accepted in page code.

## Typography

Web uses self-hosted Geist Variable and Geist Mono Variable from exact catalog
dependencies. Noto Sans Arabic Variable follows Geist in the sans fallback stack
so Arabic has a deliberate typeface while Latin keeps Geist. Web styles import
their weight CSS; native uses the platform font fallback rather than importing
browser font CSS. Code uses the mono family.
Generated Next, TanStack, and Worker content-security policies permit local
fonts; the obsolete Google Fonts stylesheet/font origins are removed. Production
and Worker runtime checks assert this policy alongside existing security headers.

- Product body: 15px with 1.6 line height; prose stays within 65 characters.
- Controls and labels: 14px. Inputs use 16px on mobile to avoid browser focus zoom.
- Page titles: 28-32px, semibold, with modest negative tracking.
- Section titles: 18px; helpers and errors remain readable at 14px.
- Marketing: responsive display type, a concise headline, and a short description.

Pages use this hierarchy through the existing Tailwind typography classes.
Theme controls use the existing Lucide icon family through one shared web
renderer. Long translated titles and workspace names wrap without pushing actions outside
the viewport. Icon size belongs to its wrapper. Portable utilities are added only
when used and verified by every selected platform adapter.

## Layout

The authenticated desktop workspace has a 232px navigation rail and 64px utility
header. Content uses a 72rem maximum width and 20/32/40px responsive horizontal
padding. A mobile Sheet exposes the same selected-capability destinations with
an accessible name, keyboard support, Escape dismissal, and focus restoration.
Navigation reads canonical identity and role; pending identity keeps stable
chrome without exposing private links. Public and authentication pages use the
public header. Unknown custom routes remain public until registered deliberately.

The GhostInit wordmark, route paths, navigation labels, and role checks remain.
Implementation badges such as "modular monolith" are removed from the header.
The brand is a text-only `GhostInit` wordmark. `Ghost` uses `text-primary` and
`Init` uses `text-secondary-foreground`, so both remain readable in light and dark
themes. The words are adjacent, with one font family and weight; the brand keeps
its left-to-right reading order in RTL interfaces. No symbol, enclosing tile,
image, or generated-art favicon accompanies it. Rejected image concepts and their
temporary generation files are removed from the workspace.
The desktop wordmark lives inside the renderer's component source root, matching
its import alias and keeping presentation out of the main-process source tree.
Desktop card titles share the web component's typed `h1`-`h6` heading selection.
They keep the default `h3` and shared typography while capability pages select
the heading level appropriate to their page hierarchy.
Dashboard composition emphasizes actual account information and useful actions;
technical project guidance is a secondary disclosure. No invented metrics or
passing-health claims are presented as live data.

Settings uses wrapping horizontal secondary navigation, a full-width profile
surface with a desktop metadata/form split, two aligned security sections, and
full-width passkey/session lists. Destructive account controls form a compact
action row, with password confirmation and errors inside their dialog. Lists use
dividers instead of a card around every row. Ordinary actions keep content width.

Auth and recovery use a focused 440px form surface, a 32px title, clear field
spacing, and a quiet footer divider. Primary form submission intentionally spans
the form width. Back arrows mirror in RTL. Loading skeletons match the form.
Legal copy, field names, validation, and account-state behavior remain intact.

Not-found, authorization, and unexpected-error views use the same focused width,
heading scale, and compact actions. Route loading follows the workspace's two
primary content regions instead of an unrelated three-card grid. Unexpected
errors show translated recovery guidance rather than raw exception messages;
diagnostic logging remains available. The document-level Next error boundary
imports its stylesheet directly because it replaces the ordinary root layout.
Single and monorepo Next applications use the same not-found, route-error,
global-error, and loading templates. Single mode retains its own root providers;
global errors use the standalone locale adapter so recovery remains available
when those providers fail.
Monorepo renderers emit authorization fallback pages only with authentication,
so direct-renderer output cannot offer a sign-in link to an absent route.

Feature pages share the same heading rhythm and content bounds. Cards group
meaningful work; nested cards and repeated equal feature grids are avoided.
Tables and lists retain the density needed to compare real data. Empty, loading,
failed, populated, and refreshing states have distinct presentations.
The notification feature owns a controlled `NotificationComposer` beside its
page. The presenter renders fields and forwards callbacks; a cohesive feature
workflow owns mutation state, ownership, navigation, and desktop notification
effects through the remote adapters. The page composes that workflow and the
presenter within the existing page/component size limits.
Electron's local controls use the same heights, surfaces, radii, and readable
field text. Product descriptions explain the user's action instead of internal
server paths, transport boundaries, or scheduler ownership details.

Marketing uses an asymmetric editorial hero with an actual project structure or
code example, concise copy, and one label per action intent. Claims and links
reflect selected capabilities. No fake terminal execution, version badge,
fabricated testimonials, decorative metrics, or placeholder product screenshot
is used. Existing section anchors and exported components stay stable.
Default page metadata describes the general application foundation without
claiming unselected authentication, data, or runtime capabilities.

The Expo landing uses the complete two-part headline and the same concise copy
through native primitives. Sign-in, API, and billing surfaces each follow their
own resolved capability; selecting one never advertises another. The shared
design explanation replaces unconditional backend claims in frontend-only apps.

## Components

### Ownership and composition

Routes own framework concerns: authentication, initial server reads, redirects,
metadata, and loading/error boundaries. Route-specific components stay near their
route when they have no other consumer. Reusable capability UI belongs in
`src/features/<capability>` with its cohesive components, hooks, and client
adapters. Shared visual primitives and patterns belong to the resolved UI module.
`_components` is an optional route-private convention, not an architectural rule.

Extract a component when it owns meaningful behavior, independent state, reuse,
or a readable section. Do not create a hook for every expression or split files
solely to meet a line count. An orchestration component should show the screen's
states and composition; it should not hide transport work in a supposedly
presentational child. Domain and server implementations stay outside feature UI.

### Refinements from browser review

The shared web provider uses `next-themes`; the toggle reads `resolvedTheme` so
it also behaves correctly if a consumer enables system mode. The default remains
light with an explicit persisted choice. Electron's HTML and provider share the
same initial light theme. Restoring its preferences finishes before persistence,
and asynchronous writes preserve the latest user choice without overwriting
unrelated saved settings.

Header and page content share the 72rem alignment. Mobile hides the redundant
breadcrumb title and compacts the brand at narrow widths while keeping its
accessible name. Dashboard surfaces use the shared 12px radius and elevation;
the duplicate account-description paragraph is removed. The central class merger
registers the four owned shadow names, allowing `shadow-none` and other caller
overrides to work without adding `!important` to individual screens.

Shell identity explicitly distinguishes pending, authenticated, anonymous, and
error. Only pending identity renders skeletons. Settled anonymous/error states
do not expose private navigation or claim to be loading; unavailable identity
offers a bounded retry. Billing matches its workspace root exactly, leaving its
public return routes outside the private shell. Unknown web routes do not inherit
unused native route aliases.

Session labels use best-effort browser/platform names for recognition, never for
authentication. Underlying IDs and session/revocation operations remain unchanged.
Authentication copy explains the user's task instead of cookie flags or protocol
details. The backup-code method remains available during two-factor sign-in;
the misleading link to protected Settings is removed. Legal and consent wording,
device-trust choice, and all verification controls remain unchanged.

Maintenance presents its unavailability message first. Its unchanged token POST
form is inside a closed native administrator-access disclosure. The page promises
neither a restoration time nor data safety that it cannot verify. PDF and sample
job headings describe their tasks without repeating field labels or exposing the
internal job-kind name as a primary action.

Workspace management uses the existing selected-organization permission API.
Pending or failed grants keep mutations unavailable while preserving readable
content and retry. Owner and final-owner restrictions remain reflected in the UI;
team activation requires actual membership. Ordinary members can still create
and switch organizations. Canonical application IDs identify the current user,
including Convex; provider IDs are not substituted. No directory access or new
profile data is exposed. The current user's existing name may label their own
row; other identifiers remain compact references, and team additions select from
already available organization members. Messaging keeps its explicit recipient-ID
contract with a visible label and guidance.

### Read and mutation states

Manual payments form a separate DZD balance workflow beside the selected online
provider panels. Customers read the configured receiving instructions, enter the
amount actually paid, select the payment method, and submit a PNG, JPEG, or PDF
receipt of at most 5 MiB. The balance labels approved credit explicitly; submission
is shown as pending review and never increases the displayed balance optimistically.
The form preserves its amount, receipt, and reference after failure. Retrying an
unchanged submission reuses its request key, and a synchronous guard prevents
rapid duplicate submission before React updates the disabled state.
The field presenter receives values and callbacks; the form controller retains
submission state, receipt ownership, and the duplicate guard. Review queues use
a controller per payment and a prop-driven decision form, keeping the formatted
generated modules within the existing 150-line feature limit.

Payment history distinguishes pending, approved, and rejected submissions and
shows the review note. Authorized administrators receive a separate review queue
with account, amount, transfer method, reference, date, and private receipt access.
Approval requires an explicit confirmation explaining the balance change;
rejection requires a reason. Review failures preserve the note and confirmation.
Each row guards its own operation. Receipts load only on request, use authenticated
bytes, and revoke their browser object URLs on close or owner retirement. Images
have an accessible description; PDFs download for inspection. Server ownership,
authorization, content validation, and atomic ledger writes remain authoritative.

The workflow reuses the current Card, Field, Input, Textarea, Alert, Badge, Button,
Skeleton, and Empty primitives and semantic tokens without changing the billing
route or navigation. English, French, and Arabic copy covers every state. Reads
distinguish initial loading, successful empty data, and failures while retaining
same-owner data during refresh; identity-generation changes remount the workflow
and discard input and private previews. Electron shares the complete web workflow.
Expo shows the real authenticated balance and history and opens the configured
web billing page for receipt submission and review, explicitly explaining that
another sign-in may be needed. It does not advertise an in-app upload control.

Data surfaces distinguish initial loading, failed reads, successful empty data,
filtered empty results, populated data, and background refresh. A failed read
never becomes a claim that no records exist. Use the existing loading and Alert
patterns, retain usable same-user data during a background failure, and offer a
local retry. Empty-state instructions appear only after a successful read.

Mutation state belongs to the operation it protects. A row action disables its
conflicting controls and keeps an accessible action name while pending. A
synchronous duplicate guard closes the gap before React renders the pending
state. Independent rows can remain usable. Errors stay near the affected action
and preserve the user's input.

Password-confirmed account deletion in Next.js and TanStack shows failures
inside the active confirmation dialog using the existing localized destructive
Alert. The dialog remains open with its input available so the user can retry.
Deletion descriptions and confirmations promise account deletion only and explain
that retained records may block it. They do not promise deletion of all associated
data or define a retention period. Only the typed `ACCOUNT_DELETION_RESTRICTED`
failure selects English, French, or Arabic guidance to ask the application
administrator for review. Typed incorrect-password and expired/recent-session
failures select localized recovery guidance; unknown and thrown failures use a
safe generic message without provider details. The alert does not promise that
an administrator can remove retained records.

Next.js and TanStack deletion use the public identity client so a successful
operation also notifies the reactive session owner. After success, the private
query scope is retired synchronously before navigating home; Next also refreshes
the server-rendered route. Refused deletion leaves the dialog, credentials,
session, and private cache intact. The password field and confirmation controls use the shared settings form
patterns; their error and pending behavior remains unchanged by visual changes.

Profile edits in Next.js and TanStack use the public identity client and refresh
canonical identity after a successful save, so the header and settings agree
without a manual reload. Success feedback uses the existing global toast store
because refreshing identity can remount the form. Failed saves keep input and
show a safe inline message. Next also refreshes server-rendered profile data.
The public auth endpoint preserves the prior server rule for supplied names:
trim whitespace and require 1–50 characters. Other user fields keep their existing
admission rules; client forms retain their existing 2–50 character validation.

Passkey lists belong to the provider user and session, including projects that
select authentication without the application API. Their queries consume an
abort signal, retire on account or session changes, and reject obsolete manual
refetches. When the application API is present, a settled matching canonical
identity is required as well, so a delayed vendor session cannot restart a list
after sign-out. The vendor's global list subscription is not used. Registration,
rename, and deletion feedback/refetches belong to the initiating mounted account.
An initial list request shows a matching skeleton; a failed request exposes retry
and keeps any available rows. Empty text and counts appear only after a successful
list result. The passkey card retains its controls, while a separate management hook owns
its local state and operations within the existing file-size limits.

### Authentication and query ownership

Personalized query data belongs to the authenticated user, session, and active
organization/team context. A browser singleton is a cache lifetime choice, not
permission to reuse private data across identities. Identity transitions must
prevent old cached data, late responses, persisted cache restoration, or stale
server-provided initial data from appearing under the new identity. Logout
clears private query state before navigation. Authless projects retain a simple
query-provider path.

### Universal frontend responsibility boundaries

All frontend features follow the same responsibility boundaries across Next.js,
TanStack Start, Expo and Electron, in both single and monorepo output. Preserve
the current visual system and behavior while changing ownership; an attractive
screen or a short component does not make a coupled workflow acceptable.

Routes remain framework entrypoints for params/search, loading and access guards.
They delegate to feature-root TSX composition containers or the appropriate server
boundary. A feature may have several cohesive screens, sections or controllers;
these compose semantic feature hooks without owning raw state/effect/form/data
library hooks. Feature-root `queries.ts` and `mutations.ts` own remote clients, query
keys, subscriptions and invalidation. Root `use-*.ts` hooks own coherent
interaction workflows. Models, validation and helpers stay deterministic;
focused views consume typed data/actions. Shared primitives and infrastructure
own reusable controls, semantic tokens and platform setup.

The form library owns form state: DOM features use the emitted `useAppForm`;
native features use typed native adapters/workflows over their declared library.
Do not add a competing set of field, pending and error states. Query results stay
in the remote-state adapter/cache instead of being mirrored into component state.
Preserve account ownership, cancellation and stale-response protection.

Tiny view-local state such as disclosure, focus and menu visibility is allowed.
Remote access, form submission and multi-step business workflows are not view
responsibilities. Extract cohesive units, not arbitrary fragments or wrappers
whose only purpose is to lower a detector's counter. Existing public re-exports
may preserve import compatibility without retaining the old mixed ownership.

The project owner may change or remove GhostInit and its policies. Generated lint/typecheck commands remain independently usable. Agents must not silently remove or weaken safeguards to make work pass; changing those safeguards requires explicit developer authorization.

`ghostinit check --json` reports the structural frontend rules documented in the
[frontend architecture reference](./skills/ghostinit-use/references/frontend-architecture.md).
These checks supplement responsibility review, behavior tests and visual QA;
they do not prove perfect semantic detection. A failing architecture rule or
required gate blocks an acceptable/complete verdict. Do not disable detectors,
raise limits, widen exclusions or create broad exceptions to hide violations.
Validate a suspected false positive and fix the detector with positive and
negative controls; report failed and unrun gates truthfully.

### Frontend recovery refinements, 2026-09-10

The universal ownership migration preserves the existing visual system. Failed
first reads of sessions, passkeys, workspace data, and admin totals do not render
successful-empty claims or invented zero counts. Cached rows and their actual
counts remain visible during a failed refresh. Workspace-dependent sections wait
for a selected organization, and sibling panel keys remain unique. An uncached
paused message read retains its pending presentation. Empty-session copy describes
the returned list without claiming that it contains the current device. Web and Electron workspace
read and mutation failures have distinct explanations, organization reads expose
their query-owned retry, and successful empty teams omit the selection group.

Manual-payment amount/date/reference/status metadata keeps a readable order in
Arabic while native metadata preserves its accessibility grouping. Passkey dates
use the active locale, and subscription/invoice status labels use the existing
EN/FR/AR catalogs. Structured feature-flag JSON stays left-to-right inside RTL
layouts. Native button text inherits its containing button variant so composed
labels receive the intended semantic foreground and size. User-authored manual
review notes, notification text, and Eve messages isolate their automatic text
direction at DOM boundaries. Native text retains its platform-specific contract.

Conversation-read failures include their localized explanation and refresh
action. TanStack route error adapters supply router invalidation through a typed
retry callback to the focused view; failed loaders rerun their normal access
checks. Next error boundaries retain their existing framework reset callbacks.

These changes preserve query ownership, cancellation, server authorization, and
workflow boundaries. The [frontend engineering report](./docs/engineering/frontend-architecture-2026-09-10.md)
and its task record describe the maintained behavior and verification contract.

### Architecture review changes, 2026-09-07

- Destructive controls use contrast-safe semantic foregrounds in both themes.
  The visual overhaul recalibrates these shared tokens; the earlier account
  review first established the dark-foreground requirement.

- Authentication routes compose focused `TwoFactorForm` and `ResetPasswordForm`
  components. Routes own layout and framework search adaptation; forms own
  validation, submission, and recovery. Agent routes compose header, transcript,
  and prompt components; PDF controls consume a separate sample-data module.
  Session presentation consumes a dedicated data adapter. These boundaries keep
  formatted components within the existing size policy while preserving their
  controls, loading states, and ownership rules.

- Agent routes compose focused header, transcript, and prompt components. The
  route retains the Eve connection and error boundary, the transcript owns
  message presentation and streaming announcements, and the prompt owns its
  editable input. PDF routes compose a focused workspace; bounded sample data
  lives in a pure module shared by each app's templates. These structural splits
  preserve the rendered controls and states while keeping every emitted surface
  within the existing 150-line limit.
- Successful web signup opens email verification when the authentication response
  has no session token, and opens the dashboard only when a session exists.
  Verification guidance explains the inbox step and how to request another link
  in English, French, and Arabic. The destination carries no submitted values,
  and the copy preserves the provider's generic response for an existing email.
- Notification inbox actions retain keyboard focus while temporarily disabled.
  The shared Base UI button remains focusable during mark-read, exposes its busy
  state, and suppresses repeated activation until the current action settles.
- Notification navigation and cache refresh belong to the component and account
  that initiated mark-read. Delayed results cannot navigate after an account
  change or unmount. Pages use the common ownership hook; the reusable bell
  accepts a caller-provided action guard, keeping its presentation independent
  of authentication. Notification-only projects receive the same shared hook
  without selecting billing or importing billing internals.
- Mobile language controls reserve enough width for the complete locale code and
  use the shared 16px select chevron. The control cannot shrink below that width;
  the previous 64px trigger clipped the selected language beside a 24px icon.
- Switching language updates document language and writing direction with the
  resolved translation locale before paint. Arabic immediately uses RTL text and
  logical shell placement; switching back to English restores LTR without a full
  page reload. Next synchronizes `html.lang` and `html.dir` in the existing locale
  switcher's layout effect, while retaining cookie persistence and server refresh.
  TanStack retains its document synchronization in the locale provider.
- Alert icons occupy the first grid column. Titles, descriptions and actions
  occupy the content column; direct action buttons and links retain their natural
  width in both web and Electron renderers.
- Administrator search places its label, control and supporting messages on
  separate grid tracks. Search and clear actions align with the control on
  desktop and follow the field on mobile, including when validation adds an error.
- Administrator row actions stack and share their cell width below `sm`. Keyboard
  focus can reveal either complete button within the horizontally scrolling
  table. At `sm` and above, actions keep their existing horizontal arrangement.
  Returning focus after confirmation also reveals the action, because changed
  status and action labels can resize the table columns while the dialog closes.
- Dashboard role labels and passkey device labels use the selected language.
  Unknown role identifiers remain readable as isolated data. Passkey wording
  distinguishes current backup state from the ability to be backed up.
- Session metadata adds an IP separator only when an address is present. Invoice
  empty states explain invoice availability. Two-factor footer guidance describes
  single-use backup codes in both challenge modes.
- Full-page authentication, account-recovery, checkout-return, and error cards expose their title as the
  page's H1. `CardTitle` accepts a typed heading level while retaining its shared
  visual styling, so semantic hierarchy does not require duplicated components.
- The two-factor challenge supports authenticator and backup-code entry. Device
  trust is an explicit, unchecked choice with shared-device guidance; switching
  methods clears entered credentials, and pending verification prevents switching.
  Setup verification and native challenges without a trust control never grant
  device trust automatically.
- The settings sidebar reads administrator roles from canonical application
  identity when the identity API is included. Pending, failed, or anonymous
  identity hides the control; API-disabled projects omit it. Provider session
  types do not need to invent an application role.
- Workspace guidance describes organizations, membership, and role permissions
  in plain language across web, desktop, and mobile instead of exposing internal
  service and tenancy terminology.

The behavioral repairs below remain required through the visual overhaul.
Their earlier preserve-only visual direction is superseded by the system above.

- TanStack billing distinguishes a failed snapshot from a successful empty
  account, offers retry, and retains available data during refresh failures.
- Expo and Electron billing use consistent read states for subscriptions and
  invoices. Expo errors use the shared accessible Alert; merchant fields have
  explicit labels.
- Electron admin actions own pending and error state per user row and prevent
  duplicate or conflicting requests for that row.
- Messaging conversation lists and threads distinguish initial loading, read
  failure, verified empty data, and background refresh. Postgres clients show a
  localized error with targeted retry while keeping cached messages visible;
  native screens explicitly ask the user to select a conversation. Convex live
  queries retain their framework error boundaries and show loading until the
  first result arrives.
- Authenticated query boundaries scope and clear private data when identity
  changes. Next.js session initial data carries request-derived ownership so a
  stale server snapshot cannot populate another account's cache.
- Expo persistence uses an identity-scoped storage key and admits restoration
  only for the current client, identity, and authentication generation. Private
  screens wait for the matching restore; an obsolete restore cannot populate a
  new account or mark it ready. Authenticated outputs without a canonical API
  avoid persisting private query data.
- Shared forms contain unexpected synchronous or asynchronous submission
  failures with a localized alert and retry. They preserve entered values and
  reject duplicate submissions while a request is pending. Feature-specific
  errors remain beside the operation that failed.
- Account settings show success and clear sensitive fields only after confirmed
  success. Profile defaults may come from the initial server render, but an
  editable profile after hydration always belongs to the live authenticated
  account; pending identity shows a skeleton and anonymous identity exposes no
  stale editor.
- Next.js password changes use the existing identity auth client so rotated
  session cookies and the client session state are synchronized together. Other
  sessions are still revoked. Failed requests keep their input and an inline
  error; confirmed success clears both password fields and uses the shared toast
  store so feedback survives the same-user session boundary remount. Ordinary
  application mutations retain their validated Server Actions.
- Next.js session management keeps its initial-data contract, authenticated query
  ownership, and revocation mutations in the route's `sessions.ts` data module.
  The card and list only render state and invoke supplied actions. Single and
  monorepo projects use the same producer, and API-disabled outputs omit the
  complete session slice.
- The shared user menu places its account label and navigation items inside the
  same Base UI group, with sign-out in a separate group. This preserves menu
  semantics and avoids a missing group context when opening the menu in either
  web framework or project layout.
- Passkey registration exposes a visible, translated field label associated with
  its name input. The existing optional-name behavior and registration feedback
  remain unchanged, and the control uses the shared field primitives.
- Next.js nests the workspace title at heading level two beneath the Settings
  layout's page heading. TanStack's parent settings route renders only its outlet
  for the workspace, so that standalone workspace retains its level-one title.
  Both variants keep the same typography and spacing.
- Next.js request-owned snapshots protect the complete private subtree for
  admin users, billing, settings, and the identity workspace. A changed account
  or tenant hides the old snapshot before display and refreshes the affected
  route once. Loading and retry are accessible and translated.
- Organization and team membership removal refreshes the canonical identity
  scope on web, desktop, and mobile. Removing the current member can clear its
  active organization or team on the server, so successful removal clears the
  old private cache and requests current identity before restoring the workspace.
  A delayed read from the removed membership cannot restore the previous scope.
- Canonical application data supplies user roles and active organization/team
  context. Provider session data establishes identity, so differences between
  Better Auth and the application database cannot silently reset tenant scope
  or mislabel an administrator.
- Billing follow-up effects belong to the mounted component and the current
  authenticated generation. Delayed checkout, portal, merchant-link, and
  clipboard results cannot affect a different account or a departed screen.
  Backend operations may still finish; current-owner results remain usable.
- Monorepo dashboards present setup guidance and real check commands instead of
  invented live health, severity counts, or passing checks. Architecture is
  shown as responsibilities with inward domain dependencies, and starter
  packages are described as included. English, French, and Arabic follow the
  same design and meaning.

### Shared controls

Buttons default to 40px high, with 36px small and 44px large variants. Filled,
outline, ghost, secondary, and destructive treatments preserve visible focus,
accessible pending names, and contrast. `asChild` maps to Base UI `render` with
`nativeButton={false}` for links. Inputs use the shared border, surface, and ring
tokens; every input has an associated label and local helper/error text.

Cards have 20/24px responsive interiors and an explicit heading level. Form
sections use spacing and a separator instead of another box. Menus and selects
have 36px rows, clear selected/highlighted states, and bounded scrolling. Dialogs
and Sheets use portals, named layers, viewport margins, and scrollable content.
Empty states explain what the user can do next after a successful empty read.

Localized Next client pages now have a thin server route entrypoint that marks
request-localized metadata as intentional dynamic work. The static single-app
landing page declares the same boundary inside its existing server entrypoint.
Static billing success and cancellation entrypoints declare it too.
Client views stay
beside the route with the same imports and behavior. The shared metadata boundary
renders nothing and adds no visible loading state; existing server pages retain
their own request and Suspense boundaries. This keeps cookie/header-selected
titles and descriptions without caching a request's locale globally.

TanStack Convex messaging routes now own only authentication admission and
parallel initial reads. The adjacent `-components/messages/convex-messages.tsx`
owns the conversation controls, selection, empty/error states, and thread view.
Both packaging modes use that same boundary and retain their existing layout
and interaction behavior. Desktop authentication and workspace file composition
also has a dedicated identity module; generated desktop routes are unchanged.

The workspace rail and mobile Sheet preserve every supported destination and
its role gate. Header controls have shrink protection; organization selectors
stack names above slugs and wrap long values. These rules address the earlier
tablet header and mobile workspace overflow findings within the new shell.

Dashboard authorization stays in the server route. The request's identity is
used for server rendering and matching initial hydration; subsequent renders
select the canonical current-request user, or the reactive provider session
when the API capability is absent. Loading, error, and signed-out states never
fall back to a retained user's identity. Dashboard Admin controls require both
the generated admin routes and the current admin role. Feature-root `queries.ts`
consumes existing authentication state without adding a network read;
`identity-state.tsx` renders the shared loading and error presentation.
Single Next.js and TanStack dashboards share bounded components with explicit
framework-specific link emission.

### Single-project marketing

Single Next.js and TanStack Start landing sections receive explicit resolved
auth, API, database, billing, and Eve options. Authentication links and cards
appear only when authentication is selected; billing links and cards appear only
with billing. Database badges distinguish Postgres/Drizzle from Convex and omit
database claims when no database is selected. Directory badges follow the
selected server and agent capabilities.

The overhaul preserves the section anchors and capability-aware content while
replacing the old visual composition with the shared editorial landing layout. Without authentication, the primary action goes to the
page's quick-start section. English, French, and Arabic copy describes the
selected foundation without claiming a universal runtime or port count. Quick
start shows the generated project's bootstrap and development scripts, with
service configuration delegated to its README instead of a mismatched scaffold
command. Generation tests check every emitted marketing link against actual
routes and every displayed command against the generated manifest.

### Generated notification and Convex message size boundaries

The shared notification library owns the bell's item contract; the bell preserves
its public type export and retains its existing pending, error, read, and
navigation ownership. Notification pages on web and desktop show the shared
description once in the page header instead of repeating it in the creation
card. The form fields, action labels, loading states, and query ownership remain
the same across both web frameworks and i18n variants.

Next.js Convex message features keep remote reads and send/typing mutations in
feature-root query/mutation adapters. Pure models normalize unknown responses;
cohesive thread and form hooks own selection, draft and submission workflows.
Feature-root TSX composes those hooks with typed-prop views. The generated
150-line component and 200-line page limits are unchanged and are checked after
the installed formatter runs.

### Capability operations and PDF lifetimes

Jobs, storage, and manual feature-flag evaluation share a small action hook that
combines the existing account-lifetime guard with a synchronous pending latch.
Each page admits one operation at a time, disables conflicting controls, shows
translated pending feedback, and releases the controls after failure so the user
can retry. Jobs retain their explicit run-ID lookup; storage retains explicit
binary operations. Neither page adds an initial collection query.

Authenticated Next.js feature-flag results carry the request principal's user,
session, organization, and team through the existing `RequestOwnedSnapshot`.
Retained server props cannot reappear for a different account after a provider
remount. Public manual evaluation remains available. TanStack continues to use
its scoped initial query.

PDF downloads and shares belong to the initiating mounted account. The reusable
web hook accepts an ownership capture function and also checks its own lifetime;
native cookie, response, and share-availability continuations check ownership
before their next effect. Desktop checks ownership before creating a download.
The existing pending guards and same-owner download/share behavior are retained.

Controlled mounted React tests reproduced duplicate operations, retained Next
flag props, and late PDF effects before the change. They also confirmed that
the existing web/desktop account boundary and Expo root already discard old
local state. The fixed proof passes 187 checks using the actual generated
providers; Expo, desktop, and network effects are controlled adapters, so this is
not a device or real-server runtime claim. Permanent operation regressions and
formatted-size checks complement that proof. Eve keeps the SDK's existing
per-hook abort cleanup.

## Motion and imagery

Interactions use 150-200ms feedback for hover, focus, disclosure, and overlays.
Only opacity and transforms animate. Reduced-motion disables nonessential
animation, including skeleton/spinner motion; there is no page-load choreography
or continuous decorative effect. Static product/code content supplies the landing
visual. Any future screenshot must show the actual generated interface. Raster
imagery is optional and must serve the content rather than fill empty space.

## Overhaul verification, 2026-09-07

Source work includes the shared tokens and web primitives, self-hosted fonts,
workspace shell, dashboard, settings, auth/recovery, and landing/feature
presentation. Existing account ownership, cancellation, validation, and permission
contracts remain release requirements. Static token contrast is measured above;
the redesigned generated app is not yet browser-accepted. Verification must cover
both themes, EN/FR/AR, RTL, desktop/tablet/mobile, keyboard interaction, all route
states, and the real generated install/build paths. Earlier screenshots and
passing checks establish the functional baseline only, not visual approval of
this new design. Final evidence belongs in the frontend engineering records.

## Cross-Platform Consistency

The mode-resolved UI logical module in `ResolvedUiLayout` owns one versioned semantic Tailwind v4 contract. A platform changes the implementation of a semantic rule, never its name, token, state, or component vocabulary.

### Portable contract

`ResolvedUiLayout.stylesRoot/` contains only the portable source:

- `theme.css` owns the complete OKLCH semantic-token set and Tailwind `@theme inline` mappings.
- `utilities.css` owns only portable-compiler-verified Tailwind v4 `@utility` definitions and interaction variants. A utility is admitted only when the same semantic name and states can be mapped by every selected adapter.
- `base.contract.css` is element-free. It declares the semantic base-role/state contract and contains no DOM selector, reset, layout, or browser-only behavior.
- `web.css` composes Tailwind, animations, `theme.css`, `utilities.css`, `base.contract.css`, and `web-base.css` for DOM targets.
- `native.css` composes the supported native compiler with `theme.css`, `utilities.css`, and `base.contract.css`; it never imports a DOM reset.

`web-base.css` is explicitly DOM-only and owns browser resets/base element rules. `native-base.ts` maps the same named semantic base roles and states to supported Expo/Uniwind native styles; it does not try to run a DOM reset on native.

### Adapter ownership

Only the mode-resolved UI logical module may contain platform adapters. They are versioned source under `ResolvedUiLayout.stylesRoot/adapters/{next,tanstack,electron,expo}/` and are explicitly exported through `ResolvedUiLayout.stylesImport` and `ResolvedUiLayout.contractImport`. Each adapter consumes the portable semantic names, maps them for its platform, and may not add a token, reusable utility, variant, or component style. `DesignSystemContract.adapters` lists every selected adapter, its version, entrypoint, supported semantic mappings, fixture IDs, and any registered inapplicability rationale.

An application global stylesheet may contain only its `ResolvedUiLayout.stylesImport/<entrypoint>` import(s) and contract-allowlisted target-relative `@source` declarations. It may not contain CSS declarations, `@theme`, `@utility`, `@custom-variant`, Tailwind configuration, component styles, or adapter implementations. Structural checks verify those restrictions plus each package export; an app cannot bypass them through a subpath import.

### Machine-defined conformance

Every generated project emits `.ghostinit/design-system-contract.json`, validated against the versioned `schemas/design-system-contract.schema.json`. It embeds the selected `ResolvedUiLayout`. `ResolvedUiLayout.contractImport` exports the same typed, versioned `DesignSystemContract`; selected app composition roots import it directly and pages inherit it through primitives/patterns. Renderers, acceptance manifests, architecture checks, import allowlists, and conformance fixtures consume this resolved layout rather than a fixed package path. Acceptance-manifest entries record the contract version and layout identity; CI verifies artifact validity, export/import reachability, layout-specific manifest references, and rejects a cross-mode alias.

The contract declares exact versioned fixtures for semantic tokens, portable utilities, interaction variants, and each selected adapter. Web fixtures compile deterministic expected CSS for Next, TanStack, and Electron. Expo fixtures render through the supported native renderer and assert resolved native style and interaction-state mappings. Every applicable fixture passes. An inapplicable fixture is valid only when its registered adapter entry gives a concrete rationale; it is never silently skipped.

One edit to `--primary` in `theme.css` or a shared rule in `utilities.css` updates every selected application after restart without allowing local drift.

### Evidence and policy gates

`ResolvedUiLayout.componentRegistryImport`, validated by `schemas/component-registry.schema.json`, maps semantic patterns to the approved web/Electron shadcn/Base UI wrappers and native primitives. Frontend changes and reviews use versioned `docs/engineering/frontend-task-records/<task-id>.json` records with the role, changed files, context hashes, applied rules, component IDs, design decisions, and verification evidence. Version 2 records support human review or a named optional skill; no particular coding tool or design skill is required. Historical version 1 records retain their original tool-specific evidence. Registry discovery is recorded when adding or replacing a component, rather than fabricated when reusing one. Every UI behavior or design change must also be recorded in this document.

The AST policy is a schema-validated versioned `policy/maintained-source-globs.json` covering host V2 code, generator templates, generated owned source roots, and maintained tests. It rejects `TSAnyKeyword`, nested/mixed TypeScript assertion chains, `@ts-ignore`, and malformed suppressions. `@ts-expect-error TS####: <reason>` is allowed only in a type-negative test with an adjacent fixture that proves the stated diagnostic. The component-size gate counts nonblank, non-comment physical lines and reads versioned exceptions containing the exact glob, maximum, single responsibility, owner, expiry, and review ID. No unmatched, expired, or broadened exception is accepted.

## Bans Enforced

- No `border-left: 4px` side-stripes
- No `background-clip: text` gradient text
- No glassmorphism
- No hero-metric (big number + label)
- No modal as first thought (use inline sheet or inline form)
