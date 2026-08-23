# GhostInit V2 Full Rewrite Design

**Date:** 2026-08-23  
**Status:** Draft specification awaiting final approval  
**Scope:** Complete replacement of the GhostInit implementation and generated-project architecture

## 1. Executive summary

GhostInit V2 will be a deterministic, secure, production-grade project generator for humans and automation. V2 replaces all production implementation and generated-project architecture. Preservation is behavioral only and limited to items marked `retained` in a versioned V1-to-V2 compatibility ledger covering commands, flags/defaults, exit codes, JSON schemas, configuration fields, capabilities, and upgrade behavior.

The rewrite has two equally important products:

1. **The GhostInit CLI**, whose own code must be layered, understandable, testable, safe, and easy to extend.
2. **The generated project**, whose frontend, transport, application, domain, infrastructure, and vendor integrations must form one working system rather than a collection of loosely connected templates.

The generator will support the finite combinations in its versioned V2 support catalog. The catalog covers packaging mode, individually configured app targets, backend/database choice, execution runtime, capabilities, providers, and deploy bindings. Unsupported combinations will be rejected before any write with a precise explanation. Supported combinations will not silently degrade, emit fake implementations, or leave dead pages and routes.

## 2. Why a rewrite is required

The existing host suite can pass while real outputs fail to install, typecheck, build, start, or execute feature flows. The audit found systemic causes rather than isolated defects:

- configuration is represented by overlapping addon keys instead of one normalized model;
- generated variants are assembled with substring filtering and path remapping;
- single and monorepo modes maintain divergent implementations;
- Next.js fragments leak into TanStack projects and monorepo imports leak into single projects;
- frontend pages are not always connected to working transport and backend behavior;
- authentication, billing, messaging, and Convex integrations have correctness and authorization gaps;
- the architecture checker skips source roots, resolves imports incompletely, and can fail open;
- filesystem mutation, locks, subprocesses, dry-run, and secret handling are not consistently safe;
- CI does not exercise the actual default branch or the complete generated-project gate;
- dependency checks prove that versions exist but not that their peer/API graph is compatible;
- TypeScript 7.0.2 does not preserve legacy JavaScript Compiler API and tsconfig/CLI-option parity used by V1. Foundation inventories every direct and transitive reliance, assigns a supported replacement, and proves it before cutover.

Incremental patching would retain these failure modes. V2 therefore replaces the generator core and migrates capabilities onto a canonical architecture before removing legacy code.

## 3. Non-negotiable outcomes

### 3.1 Toolchain

- Host and generated Bun projects pin **Bun 1.4.0** exactly.
- Host and generated TypeScript projects pin the `typescript` package and `tsc` binary at **TypeScript 7.0.2** exactly.
- These exact versions are user requirements rather than candidates. Any advertised target that cannot pass this exact pair blocks V2 release; peers are never overridden and the toolchain is never silently downgraded.
- Every release evaluates the newest published stable candidate for every other third-party dependency and records why it was selected or rejected against the release-wide compatibility graph.
- No prerelease, canary, fabricated, or known-incompatible version is selected merely to claim recency.
- Direct external dependencies are exact-pinned; internal dependencies use `workspace:*`; peer dependencies use the narrowest verified compatible range; lockfiles freeze transitives.
- Peer ranges, package exports, runtime APIs, official migration notes, and platform binaries are validated.
- Bun lockfiles are regenerated and verified frozen by Bun 1.4.0.
- Runtime, package manager, and framework route runtime are separate concepts. Bun 1.4.0 is the package-manager/CLI baseline. `runtime:node` is not advertised until one exact Node LTS patch is recorded and passes the complete supported matrix.

### 3.2 Product behavior

- Every target and capability owns a versioned acceptance manifest listing each route/screen, emission predicate, access policy, query/mutation, applicable state, navigation edge, runtime operation, and test ID.
- Data-backed pages cover loading, seeded success, empty, recoverable error, and unexpected-error states. Protected pages cover unauthenticated and every unauthorized role/tenant path. Visible mutations cover validation, authorized success, failure/retry, and an independently observed persisted result. Static/read-only pages mark inapplicable states with rationale.
- Every enabled frontend feature is connected through typed contracts to a real application use case and adapter.
- Every enabled integration fails clearly when configuration is absent; it never fabricates success.
- Every navigation target, import, package export, workspace dependency, environment variable, and generated script resolves.
- Dry-run performs no mutation, cleanup, secret generation, lock theft, install, or external side effect.
- JSON mode writes one stable machine-readable envelope to stdout; progress and diagnostics go to stderr.

### 3.3 Maintainability

- Files have one responsibility and clear public interfaces.
- Dependency direction is mechanically enforced in both the CLI and generated projects.
- Framework-specific code lives behind target adapters instead of conditionals spread across shared templates.
- Single and monorepo output share the same logical modules and capability implementations.
- Generated code favors explicit, readable source over generator cleverness.
- Documentation explains not only what files exist, but why boundaries exist and how requests flow through them.

## 4. Program decomposition

The rewrite is one product program delivered through bounded workstreams. Each workstream must leave the repository testable and has its own implementation plan and review gate.

