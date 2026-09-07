# GhostInit Vision

> This document defines the product direction. It is not evidence that every
> requirement is already implemented. A capability is supported only when its
> generated output passes the applicable release gates.

## Mission

GhostInit is opinionated project infrastructure for starting and maintaining
production applications. It captures a proven engineering stack once so that
developers can reuse it consistently instead of rebuilding architecture,
security, tooling, and deployment foundations for every project.

GhostInit must work equally well for a developer working manually or with tools
such as Codex and Claude Code. It is AI-tool friendly, but it is not an agentic
system and must never require a particular model, vendor, MCP server, or coding
agent.

## Product Definition

GhostInit is three closely related things:

1. **A scaffolder** that creates a complete, understandable project foundation.
2. **An internal architecture compiler** that resolves a typed project
   specification into a deterministic, validated file plan.
3. **A maintenance CLI** that can safely add, synchronize, inspect, and validate
   GhostInit-owned infrastructure without taking ownership of product code.

The primary workflow remains conventional:

```text
ghostinit create -> build the product -> ghostinit add/sync/check/doctor/status
```

The compiler and provenance model are implementation mechanisms, not an agent
orchestration product.

## Product Principles

### Opinionated, not universal

GhostInit should provide one coherent way to build each supported architecture.
It may expose deliberate choices where ecosystems genuinely differ, but it must
not become an unbounded collection of loosely compatible templates.

### Conventional output

Generated applications are normal TypeScript projects. Developers own them,
can understand them, and can continue without GhostInit. Runtime behavior must
not depend on a proprietary GhostInit service.

### Framework-native behavior

Logical capabilities remain consistent, while rendering and data access follow
the framework's own best practices. Sharing a contract must not force every
framework through the same execution path.

### Complete or rejected

When a capability is selected, GhostInit must emit its complete supported
surface across every applicable selected app. If a combination cannot be
implemented safely, capability resolution rejects it before writing files.
Placeholders, unreachable branches, and runtime `NOT_IMPLEMENTED` stubs are not
feature parity.

### Secure and operable by default

Authentication, authorization, ownership, validation, rate limits, secret
handling, observability, recovery, deployment, and verification are part of the
foundation—not optional cleanup after generation.

### Cross-platform

The CLI and generated projects must support Windows, Linux, and macOS. Paths,
process supervision, scripts, temporary files, and cleanup must not assume a
Unix shell or a particular drive layout.

## Internal Compilation Model

GhostInit compiles desired infrastructure through a deterministic pipeline:

```text
Project specification
  -> schema validation
  -> capability dependency and compatibility resolution
  -> immutable resolved project model
  -> typed GenerationPlan with ownership and provenance
  -> framework and platform emitters
  -> transactional application and persisted state
  -> architecture and production verification
```

Every generated file must have a known owner and lifecycle. Emitters must not
silently enable capabilities, duplicate compatibility policy, or write files
outside the plan. Single-project and monorepo modes share the same logical
model; they differ only in physical packaging.

## One Logical Application API

Selected backend capabilities expose one environment-neutral contract and one
application-service model. oRPC is the typed contract and transport boundary.

Shared API packages may expose:

- input, output, and error schemas;
- procedure contracts and router types;
- serializable DTOs;
- environment-specific client factories.

They must not expose database adapters, secrets, or server implementations to
browser, Expo, or Electron bundles.

Invocation is platform specific:

- **Next.js server execution:** a request-scoped application use case or service
  directly; never an oRPC transport caller or an HTTP request to the same
  application's Route Handler.
- **TanStack Start server execution:** authenticated `createServerFn` functions
  backed directly by application use cases; loaders preload through those
  functions and TanStack Query.
- **Browser interaction:** the typed oRPC HTTP client and TanStack Query when a
  client island needs live reads, polling, or mutations.
- **Expo:** a typed HTTPS/WSS client with native-safe authentication and no
  server implementation imports.
- **Electron:** a typed client behind a constrained preload/main-process
  boundary, validated origins, bounded payloads, and no renderer secrets.
