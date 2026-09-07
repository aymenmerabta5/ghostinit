# DESIGN.md — GhostInit Design System

**Inspired by https://t3.codes/ — the open-source control plane for coding agents. Dark-first, terminal-native, high-contrast, developer-trusted.**

## Scene

A solo founder at 2am in a dim room, 14-inch MacBook, external monitor showing a monorepo with 12 packages, terminal at the bottom, browser with the app's dashboard. The light is low, the code is the focus, the design should disappear into the task after the initial impression. This is not a SaaS dashboard for a manager; it's a control plane for a builder.

## Color Strategy: Restrained with One Committed Accent

**Restrained base + Committed accent.** Tinted neutrals carry 90% of the surface; one saturated accent carries selection, primary actions, and code highlights.

**Why restrained?** Product surfaces (dashboard, settings, admin) need to be scannable for hours. A drenched palette would fatigue. The brand surface (marketing landing) can push to Committed/Drenched for the hero, but the product stays restrained.

### OKLCH Tokens (Single Source: `ResolvedUiLayout.stylesRoot/theme.css`)

All values are OKLCH with low chroma at extremes (0.005–0.01) so black/white are tinted toward the brand hue, never pure #000/#fff.

**Dark (default):**

```css
--background: oklch(0.09 0.01 264); /* near-black, blue-tinted, like t3.codes */
--foreground: oklch(0.98 0.005 264); /* paper white, cool tint */
--card: oklch(0.13 0.01 264); /* slightly lifted from background for depth */
--card-foreground: oklch(0.98 0.005 264);
--popover: oklch(0.13 0.01 264);
--popover-foreground: oklch(0.98 0.005 264);
--primary: oklch(0.65 0.22 264); /* vibrant indigo, like t3's harness accent */
--primary-foreground: oklch(0.98 0.005 264);
--secondary: oklch(0.18 0.01 264);
--secondary-foreground: oklch(0.98 0.005 264);
--muted: oklch(0.18 0.01 264);
--muted-foreground: oklch(0.65 0.015 264); /* muted text, still tinted */
--accent: oklch(0.18 0.01 264);
--accent-foreground: oklch(0.98 0.005 264);
--border: oklch(0.22 0.01 264); /* visible but not harsh */
--input: oklch(0.22 0.01 264);
--ring: oklch(0.65 0.22 264);
--radius: 0.5rem; /* tighter than before (0.625 → 0.5) for more technical feel */
```

**Light (alternative):**

```css
--background: oklch(0.99 0.005 264); /* paper white, cool tint */
--foreground: oklch(0.14 0.01 264);
--card: oklch(0.99 0.005 264);
--card-foreground: oklch(0.14 0.01 264);
--primary: oklch(0.55 0.22 264); /* slightly darker for light contrast */
...
--border: oklch(0.92 0.01 264);
```

**Chart & Sidebar:** Desaturate as lightness increases. `chart-1` is primary at 0.65/0.22, `chart-2` at 0.68/0.14, etc. Sidebar uses same tokens as card, slightly darker for dark mode.

**@theme inline** maps `--color-*` to `var(--*)` for Tailwind. **@layer theme** with `@variant light`/`@variant dark` for Uniwind compat (mobile).

### Elevation

- No shadows as default. Borders carry the structure (like t3.codes). Shadows only on popovers/dialogs (`shadow-lg` on `DropdownMenuContent`, `DialogContent`).
- Cards use `border bg-card` with no shadow, `rounded-lg` (0.5rem) not `xl`. Feels more tool-like, less marketing.

## Typography