1. **Foundation and toolchain:** Bun 1.4.0, TypeScript 7.0.2, package/version policy, build, packed CLI, CI foundation.
2. **Host domain and application core:** configuration schema, capability graph, command use cases, ports, errors, JSON protocol.
3. **Safety infrastructure:** filesystem transaction, lock lease, subprocess runner, Git checks, secret-safe logging.
4. **Generation engine:** plan model, renderers, manifests, dependency/import/export validation, single/monorepo layout.
5. **Architecture enforcement:** resolver, import graph, rules, generated checker installation, fail-closed CI.
6. **Platform targets and frontend system:** Next.js, TanStack Start, Expo, Electron, shared UI, page flows.
7. **Backend capabilities:** database, auth, transport, billing, messaging, email, storage, cache, analytics, i18n, PDF, Eve.
8. **Verification, documentation, release, and legacy cutover.**

Implementation may proceed in parallel only where file ownership and interfaces are disjoint. A workstream cannot cut over until its contract and integration tests pass.

## 5. GhostInit host architecture

### 5.1 Dependency direction

The host follows ports-and-adapters with a strict directed graph:

```text
CLI / JSON / prompts
        |
        v
Application use cases
        |
        v
Domain model and policies
        ^
        |
Infrastructure adapters

Composition root -> all concrete implementations
```

- **Domain** imports only the standard library-free types it owns.
- **Application** depends on domain types and port interfaces.
- **Adapters** implement ports and may depend on Bun/Node, OXC, Git, the filesystem, registries, or prompt libraries.
- **CLI** translates input/output and invokes application use cases; it contains no generation or filesystem policy.
- **Composition root** is the only location that constructs concrete dependencies.

### 5.2 Final source layout

```text
src/
  domain/
    project/                 # canonical project configuration and invariants
    capabilities/            # capability IDs, compatibility graph, feature contracts
    generation/              # immutable file/operation plan types
    architecture/            # layer model and rule contracts
    errors/                  # typed domain errors and exit semantics
  application/
    commands/                # create, init, add, sync, check, doctor, status, upgrade
    ports/                   # filesystem, process, registry, prompt, clock, entropy, git
    services/                # orchestration shared by command use cases
  adapters/
    cli/                     # argument parser, help, human renderer, JSON renderer
    filesystem/              # secure transaction and state store
    process/                 # bounded subprocess runner and package managers
    registry/                # npm/version/peer metadata
    prompts/                 # interactive wizard
    git/                     # repository state adapter
    architecture/            # OXC parser and module resolver
  generation/
    common/                  # target-neutral files and primitives
    targets/                 # next, tanstack, expo, electron, eve
    capabilities/            # auth, billing, messaging, email, storage, etc.
    modes/                   # packaging only: monorepo and single
  composition/
    cli.ts                   # production dependency graph
  cli.ts                     # minimal executable entry
```

`generation/` is a first-party infrastructure adapter. It may import the application-owned `ProjectRendererPort`, required domain configuration/plan types, and renderer-local utilities; it may not import application use cases/services or concrete adapters. Application code never imports a concrete renderer. No module may bypass these boundaries through relative paths, aliases, dynamic imports, or package subpaths.

## 6. Canonical configuration and capability graph

### 6.1 Human-editable desired state

Every project contains `ghostinit.config.json`, validated by a published JSON Schema. It is the desired-state source of truth for `sync`, `status`, and `upgrade`.

```json
{
  "$schema": "./node_modules/ghostinit/schemas/project-config.schema.json",
  "schemaVersion": 2,
  "name": "example",
  "mode": "monorepo",
  "packageManager": { "name": "bun", "version": "1.4.0" },
  "apps": [
    { "id": "web", "target": "nextjs", "deploy": "vercel" },
    { "id": "mobile", "target": "expo", "deploy": "none" }
  ],
  "backend": {
    "hostApp": "web",
    "executionRuntime": "bun",
    "database": "postgres"
  },
  "capabilities": {
    "auth": {
      "adapter": "better-auth",
      "methods": { "emailPassword": true, "passkey": false },
      "plugins": { "twoFactor": true, "admin": true, "organization": false },
      "oauthProviders": []
    },
    "billing": ["stripe"],
    "messaging": false,
    "email": true,
    "storage": false,
    "cache": "none",
    "analytics": false,
    "i18n": false,
    "pdf": false,
    "eve": false
  }
}
```

Each choice has one namespaced value. Database, cache, and deploy `none` values are distinct and can never overwrite each other. Apps are configured individually because web, Expo, and Electron do not share framework, runtime, or deployment semantics. `mode:single` supports exactly one primary app; multiple apps require monorepo mode. A mobile/desktop app that selects server-backed capabilities must reference a compatible server host app.

`backend:false` is the explicit frontend-only selection. `backend.database:none` means a server exists without persistence and rejects only capabilities declaring `requiresPersistence`. Authentication is `false` or a discriminated configuration that enumerates adapter, methods, plugins, and OAuth providers; enablement never depends on whether credentials happen to be present.

### 6.2 Internal state

`.ghostinit/state.json` contains only machine-owned information:

- state schema version;
- generator/package version;
- normalized configuration hash;
- generated file manifest with content hashes and ownership;
- optional recoverable pending-operation record;
- last successful operation ID;
- migration history.

It contains no credentials, raw environment values, arbitrary external paths, or executable configuration.

### 6.3 Capability validation

The domain owns a typed capability graph. Rules are evaluated after defaults and interactive answers are fully resolved. Examples:

- billing requires authentication and a persistent database;
- messaging requires authentication, transport, and either PostgreSQL realtime/storage or Convex realtime;
- backend database `none` rejects capabilities that declare `requiresPersistence`; frontend-only is a separate backend choice that rejects every server-required capability;
- a platform app is emitted only when its target/execution-runtime adapter exists;
- a deploy target is accepted only when it supports the selected app, packaging mode, and execution runtime;
- every target/capability owns a versioned acceptance manifest declaring required routes/screens, navigation/deep-link entries, queries/mutations, API/realtime endpoints, webhooks/jobs/schedules, supported bindings, applicable state scenarios, test IDs, packages, environment keys, migrations, and documentation fragments;
- preflight/release fail unless enabled manifest entries trace to emitted artifacts, navigation, documentation, and passing tests, while disabled entries are absent.

Validation returns all conflicts with corrective suggestions rather than stopping at the first failure.

## 7. CLI experience for humans and agents

### 7.1 Stable commands

V2 exposes the following command set. V1 compatibility is guaranteed only where the compatibility ledger marks behavior retained:

- `ghostinit create <name>`
- `ghostinit init [name]`
- `ghostinit add <kind> ...`
- `ghostinit sync [--check]`
- `ghostinit check [--fix]`
- `ghostinit doctor [--fix]`
- `ghostinit status [--verbose]`
- `ghostinit upgrade`
- `ghostinit capabilities [--json]`

One typed command registry defines every command form (including every valid `add` kind), positional argument, option, default, conflict, applicability rule, exit code, and JSON result. It generates the parser, help, schemas, documentation, and exhaustive tests. Unknown, ignored, conflicting, or command-inapplicable flags fail with a suggestion.

`--json` and `--ci` never prompt. Missing noninteractive input fails before side effects. Packed-CLI tests exercise every command in TTY and non-TTY success, failure, cancellation, and dry-run modes.

### 7.2 Interactive use

The wizard uses progressive disclosure:

1. asks the project goal/preset;
2. asks only relevant target and capability questions;
3. explains incompatible choices where they occur;
4. shows the normalized plan, apps, packages, commands, and required credentials;
5. requests confirmation before mutation.

Answers are resolved through the same domain API as noninteractive flags, so interactive and automated output cannot drift.

### 7.3 Agent use

- `ghostinit capabilities --json` returns supported values, compatibility rules, defaults, deprecations, and schema versions.
- `create --dry-run --json` returns normalized configuration, planned files, planned commands, warnings, and required environment keys.
- JSON envelopes have a versioned discriminated shape and stable exit codes.
- Every error includes a machine code, concise message, safe structured details, and remediation hints.
- The package ships its configuration and JSON-output schemas.

## 8. Generation pipeline

Every mutating command follows the same pipeline:

1. Parse input without side effects.
2. Load and validate existing desired/internal state.
3. Resolve an immutable `ResolvedProjectConfig`.
4. Build a typed capability graph.
5. Render an in-memory `GenerationPlan`.
6. Preflight the entire plan:
   - unique and contained paths;
   - parseable TypeScript/JavaScript/JSON/TOML/YAML;
   - resolvable relative, alias, package, and export imports;
   - declared direct dependencies and existing workspace targets;
   - valid tsconfigs and package manifests;
   - environment manifest consistency;
   - architecture rule compliance.
7. Acquire the project lock and persist a recoverable pending-operation journal without changing the last-success marker.
8. Materialize the candidate owned tree and lockfile under transactional control.
9. Install with a sanitized environment and no generated secrets present.
10. Run the required post-generation checks against the candidate.
11. Materialize self-issued local secrets using restrictive permissions.
12. Atomically finalize owned files, generated lockfile, desired/internal state, and `lastSuccessfulOperationId`.

For a new project, rendering, installation, and verification occur in a private sibling project root before the completed directory is published. For an existing project, failure restores the prior owned snapshot and lockfile or leaves an explicit recoverable pending operation; it never records success. Package-manager state that cannot be restored automatically is reported precisely and repaired before another mutation proceeds.

Dry-run stops after preflight and returns the plan. It creates no directory, lock, staging path, state, secret, subprocess, or cleanup action.

Renderers add files conditionally from the resolved graph. They do not generate everything and delete paths afterward.

## 9. Generated-project architecture

### 9.1 Logical dependency graph

```text
UI -> typed transport client/contracts
Transport server -> Application
Application -> Domain model + application-owned outbound ports
Infrastructure adapters -> Application ports + domain types + external vendors
Bootstrap/composition root -> Application + concrete adapters
```

Rules:

- Domain never imports frameworks, databases, auth SDKs, billing SDKs, environment modules, or transport types.
- Application never imports concrete adapters.
- UI never imports databases, server auth, provider SDKs, secrets, or bootstrap internals.
- Transport validates input, creates request context, authorizes, and invokes application use cases.
- Application modules own outbound ports. Concrete infrastructure imports the ports/types it implements and owns vendor mapping.
- Bootstrap alone selects and wires concrete adapter instances; UI, transport, application, and domain never import concrete adapters.
- Public package entry points are explicit; `export *` is not emitted.

### 9.2 Monorepo layout

