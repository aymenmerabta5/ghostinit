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
8. **generated-app-reviewer** — verify every selected generated frontend and runtime.
9. **release-auditor** — verify package, tarball, clean-environment behavior.
10. **adversarial-final-reviewer** — try to prove the project incomplete.
11. **fix-agent** — implement accepted findings with regression tests.
12. **final-verification-agent** — independently rerun verification matrix.

## Cross-Cutting Rules

- A reviewer must never approve its own fixes.
- Fresh-context reviewers must be used for independent verification.
- Parallel write-enabled agents are allowed only on non-overlapping files.
- All important conclusions must be persisted to ledgers or reports.
- Frontend assignments follow the universal responsibility boundaries in the root `AGENTS.md` and `skills/ghostinit-use/references/frontend-architecture.md`: thin routes, feature composition, remote-state adapters, cohesive form/workflow hooks, pure models, typed-prop views, and shared primitives/infrastructure.
- Architecture findings and failing required gates block an acceptable/complete verdict. Report unrun verification; do not suppress detectors, raise limits, widen exclusions, or create broad exceptions to hide a failure. Passing a static scan does not replace responsibility and behavior review.

The project owner may change or remove GhostInit and its policies. Generated lint/typecheck commands remain independently usable. Agents must not silently remove or weaken safeguards to make work pass; changing those safeguards requires explicit developer authorization.

- Dependency-security assignments preserve the seven-day policy, empty exclusions,
  compatible version boundaries, canonical installed audits, and durable security
  floors before plan hashing. Follow `skills/ghostinit-use/references/dependency-security.md`.
- Failed installation may follow committed source changes; report recovery without
  claiming `node_modules` rollback. Unverified process cleanup blocks mutations and
  force/TTL lease takeover until independently verified and explicitly reconciled.

## Last Updated

2026-09-10
