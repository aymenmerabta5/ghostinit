# PRODUCT.md — GhostInit

## Product Purpose

GhostInit is a Bun-powered CLI that scaffolds production-grade, well-structured monorepos with architectural linting. It generates `apps/* + packages/* + tooling/*` with a 6-layer pragmatic architecture (inspired by DDD, build-time enforced via oxc-parser), oRPC contract-first transport, Better Auth, Drizzle ORM, and flexible billing. Two modes: monorepo workspaces or flat single. One command to production.

## Users

- **Indie hackers and founders** who need to ship fast but want structure that scales with them. They've been burned by boilerplate sprawl and want a modular monolith that doesn't fight them. They work at 2am in a dim room on a 14-inch MacBook, sipping coffee, switching between code and product.
- **Senior engineers** who care about boundaries. They want a well-structured monorepo with architectural linting that prevents drift, but they don't want to hand-roll it. They value explicitness over magic.
- **Agencies and freelancers** who scaffold many projects. They need a repeatable, auditable generator that produces the same quality every time, with billing and auth already wired.

## Brand Pillars

- **Opinionated, not rigid.** GhostInit makes choices (Bun, oRPC, Drizzle) but composes them transparently. No hidden abstractions.
- **Structure that scales.** From single file to monorepo, the same design tokens, same shell, same oRPC client. The architecture grows with you.
- **Build-time, not runtime.** Architectural checks are via oxc-parser at `ghostinit check`, not runtime overhead. Fast, explicit, auditable.
- **Open and forkable.** Like t3.codes, if you don't like something, fork it. MIT licensed, no vendor lock-in.

## Tone

- **Direct and technical.** No fluff, no buzzwords. Short sentences. Code is the proof.
- **Confident but humble.** We make strong choices and explain why. We don't pretend to be everything.
- **Developer-to-developer.** We speak the language of the terminal, the editor, the PR.

## Anti-References

- **Not SaaS-cream:** Avoid the beige, muted-slate, rounded-everything, SaaS landing page cliché. No hero-metric template (big number + small label).
- **Not editorial-magazine:** No display serif + italic + drop caps for a dev tool. This is a control plane, not a magazine.
- **Not glassmorphism:** No decorative blurs and glass cards. Rare and purposeful, or nothing.
- **Not side-stripe borders:** No `border-left: 4px solid` accents on cards. Use full borders, background tints, or leading icons.

## Register

- **Product** (default): Dashboard, settings, admin, billing — design serves the task. Restrained palette, familiar affordances, earned familiarity.
- **Brand** (marketing): Landing page — design IS the product. Dark-first, terminal-native, committed color, distinctive typography. Inspired by t3.codes.

## Success Metrics

- `ghostinit create` → `bun install` → `bun run dev` works first time, no manual patches
- `ghostinit check` passes on generated projects
- Users can switch frameworks (Next ↔ TanStack), databases (postgres ↔ convex), billing providers without rewriting
- Generated projects are forkable and understandable without reading docs

## Strategic Principles

1. **One shared design.** Web (Next, TanStack), mobile (Expo), and desktop (Electron) consume one versioned semantic Tailwind contract through the mode-resolved UI logical module. Portable OKLCH tokens and utilities remain identical, while that resolved module alone owns versioned DOM/native platform adapters. An application owns content discovery only, never tokens, reusable utilities, Tailwind configuration, or an adapter implementation.
2. **Dark-first, light as alternative.** Like t3.codes, the marketing and observability surfaces assume a dim room, 2am, 27-inch monitor. Light is a toggle, not the default.
3. **Code is imagery.** Terminal snippets, `bunx ghostinit create` commands, and `turbo.json` diffs are the hero imagery. No stock photos.
4. **Forkability as feature.** Generated files are readable and editable. Ownership lives in the generation plan; inline comments explain constraints or decisions that the code cannot make clear.