```text
apps/
  web/
  mobile/                    # when selected
  desktop/                   # when selected
  agent/                     # when Eve is selected
packages/
  kernel/                    # result, IDs, clocks, shared value types
  modules/
    identity/
      src/domain/
      src/application/
    billing/                 # when selected
    messaging/               # when selected
  contracts/                 # transport schemas and client-safe DTOs
  api/                       # oRPC routers and transport adapters
  adapters/
    database-postgres/
    database-convex/
    auth-better-auth/
    billing-stripe/          # selected providers only
    email-resend/
    storage-s3/
  platform/
    config/
    observability/
  ui/                        # design tokens and primitives
  bootstrap/                 # server composition root
tooling/
  architecture/
  typescript/
  lint/
```

Workspace globs explicitly include nested module/adapter packages. Package names remain ergonomic (`@repo/database`, `@repo/auth`, and similar) through narrow facade packages or export maps without hiding dependency ownership.

### 9.3 Single-project layout

Single mode mirrors the same responsibilities without workspaces:

```text
src/
  kernel/
  modules/<feature>/domain/
  modules/<feature>/application/
  contracts/
  transport/
  adapters/
  platform/
  bootstrap/
  components/
  features/
  app/ or routes/            # framework entry points
```

Shared capability renderers target a logical path model; a packaging adapter maps that model to monorepo packages or single directories. Business logic is not duplicated between modes.

## 10. Frontend architecture and component system

### 10.1 Component taxonomy

```text
components/
  ui/                        # accessible primitives, no product knowledge
  patterns/                  # form, data table, shell, empty state, dialogs
features/<feature>/
  components/                # feature presentation
  hooks/                     # client orchestration only
  schemas/                   # client-safe validation contracts
  server/                    # framework boundary functions
app/ or routes/              # thin route composition
```

- Primitives expose small, accessible APIs and design tokens.
- Patterns use compound components when consumers need structural flexibility.
- Feature components compose primitives/patterns and depend on typed feature contracts.
- Routes choose data, authorization, metadata, and layout; they do not contain reusable component implementations.
- Providers expose typed `{ state, actions, meta }` interfaces and hide their state implementation.
- Explicit component variants replace proliferating boolean mode props.
- Children are preferred for structural composition; render props are used only when a parent supplies render-time data.
- For targets whose verified peer graph uses React 19+, new components accept `ref` as a prop and do not add `forwardRef` wrappers unless an upstream API requires one.

### 10.2 Required page states

Every route/screen is an entry in its owner acceptance manifest and declares its applicable state class. Data-bearing entries test loading/skeleton, seeded real-data success, empty with an actionable next step, recoverable error, and unexpected error. Protected entries test unauthenticated and every unauthorized role/tenant path. Mutating entries test validation, authorized success, failure/retry, and an independently observed persisted result. Static/read-only entries may mark inapplicable states with rationale. Non-UI routes use endpoint-specific contract scenarios. Every UI entry tests responsive and accessibility behavior.

### 10.3 React performance rules

Generated React code follows enforceable rules drawn from the React/Vercel skills and official React documentation:

- independent async operations start together and use parallel awaits;
- independent fetches start eagerly; strategic Suspense boundaries stream regions that can resolve independently without delaying the shell, with fallbacks designed to avoid disruptive layout shift;
- Server/Client boundaries transfer only required serializable fields;
- side effects caused by a specific user interaction run in its event handler or Action; Effects synchronize React with external systems rather than derive state or replay user events;
- derived values are calculated during render rather than synchronized through effects;
- eligible nonurgent state updates use transitions when profiling or UX evidence shows they block urgent interaction; controlled-input updates are not placed in transitions;
- heavy or feature-optional modules are loaded conditionally/dynamically;
- avoid broad third-party barrels unless the framework's verified import optimizer handles them;
- static JSX and stable defaults are hoisted where valuable;
- memoization is added only for measured expensive work, not simple expressions.

### 10.4 Accessibility and design quality

- Semantic HTML and native controls are the default.
- All inputs have visible labels and associated descriptions/errors.
- Dialogs, menus, tabs, selects, and popovers use the chosen accessible primitive library correctly.
- Color contrast, focus order, reduced motion, touch targets, zoom, and screen-reader output are tested.
- The target is WCAG 2.2 AA. Automated checks permit no serious/critical accessibility violations; manual keyboard, focus, 200% zoom, and representative screen-reader checks are recorded for every page pattern.
- Web flows are exercised at 320, 768, and 1440 CSS-pixel widths. In a controlled CI profile, public/default routes target LCP <= 2.5 s, CLS <= 0.1, and INP <= 200 ms; initial compressed client JavaScript targets <= 200 KiB for public pages and <= 300 KiB for authenticated application shells. A justified exception is versioned and ratcheted downward rather than silently ignored.
- Shared OKLCH tokens drive web, mobile, and desktop themes.
- Product screens favor readable hierarchy, lists/tables for dense data, and explicit actions over decorative card repetition.

## 11. Framework target rules

### 11.1 Next.js

The Next adapter is based on official upstream documentation matching the exact pinned stable Next.js release. Context7 is used for discovery, then normative claims are checked against the versioned upstream source and installed package exports/types.