**Product: One family, system native.** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` for everything except code. No display/body pairing; weight and size do the work.

- **Scale:** 1.2 ratio between steps (tighter than brand's 1.25+). More elements on product screens; exaggerated contrast creates noise.
- **Headings:** `text-2xl font-semibold tracking-tight` for page titles, `text-base font-medium` for card titles. No fluid `clamp()` — fixed rem, users sit at consistent DPI.
- **Body:** `text-sm` (14px) is the default for product UI, not `base`. `text-xs` for metadata. Line length 65ch for prose, denser for tables.
- **Code:** `font-mono text-xs` with `oklch(0.65 0.015 264)` for muted, `primary` for highlights. Use for `turbo.json`, `ghostinit create`, `oRPC` snippets.
- **Brand (marketing hero):** Can use larger `text-4xl md:text-5xl` with `tracking-tight` and `font-semibold`, but still system sans. No serif for this dev tool; serif would be Editorial reflex.

**Line height:** `leading-relaxed` for prose, `leading-none` for headings. Dark mode text gets `+0.05` line-height (light type reads lighter).

## Layout

**Product: Predictable grids, familiar patterns.**

- Top bar `h-14` with `max-w-6xl mx-auto px-6`, not full-bleed. Like t3.codes' header.
- Sidebar (when present) `w-64` with `bg-card border-r`, not floating.
- Cards in `grid-cols-1 md:grid-cols-3` for dashboard, `md:grid-cols-12` for marketing. Use `auto-fit minmax(280px,1fr)` when cards are the right affordance, but prefer lists/tables for dense data.
- **No nested cards.** Ever. Use `Separator` or `border-t`.
- **No identical card grids** with icon+heading+text repeated. Vary: one large `md:col-span-7` + one `md:col-span-5`, or a list with leading icons.

**Brand (marketing):**

- Hero with left-aligned, asymmetric: heading + sub + two CTAs + `Badge` + trust bar. Not centered-stack.
- Code snippet as hero imagery: `ghostinit create demo --billing stripe,chargily` in a `pre` with `bg-card border` and `font-mono`, not a stock photo.
- Social proof as a horizontal scroller (like t3.codes testimonials), not a grid.

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

### Read and mutation states

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

### Authentication and query ownership

Personalized query data belongs to the authenticated user, session, and active
organization/team context. A browser singleton is a cache lifetime choice, not
permission to reuse private data across identities. Identity transitions must
prevent old cached data, late responses, persisted cache restoration, or stale
server-provided initial data from appearing under the new identity. Logout
clears private query state before navigation. Authless projects retain a simple
query-provider path.

### Architecture review changes, 2026-09-07

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
- Full-page authentication, account-recovery, checkout-return, and error cards expose their title as the
  page's H1. `CardTitle` accepts a typed heading level while retaining its shared
  visual styling, so semantic hierarchy does not require duplicated components.
- The two-factor challenge supports authenticator and backup-code entry. Device
  trust is an explicit, unchecked choice with shared-device guidance; switching
  methods clears entered credentials, and pending verification prevents switching.
  Setup verification and native challenges without a trust control never grant
  device trust automatically.
- The settings sidebar shows administration only for the current authenticated
  administrator when the identity API is included, matching the shared header.
- Workspace guidance describes organizations, membership, and role permissions
  in plain language across web, desktop, and mobile instead of exposing internal
  service and tenancy terminology.

This review uses `design-taste-frontend` as requested. The design read is a
preserved product interface for developers, using the existing restrained
shadcn/Base UI and native primitives. The contextual dials are design variance 3,
motion intensity 2, and visual density 5: predictable layout, state feedback,
and ordinary application density. Marketing composition rules do not override
the needs of billing, settings, admin, or native screens.

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

These changes preserve the existing palette, navigation, component vocabulary,
and feature folders. Their purpose is accurate state, recovery, and ownership.

**Button:** `h-9` default (not `h-10`), `rounded-md`, `gap-2`. Variants: `default` (primary), `outline` (border), `ghost` (hover accent), `secondary`. No `destructive` heavy color on idle — only on hover. `asChild` maps to Base UI `render` with `nativeButton={false}` when wrapping `<a>`.

**Input:** `h-9`, `border-input`, `bg-background`, `focus:ring-ring`. No inner shadows.

**Card:** `rounded-lg border bg-card`, `p-6` header, `p-6 pt-0` content. No shadow by default. `CardTitle` `text-base font-medium`, `CardDescription` `text-sm text-muted-foreground`.

**Badge:** `rounded-full` for status, `rounded-md` for tech. `variant=secondary` for muted.

**Dialog/Dropdown:** Portal + Positioner + Popup with `shadow-lg` and `animate-in` (150ms ease-out-quart).

**Empty States:** Teach, don't just say "nothing". `EmptyTitle` + `EmptyDescription` with `max-w-[60ch]` and a primary action.

Localized Next client pages now have a thin server route entrypoint that marks
request-localized metadata as intentional dynamic work. The static single-app
landing page declares the same boundary inside its existing server entrypoint.
Static billing success and cancellation entrypoints declare it too.
Client views stay
beside the route with the same imports and behavior. The shared metadata boundary
renders nothing and adds no visible loading state; existing server pages retain
their own request and Suspense boundaries. This keeps cookie/header-selected
titles and descriptions without caching a request's locale globally.

### Single-project marketing

Single Next.js and TanStack Start landing sections receive explicit resolved
auth, API, database, billing, and Eve options. Authentication links and cards
appear only when authentication is selected; billing links and cards appear only
with billing. Database badges distinguish Postgres/Drizzle from Convex and omit
database claims when no database is selected. Directory badges follow the
selected server and agent capabilities.

The existing semantic colors, type scale, section order, and responsive card
layout are preserved. Without authentication, the primary action goes to the
page's quick-start section. English, French, and Arabic copy describes the
selected foundation without claiming a universal runtime or port count. Quick
start shows the generated project's bootstrap and development scripts, with
service configuration delegated to its README instead of a mismatched scaffold
command. Generation tests check every emitted marketing link against actual
routes and every displayed command against the generated manifest.

## Motion

- **Product:** 150–200ms, ease-out-quart. Hover `transition-colors`, focus `ring-2`, dialog `animate-in fade-in zoom-in 95%`. No page-load choreography.
- **Brand:** Can have one well-orchestrated hero reveal (staggered `animate-in` on heading, sub, CTAs), but not scattered.

## Imagery

**Code is imagery.** No stock photos. Hero is a terminal: `bunx ghostinit create demo --yes --no-install` with syntax highlighting (muted = comment gray, primary = command white, accent = flag). If you must add an image, use a real screenshot of the generated monorepo (like t3.codes' updated-screenshot.webp), not a colored div.

## Theme

Dark is the scene: 2am, dim room, code. Light is a toggle for those who need it, not the hero. The `ThemeToggle` is in the header, not hidden.

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