- **External integrations:** HTTP route handlers for webhooks, OpenAPI,
  third-party callbacks, raw uploads/downloads, and public/native clients.

HTTP and WebSocket transports must preserve the same authorization, errors,
limits, and application semantics as direct server invocation.

## Framework Semantics

### Next.js

- React Server Components are the default for initial authenticated reads.
- Server Components call server-only application services or use cases, not the
  oRPC adapter.
- Small Client Components own only interaction and browser state.
- Server Actions handle internal UI mutations, re-authenticate and authorize
  every call, validate input, and perform explicit cache revalidation.
- Route Handlers exist for external/native clients and protocol boundaries, not
  as an internal RSC loopback.
- Cache Components may cache public or correctly scoped data, but must never
  share request-, user-, session-, or tenant-specific data.
- Independent reads should run in parallel or stream through appropriate
  Suspense boundaries.

### TanStack Start

- Route loaders are treated as isomorphic code.
- Secrets, database access, and trusted server work live in `createServerFn`
  functions or server-only modules.
- Loaders preload protected data with the route QueryClient and
  `ensureQueryData`; components consume the hydrated query instead of creating
  a post-hydration waterfall.
- Personalized Query caches are scoped or cleared when user, session, or active
  tenant identity changes.
- Server routes remain available for external, Expo, Electron, webhook,
  OpenAPI, streaming, and raw-body use cases.
- The Start server must not call its own oRPC adapter or public HTTP API for
  routine SSR work.

### Expo

- Native UI uses React Native Reusables-compatible primitives and Uniwind.
- Data access uses the typed remote API and native realtime transport.
- Authentication material is stored and transmitted through native-safe
  mechanisms.
- Server-only modules and secrets can never enter the mobile bundle.

### Electron

- Renderer UI uses web-compatible shared primitives and design tokens.
- Privileged operations and remote transport cross a typed preload boundary.
- The main process validates endpoints, origins, payload sizes, and IPC
  messages.
- Packaged builds contain no server secrets or implicit development endpoints.

## Shared Design System

Semantic design tokens have one canonical source. Changing a color, radius, or
typographic token updates every selected app through thin platform adapters.

- Next.js, TanStack Start, and Electron use shadcn-compatible components backed
  by Base UI where applicable.
- Expo uses React Native Reusables-compatible components rather than DOM
  shadcn components.
- Platform engines remain platform owned; for example, Expo owns its Uniwind
  import while consuming shared semantic tokens.
- Application surfaces should compose registry components instead of replacing
  them with unstyled native HTML controls.

## Foundation Emitted for Every Project

Every generated project should receive the applicable baseline:

- Bun package-management policy and a regular text `bun.lock`;
- strict TypeScript configuration and import aliases;
- formatting, linting, architecture checks, and unsafe-boundary checks;
- typed environment validation with server/public audience separation;
- secret-safe logging, structured errors, and health endpoints;
- unit, integration, generated-project, and production-build test commands;
- least-privilege CI with frozen installs and artifact checks;
- secure development and production defaults;
- cross-platform scripts and deterministic temporary-file handling;
- deployment files for selected supported targets;
- static contributor guidance such as `AGENTS.md` and `CLAUDE.md` that any
  developer or coding tool may read.

## Opt-in Capabilities

Capabilities are enabled explicitly or through a documented preset. The focus
is depth, consistency, and operational completeness—not checkbox count.

Priority capability families include:

- typed oRPC transport and OpenAPI;
- Better Auth identity, sessions, recovery, passkeys, OAuth, two-factor auth,
  organizations, teams, invitations, roles, bans, and audit trails;
- Postgres and Convex persistence behind application-owned ports;
- billing, subscriptions, portals, ownership, webhook idempotency, and provider
  reconciliation;
- internationalization, locale routing, RTL behavior, and complete catalog
  coverage;