- App Router components are Server Components by default.
- App Router files remain Server Components unless interactivity or browser APIs require a Client boundary. Client component functions are never async; client boundaries stay narrow while Server Components may be interleaved through children.
- Values crossing the boundary are client-safe, React-serializable DTOs limited to fields the client consumes.
- `params`, `searchParams`, `cookies()`, and `headers()` use current async APIs.
- Internal reads occur in Server Components/application services without avoidable HTTP round trips.
- UI mutations use Server Actions when appropriate, with the access policy declared per action.
- External/mobile APIs and webhooks use Route Handlers.
- Every Server Action treats arguments as untrusted, validates input, and enforces its declared public/authenticated/authorized policy inside the action rather than relying only on proxy, layout, or UI guards.
- When request interception is required on Next 16+, emit `proxy.ts`, export the named `proxy` function, and use the release-supported `export const config = { matcher: ... }` form. Emit neither `proxy.ts` nor `middleware.ts` when interception is unnecessary.
- `redirect`, `permanentRedirect`, `notFound`, `unauthorized`, and `forbidden` remain outside broad catches, or caught values pass through the release-supported rethrow helper before application-error mapping.
- Static metadata is used when fixed; `generateMetadata` is used only in Server Components when route data requires it. Output includes real icon assets and only canonical, indexable sitemap URLs.
- `next/image` is used for optimizable content images with dimensions or `fill` plus `sizes` and configured remote patterns. `next/font` is used when custom fonts are selected. Heavy noncritical/optional client code is loaded dynamically, and all configuration is verified under the pinned Turbopack release.
- Next route runtime defaults to `nodejs`; this target setting is distinct from application execution runtime and package manager. Edge is emitted only for a proven compatible requirement.
- Bun 1.4.0 as package manager and Bun 1.4.0 as a Next server execution runtime are separate capabilities. Next-on-Bun is advertised only after development, build, production-start, Server Action, Route Handler, image, and deployment fixtures pass.
- Docker uses standalone output, copies `public/` and `.next/static/`, runs non-root, and exposes a health check. Multi-replica deployments using ISR/revalidation configure and test a shared cache handler.
- The Next target is enabled only when the exact pinned stable Next.js/React/React DOM/types graph supports TypeScript 7.0.2 and a clean fixture passes the documented `next build`, type-generation, and standalone `typescript@7.0.2` `tsc` commands. If no stable release passes, V2 release is blocked; framework type checking is not bypassed and package internals are not patched.

### 11.2 TanStack Start

- Uses native TanStack file routes, loaders, server functions, route context, and error boundaries.
- Vite alias resolution is configured with a supported plugin or explicit aliases.
- Client environment comes from `import.meta.env`; server environment remains server-only.
- Route directories contain routes only; helpers/hooks live outside route discovery.
- Metadata, manifest, robots, and sitemap use actual TanStack/Vinxi/Nitro mechanisms rather than Next conventions.
- Runtime preset and start command agree for Bun and Node.
- No `next`, Next route signature, or Next metadata import appears in output.

### 11.3 Expo/mobile

- Shares contracts, domain DTOs, and design tokens, not DOM components.
- Uses platform-safe primitives, secure credential storage, deep-link validation, and network-aware clients.
- Every selected native dependency satisfies the chosen Expo SDK peer graph.
- `expo export` and platform configuration validation are release gates.

### 11.4 Electron/desktop

- Renderer uses the shared client contracts and tokens.
- Main/preload/renderer boundaries are explicit with context isolation and a narrow typed bridge.
- Tokens/sessions are never written in plaintext when secure storage is unavailable; the app fails closed or keeps them in memory.
- Vite/Electron package peers are compatible, packaging is tested, and no server secret enters the renderer bundle.

## 12. Frontend-to-backend data flow

### 12.1 Contract-first transport

oRPC contracts are defined from client-safe schemas and implemented by transport adapters. Remote clients use this flow:

```text
Page / client hook
  -> generated typed client
  -> framework transport adapter
  -> declared public/authenticated/authorized request policy
  -> request actor with an optional principal
  -> application use case
  -> domain ports
  -> selected infrastructure adapter
  -> mapped client-safe result
```

Server Components, loaders, Server Actions, and server functions use target server-entry adapters to invoke application use cases in-process rather than making internal HTTP round trips. The route mount prefix, client base URL, OpenAPI path, websocket endpoint, and framework handler signature come from one transport target definition. Real client-to-handler round trips are tested; string assertions are insufficient.

### 12.2 Session facade

PostgreSQL Better Auth and Convex Better Auth expose one application-facing actor/session interface. Pages, actions, routes, and use cases depend on that interface, not vendor-specific `auth.api` shapes. UI receives only client-safe session DTOs.

### 12.3 Errors

- Domain/application errors are typed and stable.
- Transport maps them to appropriate HTTP/oRPC codes without leaking causes or secrets.
- UI maps known errors to actionable messages and unknown errors to boundaries with recovery.
- Logs retain correlation IDs and safe metadata.

## 13. Capability designs

### 13.1 Database

- PostgreSQL schema and migrations match exact library/plugin versions.
- Convex uses explicit component-to-application identity mapping and internal functions for privileged writes.
- backend database `none` removes persistence adapters and every artifact owned by a capability that declares `requiresPersistence`.
- Node scripts invoke installed package executables correctly; Bun scripts use Bun-native invocation.

### 13.2 Authentication

- Better Auth schema is generated/verified against the exact pinned release and enabled plugins.
- Server and client plugin sets match.
- Email/password, verification, reset, passkey, 2FA, admin, organization, and OAuth features exist only when fully configured.
- Cookies, trusted origins, CSRF, rate limiting, session storage, proxy/IP handling, token encryption, and audit logging follow the Better Auth security skills and official docs.
- Distributed production rate limits use a persistent/shared store.

