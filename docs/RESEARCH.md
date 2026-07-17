# GhostInit Dependency Research Summary

Date: 2026-07-12

## Toolchain

| Tool          | Version     | Notes                                                                                                 |
| ------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Bun           | 1.3.14      | Current stable latest; local matches.                                                                 |
| Node (target) | 24.18.0 LTS | Local v25.8.0 is EOL; target LTS for generated apps.                                                  |
| TypeScript    | 7.0.2       | Stable; no programmatic compiler API until 7.1. Use TS 6.0.3 sidecar only if a tool requires the API. |

## Generated Application Stack

| Package                  | Version | Source                           |
| ------------------------ | ------- | -------------------------------- |
| next                     | 16.2.10 | npm registry                     |
| react                    | 19.2.7  | npm registry                     |
| react-dom                | 19.2.7  | npm registry                     |
| @types/react             | 19.2.17 | npm registry                     |
| @types/react-dom         | 19.2.3  | npm registry                     |
| drizzle-orm              | 0.45.2  | npm registry                     |
| drizzle-kit              | 0.31.10 | npm registry                     |
| pg                       | 8.22.0  | npm registry                     |
| @types/pg                | 8.11.14 | npm registry                     |
| better-auth              | 1.6.23  | npm registry                     |
| @orpc/server             | 1.14.7  | npm registry                     |
| @orpc/contract           | 1.14.7  | npm registry                     |
| @orpc/client             | 1.14.7  | npm registry                     |
| @orpc/openapi            | 1.14.7  | npm registry                     |
| @orpc/react-query        | 1.14.7  | npm registry                     |
| zod                      | 4.4.3   | npm registry                     |
| @tanstack/react-query    | 5.101.2 | npm registry                     |
| @tanstack/react-form     | 1.33.1  | npm registry                     |
| tailwindcss              | 4.3.2   | npm registry                     |
| @tailwindcss/postcss     | 4.3.2   | npm registry                     |
| postcss                  | 8.5.17  | npm registry                     |
| shadcn                   | 4.13.0  | npm registry                     |
| @base-ui/react           | 1.6.0   | npm registry                     |
| clsx                     | 2.1.1   | npm registry                     |
| tailwind-merge           | 3.6.0   | npm registry                     |
| class-variance-authority | 0.7.1   | npm registry                     |
| @biomejs/biome           | 2.5.3   | npm registry                     |
| turbo                    | 2.10.4  | npm registry                     |
| @playwright/test         | 1.61.1  | npm registry                     |
| postgres Docker          | 18.4    | Docker Hub / PostgreSQL official |

## Important Compatibility Notes

- **TypeScript 7.0.2** has no programmatic compiler API. The architecture checker
  therefore must be parser-independent (per spec). Any generator that needs to
  inspect TypeScript source must use AST parsing libraries (e.g., `@babel/parser`,
  `typescript` TS 6 sidecar) only where strictly required.
- **@orpc/next@0.27.0** peers with **@orpc/server 0.27.0**, conflicting with the
  stable core line 1.14.7. GhostInit avoids `@orpc/next` entirely and exposes
  oRPC via `RPCHandler` route handlers. Server Actions remain plain Next.js
  actions.
- **Better Auth** requires `drizzle-orm ^0.45.2` and `pg ^8.0.0`; pinned versions
  satisfy this exactly.
- **Tailwind v4** uses `@tailwindcss/postcss` and does not need `autoprefixer`.
- **Biome v2.5.3** replaces `linter.recommended` with `linter.preset`; generated
  config must use the new format.
- **Next.js 16** defaults to Turbopack and removes `next lint`. Generated apps
  use Biome for linting/formatting instead.

## Documents Consulted

- https://registry.npmjs.org/ (live package metadata)
- https://bun.sh/blog/bun-v1.3.14
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- https://tailwindcss.com/docs/upgrade-guide
- https://base-ui.com/react/overview/releases
- https://biomejs.dev/guides/getting-started/
- https://turborepo.dev/repo/docs/getting-started/installation
- https://playwright.dev/docs/release-notes
- https://orm.drizzle.team/docs
- https://www.better-auth.com/docs/introduction
- https://github.com/dinwwwh/orpc
