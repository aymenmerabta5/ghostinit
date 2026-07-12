# GhostInit Subagent Instructions

## Manifest

The project uses dynamic `general-purpose` subagents because persistent custom agents are not registered in this harness. Each agent assignment must include role context, exact scope, allowed files, forbidden files, acceptance criteria, commands to run, and expected output.

## Required Roles

1. **official-docs-researcher** — current stable package versions, APIs, compatibility.
2. **compatibility-auditor** — verify compatibility matrices with fixtures.
3. **implementation-agent** — implement isolated features.
4. **test-engineer** — write and run tests.
5. **architecture-reviewer** — check layering, cycles, ownership.
6. **security-reviewer** — detect secrets, leaks, unsafe defaults.
7. **generator-reviewer** — verify generator output and idempotency.
8. **generated-app-reviewer** — verify generated Next.js app.
9. **release-auditor** — verify package, tarball, clean-environment behavior.
10. **adversarial-final-reviewer** — try to prove the project incomplete.
11. **fix-agent** — implement accepted findings with regression tests.
12. **final-verification-agent** — independently rerun verification matrix.

## Cross-Cutting Rules

- A reviewer must never approve its own fixes.
- Fresh-context reviewers must be used for independent verification.
- Parallel write-enabled agents are allowed only on non-overlapping files.
- All important conclusions must be persisted to ledgers or reports.

## Last Updated

2026-07-12