### 13.3 Billing

- Clients submit a server-owned plan slug, never arbitrary provider price/customer/subscription identifiers.
- Provider adapters map the plan catalog to exact provider IDs.
- Local IDs and external provider IDs have distinct types and columns.
- Portal, license, usage, and subscription operations resolve ownership from the session.
- Webhook bodies are size-bounded, raw, signature-verified, and fail closed.
- Event claims are atomic and keyed by `(provider, deliveryId)`.
- Processing failures return retryable failures and never mark an event processed.
- One provider-neutral lifecycle reducer handles ordering, cancellation, delinquency, refunds, currency minor units, and entitlements.
- Missing SDKs/credentials never return fake checkouts, subscriptions, portals, usage success, or license keys.

### 13.4 Messaging and storage

- Every message, typing, attachment, and websocket operation verifies conversation participation.
- Attachment lookup starts from an opaque database ID and authorizes before resolving a storage key.
- Storage rejects absolute paths, traversal, encoded traversal, reparse/symlink escapes, and cross-tenant reads.
- PostgreSQL messaging starts a real compatible websocket server or uses a proven framework adapter; Convex uses native realtime.
- Start/deploy scripts actually launch the selected realtime path.

### 13.5 Other capabilities

- **Email:** explicit package exports, verified templates, retry/error behavior, no secret/client leakage.
- **Analytics:** consent-aware, deferred client loading, server-safe calls, centralized URL/referrer secret sanitization.
- **Cache:** one port with selected implementation; no emitted cache code when disabled.
- **i18n:** framework-native routing/provider wiring; locale-aware links and RTL checks; every locale route builds.
- **PDF:** server/client boundaries and fonts/assets verified; generated artifacts tested visually where relevant.
- **Eve:** generated agents, routes, schedules, tools, and UI use the current Eve skill/docs and work in both web frameworks.

## 14. Environment and secrets

One typed environment manifest drives:

- `.env.example` placeholders;
- local environment files;
- framework server/client schemas;
- Turbo cache keys;
- deploy manifests;
- doctor checks;
- documentation.

Server secrets never appear in client schemas or bundles. Framework public prefixes are target-specific. Third-party credentials remain explicit placeholders. Only self-issued development secrets are generated, and only after dependency installation. Secret files and transaction staging use owner-only permissions where supported and are ignored by Git before content is written.

Maintenance bypasses use a derived/opaque cookie, redirect immediately to a scrubbed URL, and are removed from analytics/referrer data.

## 15. Filesystem, lock, process, and Git safety

### 15.1 Transaction

- private random per-operation staging directory;
- exclusive file creation and restrictive modes;
- canonical-root and ancestor reparse/symlink checks;
- persistent fsynced journal and recoverable backups;
- optimistic destination hash/identity validation;
- metadata preservation;
- aggregate rollback errors that are never swallowed;
- recovery produces either the complete old snapshot or complete new snapshot.

### 15.2 Lock

- cryptographic owner nonce and operation ID;
- heartbeat/lease plus local PID liveness where meaningful;
- atomic acquisition/takeover;
- malformed fresh locks block rather than fail open;
- release deletes only the matching nonce;
- every mutating or fixing command uses the same project lock.

### 15.3 Subprocesses

- `shell:false` with explicit executable/arguments;
- sanitized environment and bounded output;
- timeout with confirmed process-tree termination;
- error/exit/signal handling on every path;
- no project-local executable runs during read-only diagnostics unless explicitly requested;
- package lifecycle scripts cannot observe generated secrets.

### 15.4 Git

Dirty-state checks fail closed on operational errors. Only a confirmed non-repository is treated as such. Large output is streamed or short-circuited rather than buffered into a false clean result.

## 16. Architecture checker V2

The checker uses pinned OXC APIs and does not depend on the legacy TypeScript JavaScript Compiler API. Compatibility with TypeScript 7.0.2 is proven through fixtures covering accepted syntax, module-resolution modes, tsconfig options, and parser/compiler disagreement; any mismatch blocks release.

It must:

- collect all configured source roots, including Expo `app`, Eve agents, Convex, desktop, tests, and single mode;
- parse TS/TSX/JS/JSX/MTS/CTS/MJS/CJS and treat parser diagnostics as blocking;
- retain directives, import kind, source locations, imports, re-exports, import-equals, literal `require`, and literal `import()`;
- resolve relative files/indexes/extensions, tsconfig aliases, workspace packages, exports, and builtins;
- traverse every reachable owned edge to a fixed point with cycle detection; nonliteral targets require a finite resolved allowlist, and unresolved edges or resource-limit exhaustion are blocking;
- scope framework entry exceptions to exact target roots;
- distinguish runtime, development, peer, and optional dependency edges;
- enforce an explicit allowed-edge matrix rather than a numeric shortcut;
- validate webhook raw-body boundaries, client/server isolation, domain purity, vendor isolation, workspace declarations, package cycles, and cross-module public APIs;
- emit stable human and JSON findings with nonzero exit for blocking severities.

Generated projects depend on the exact matching GhostInit checker version. Local/release tests replace that dependency with the packed local tarball, so the same packaged binary is tested before publication. Generated CI never uses an unpinned network fallback or `|| true`.

## 17. Dependency and documentation research policy

Before implementing or upgrading an adapter:

