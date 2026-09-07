# Visual overhaul, 2026-09-07

The user requested a full visual overhaul with `design-taste-frontend`. The
design read, palette, layout, component rules, and behavioral requirements are
recorded in [DESIGN.md](../../DESIGN.md). The existing Tailwind, Base UI, and
native component foundations remain in place.

The implementation adds self-hosted Geist typography, light/cobalt and charcoal
themes, a desktop workspace rail and accessible mobile Sheet, focused account
forms, grouped settings, consistent feature pages, and capability-aware landing
pages. Actual project directories and semantic colors provide the landing
visuals. Unused marketing helpers, invented terminal results, duplicated theme
renderers, custom theme-icon drawings, and remote font permissions are removed.

Routes continue to own authorization and initial reads. Account and query state
retain their existing ownership boundaries. The notification feature's
controlled composer presents fields while its page owns mutations and effects.
The generated navigation checker now follows the real shell composition and
checks translated destinations, canonical identity, role admission, and mobile
control visibility. Component and page size limits are unchanged.

## Verification status

The redesigned source passes the focused regression suite. The freshly generated
application has not yet completed installed gates or browser acceptance.

- Full source check passed after integration and after the first corrections.
- The first isolated 47-file run completed: 700 passed tests, 43 failed tests,
  and 43,130 assertions. Failures exposed the old navigation-checker contract,
  notification page size, stale visual assertions, and a new Expo test reading
  the wrong capability field. They are retained as failed verification.
- The corrected 50-file run passed: 767 tests, 43,834 assertions, and no failures.
  Each file ran in a fresh guarded `bun --smol test` process; the highest sampled
  process memory was 457.1MB, with no guard stops or leftover processes.
- `bun run typecheck` passed, including the host project references and scripts.
- `bun run check:versions` passed for 167 catalog/host scopes and 1,070 locked
  versions under the existing seven-day policy. Both new font packages exist
  and are old enough; no release-age exclusion was added.
- `bun run build` passed. The two actual frontend records passed strict schema,
  context-hash, referenced-file, and component-registry validation.
- The earlier commit `2f2a734353af086c6b37347aca491fe564dab00f` passed all hosted
  CI/E2E jobs, including 24 generated configurations. That evidence belongs to
  the pre-overhaul functional baseline and does not certify this design.

Required remaining evidence includes a fresh generated install, formatting,
architecture check, typecheck, lint, root tests, visual review in both themes
and EN/FR/AR, keyboard and responsive checks, feature/security lifecycles,
production builds, current-commit CI, and the exact tested release artifact.