- email and transactional templates;
- analytics with consent and platform-safe clients;
- caching and safe invalidation;
- storage, quotas, uploads, cleanup, and durable recovery;
- messaging, attachments, authorization, and realtime delivery;
- notifications and preferences;
- background jobs, scheduling, retries, and supervision;
- feature flags with safe server/client evaluation;
- PDF generation and admission controls;
- observability, rate limiting, and operational health;
- optional Eve application/runtime integration when selected. Eve is a
  generated application capability and does not make GhostInit itself agentic.

## Feature Parity

Parity means the same business capability and contract, not identical UI or
execution mechanics.

- Web, mobile, and desktop consume the same domain semantics and authorization
  rules.
- Each platform uses its native presentation, navigation, storage, and
  transport adapters.
- A support catalog explicitly records applicable, unsupported, or degraded
  surfaces.
- Degraded behavior must be resilient and documented; it must not silently
  weaken security or accepted input limits.
- Mode-specific duplicated contracts are defects. Packaging mode must not
  change API outputs, error semantics, or security requirements.

## Dependency and Supply-chain Policy

- Bun `1.4.0` is the current package-management and deployment runtime source of
  truth and may be upgraded deliberately through the version registry.
- New npm resolutions require a minimum release age of seven days for direct
  and transitive dependencies.
- Release-age exceptions are empty by default and require explicit security
  review if ever introduced.
- Committed lockfiles are independently audited before installation because Bun
  intentionally trusts existing locks and caches.
- Lock audits fail on missing timestamps, untrusted registries, malformed
  integrity, unsupported protocols, or packages younger than the policy.
- Dependency evidence records publication times, the latest eligible version,
  compatibility holds, and the complete audited lock closure.
- Vendor credentials are never invented, committed, logged, or baked into
  deployable artifacts.

## Safe Evolution

GhostInit-owned infrastructure may evolve through `add` and `sync`, but user
code is authoritative.

- Writes are transactional.
- Dry runs perform no mutation.
- Managed-file changes are hash checked.
- User-modified or untracked collisions fail closed.
- Capability disablement removes only unchanged generator-owned artifacts.
- Schema and state migrations are explicit and recoverable.
- Generated code should remain readable and editable after GhostInit is gone.

## Verification Standard

A release claim requires evidence from the settled final tree, including:

- formatting, linting, host typechecking, architecture and security checks;
- registry, release-age, lock-integrity, and vulnerability audits;
- the full host test suite;
- real compatibility fixtures;
- installed generated-project matrices across supported modes, frameworks,
  databases, applications, and capabilities;
- production builds and launches for representative Next.js, TanStack Start,
  Expo, and Electron outputs;
- direct and HTTP oRPC parity tests;
- authentication, cross-user, cross-tenant, retry, duplicate, and recovery
  behavior tests;
- packed CLI verification and artifact digest;
- permanent Windows, Linux, and macOS CI coverage.

Focused tests and source-string assertions are useful iteration evidence, but
they do not establish release readiness.

## Non-goals

GhostInit is not:

- an AI agent, agent runtime, or agent orchestrator;
- a replacement for Codex, Claude Code, or a developer;
- a prompt-to-application or no-code product;
- a generator of arbitrary product-specific business logic;
- a proprietary application runtime or mandatory hosted control plane;
- a reason to ignore framework-native architecture;
- a promise to support every ecosystem combination.

## Product Focus

Near-term work should prioritize:

1. closing the typed compiler path so all emitters consume resolved capabilities
   and provenance directly;
2. proving one shared application API with framework-native server and client
   invocation;
3. complete, secure parity across selected web, mobile, and desktop surfaces;
4. safe project synchronization and upgrades;
5. reproducible supply-chain and deployment evidence;
6. a small set of fully proven golden paths before broadening the matrix.

New capability breadth should not outrun correctness, maintainability, or real
production verification.

## Definition of Success

GhostInit succeeds when a developer can create a project, understand its
architecture, begin product work immediately, and confidently continue with or
without a coding agent—while the generated foundation remains secure,
consistent, portable, testable, and maintainable as the project grows.