1. Query the npm registry for the latest stable release, peer ranges, engines, and supported platforms.
2. Use Context7 to discover official documentation for current APIs and migrations, then record the exact upstream version/commit used as normative evidence.
3. Inspect the installed package exports/types when documentation and types differ.
4. Create a focused compatibility spike using Bun 1.4.0 and TypeScript 7.0.2.
5. Freeze timestamped evidence for the selected version and rejection evidence for newer candidates.
6. Pin direct external dependencies exactly in the registry, preserve verified peer ranges, and regenerate the lockfile.
7. Add API/peer/installation tests so later upgrades fail visibly.

Registry 404, rate limit exhaustion, network failure after bounded retry, invalid JSON, peer conflicts, or unverified platform binaries fail the release gate.

## 18. Testing strategy and definition of working

### 18.1 Test layers

1. **Domain/unit tests:** configuration, compatibility, planning, reducers, mappings, typed errors.
2. **Property tests:** path containment, names, config round trips, deterministic plans, idempotency.
3. **Security regression tests:** traversal, symlinks, locks, redaction, authorization, webhook signatures, ownership, oversized bodies.
4. **Structural matrix:** enumerate every finite support-catalog tuple and assert parse/import/dependency/export/env/architecture/acceptance-manifest invariants.
5. **Generated build matrix:** clean frozen install, exact package-manager/compiler/application-runtime assertion, root solution check, typecheck, lint, format check, test, build, architecture check.
6. **Runtime integration:** start the built project, health check, typed oRPC round trip, auth session, protected page, database mutation, websocket/realtime where enabled.
7. **Browser/page tests:** Playwright runs against the production build with seeded selected persistence and no interception/mocks between UI, transport, application use case, and first-party adapter. It visits every emitted manifest page and verifies applicable states, navigation, responsive behavior, accessibility, console/network cleanliness, and mutations through an independent read.
8. **Platform screen tests:** launch supported Android/iOS Expo builds and packaged Electron artifacts, traverse every declared screen/navigation/deep link, and exercise applicable authentication, data, mutation, offline, and failure states. Export/package success alone is not acceptance.
9. **Capability-operation tests:** execute every declared query, mutation, webhook, job, schedule, realtime channel, and provider operation with success, invalid-input, missing-configuration, authorization/ownership, dependency-failure, retry/idempotency, and observable-side-effect scenarios.
10. **Provider contract and sandbox tests:** official-SDK-shaped contract doubles are allowed only at third-party network boundaries. Each advertised external adapter also passes its credentialed sandbox smoke and failure/retry scenarios; if no current conformance path exists, it is not advertised.
11. **Live infrastructure tests:** ephemeral PostgreSQL migrations/auth/use cases, Convex codegen/component integration, and deploy-image smoke.
12. **Packed CLI tests:** install the exact `.tgz` into clean Windows, Linux, and macOS environments and exercise every command in TTY/non-TTY modes plus representative generation and application-runtime flows.
13. **Audit reproductions:** execute a versioned manifest containing every audit finding ID, setup, exploit action, expected safe result, and test path against the packed V2 artifact.

### 18.2 Matrix economics without blind spots

- The versioned support catalog defines finite discrete axes and commits tuple counts plus a coverage map. Free-form names/paths are property-tested separately.
- Cheap structural invariants run for every valid resolved configuration.
- PR builds cover every target adapter and capability edge at least once.
- Release runtime/screen/operation tests execute every acceptance-manifest scenario for each materially distinct behavior plan across app, target, mode, execution runtime, database adapter, capability/provider selection, and deploy binding. Deduplication is permitted only when generated files, dependencies, environment contract, routes/screens, bootstrap bindings, and scenarios are proven identical.
- A generated coverage map links evidence to every supported binding; any uncovered binding fails release.

A feature is not complete when its source merely parses. It is complete only when its generated package installs, compiles, builds, starts where applicable, and passes its user-flow tests.

## 19. CI, release, and publication

- CI targets the actual default branch and pull requests.
- Core jobs run on Linux, Windows, and macOS with Bun 1.4.0, TypeScript 7.0.2, and every exact advertised execution-runtime baseline.
- Committed roots use frozen installs and must leave Git clean.
- Generated projects are checked before any formatting write.
- Architecture failures are never swallowed.
- Release verifies version synchronization, changelog, dependency registry, host checks, fixtures, generated matrix, packed consumer, declarations, and package contents.
- One immutable tarball is produced, tested, signed/provenanced, and published through a minimal-permission OIDC workflow.
- Only the SHA-256-identical tarball produced and attested by that workflow may be published. `prepublishOnly` rejects source-tree publication; manual recovery may publish only the attested artifact.

## 20. Documentation deliverables

Documentation is generated/reviewed alongside code and includes:

- concise README quick start and supported-toolchain statement;
- command and flag reference with JSON examples;
- `ghostinit.config.json` schema/reference;
- supported configuration and deploy matrix;
- host architecture and generated architecture guides;
- request/data-flow diagrams and boundary rationale;
- React/Next/TanStack component and routing conventions;
- auth, database, billing-provider, messaging, email, storage, cache, i18n, PDF, analytics, and Eve guides;
- Expo/mobile and Electron/desktop setup, debugging, build, signing, and deployment guides;
- package-manager, CLI runtime, application execution runtime, and framework route-runtime distinctions;
- JSON envelope/exit-code protocol and noninteractive/CI behavior;
- generated-file ownership, managed-file conflicts, V1 migration, and recovery procedures;
- concrete Vercel, Docker, and Fly build/start/health/rollback operations;
- environment-variable reference derived from the manifest;
- adding a framework, app, capability, provider, page, component, or module;
- security model and threat-boundary guide;
- testing, CI, release, upgrade, migration, troubleshooting, and recovery guides;
- synchronized AGENTS/skills references for human and agent contributors.

Examples are executable and version-checked. Documentation CI runs examples against the packed tarball, validates JSON schemas and links, regenerates command/support-matrix/environment references, and requires a clean diff. Documentation cannot claim a command, rule, page, or capability that the generated artifacts and tests do not prove.

## 21. Required skill and documentation gates

Implementation plans explicitly assign the relevant guidance before a workstream begins:

- Next.js target: `next-best-practices` plus official version-matched Next documentation discovered through Context7.
- React pages/components/performance: `vercel-react-best-practices`.
- Component APIs: `vercel-composition-patterns`.
- Visual/UX implementation: `frontend-design` and `impeccable`.
- shadcn/Base UI primitives: `shadcn` and the appropriate migration guidance if required.
- Better Auth: core, security, email/password, organization, and 2FA skills as selected.
- Eve: `eve`.
- PDF: PDF skill and render verification.
- Browser flows: Playwright skill.
- Every feature/bug: test-driven development, systematic debugging for failures, and verification-before-completion.

Skill instructions and official docs are read by the implementing agent for the specific workstream; summaries from another agent are not substituted for the source instructions. Context7 is discovery, not the sole normative source. Every adopted React/Next/framework rule records the exact upstream source version and maps to lint, AST, build, browser, accessibility, performance, or required-review evidence.

## 22. Rewrite and cutover strategy

1. Freeze a versioned V2 support catalog and a V1-to-V2 compatibility ledger before capability migration begins. Every V1 command/flag/default/exit/JSON/config/capability behavior is marked retained, changed, deprecated, or removed with migration guidance.
2. Create V2 domain/application contracts alongside legacy code and exercise them through a private test harness while the published entry remains legacy.
3. While legacy remains published it is feature-frozen but receives critical security/data-loss fixes. If a safe backport is impossible, publication stops and an advisory is issued.
4. Capture audited defects as isolated legacy characterization cases or V2 regression tests while required branch suites remain green.
5. Port targets and capabilities through canonical interfaces. Legacy renderers never enter the V2 pipeline.
6. Use V1 outputs only to characterize ledger-retained behavior. Approve separate V2 golden baselines and compare retained user flows semantically; file-layout equality is not required.
7. Make legacy-project migration a cutover gate. `upgrade --dry-run` detects V1 projects, derives proposed V2 config/state, and reports every move, rewrite, deletion, and conflict. It mutates only generator-owned files whose stored hash still matches; otherwise it exits without mutation and supplies an explicit fresh-generation migration procedure. Dirty, untracked, and concurrently changed fixtures are tested.
8. Switch the candidate public entry to V2 only after every support-catalog tuple meets its gates. Before publication, delete every production legacy module/renderer and rerun the full release suite.
9. Permit only thin V2 compatibility shims named in the ledger with removal versions. They never import legacy code and are removed immediately if they threaten correctness.

Existing uncommitted user work is never reset wholesale. Useful behavior and design work is incorporated through reviewed V2 implementations; obsolete unsafe code is removed when no published entry references it and must be absent from the cutover artifact.

## 23. Acceptance criteria

The rewrite is complete only when all of the following are true:

- the host architecture checker reports no blocking violation and every versioned audit-reproduction case yields its expected safe result;
- host check, build, unit, integration, security, fixture, generated, and packed-package suites pass freshly;
- each job asserts the executable versions actually used for CLI runtime, package manager, application execution runtime, and compiler; every applicable root reports Bun 1.4.0 and TypeScript 7.0.2 exactly;
- every selected dependency exists and has timestamped evidence showing the newest stable candidates evaluated, peer/engine/platform compatibility, and the reason for any newer rejection;
- every finite support-catalog tuple passes structural invariants and appears in the generated coverage map;
- every materially distinct normalized behavior plan passes its required build and application-runtime matrix;
- every emitted acceptance-manifest entry passes its declared built-artifact scenarios, and every disabled entry emits no route, navigation, export, environment requirement, dependency, or runtime registration;
- no generated frontend imports a database/vendor secret, and no domain imports infrastructure;
- generated `check` and CI fail on an injected architecture violation;
- no published entry, runtime dependency, renderer, or package export resolves to legacy production code; legacy artifacts exist only as isolated test fixtures;
- the npm tarball contains the executable, declarations, schemas, and required runtime assets and works when installed cleanly;
- documentation examples/schemas/links pass against that tarball, generated references have a clean diff, and agent instructions match the shipped CLI/output.

## 24. Explicit non-goals

- GhostInit does not claim to generate every framework or service in existence. It guarantees the combinations listed by `ghostinit capabilities` and rejects the rest.
- It does not create third-party credentials or silently replace unconfigured vendors with fake success.
- It makes no blanket legacy path/layout guarantee. A path is retained only when the compatibility ledger marks it retained and it satisfies V2 architecture; every move/removal has migration guidance.
- It does not optimize by weakening type safety, architecture checks, security checks, or reproducibility.
