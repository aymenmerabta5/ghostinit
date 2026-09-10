# Dependency security maintenance

Use this workflow for generated-project dependency audits, compatible security
repairs, installation, upgrade, and recovery. Use the project's pinned Bun.

## Commands and automatic repair

```bash
bun run install:bootstrap             # fresh --no-install output without a lock
bun run install:verified              # install an existing locked project
ghostinit security audit --json       # read-only; audit is the default action
ghostinit security fix --dry-run --json
ghostinit security fix --json         # repair, install, audit, typecheck, lint:all, test
bun run security:audit --json         # generated standalone audit
bun run security:fix --dry-run --json # generated standalone preview
bun run security:fix --json           # same repair and project verification
ghostinit upgrade --dry-run --json
ghostinit upgrade --json              # reconcile, repair, install, verify project
```

Creation with installation, `install:bootstrap`, `install:verified`, and upgrade
apply eligible fixes automatically. The two install scripts verify the installed
dependency graph; dedicated fixes and upgrade also run `typecheck`, `lint:all`,
and the root `test` script. Required architecture and build/runtime checks remain
separate. The generated security scripts bundle their runtime and do not require
an installed GhostInit package.

`create --no-install` leaves security verification unrun; bootstrap afterward.
`upgrade --no-install` applies the managed-file upgrade but skips dependency
installation and security verification. Its JSON reports `dependencySecurity`
with `status: "not-run"` and `reason: "no-install"`. Upgrade dry runs report
`reason: "dry-run"`. An upgrade can fail security verification after its source
changes committed; inspect `upgraded` and `dependencySecurity`, not exit status
alone. Ordinary `ghostinit check` remains a read-only architecture check and
never repairs dependencies.

Audit and repair preview do not change project files or installed dependencies.
They may query the public registry and resolve metadata in an isolated temporary
candidate, including use of Bun's cache. They do not run package lifecycle scripts
or create a candidate `node_modules` for a repair preview.

## Eligible fixes and retained policy

Automatic repairs support stable exact versions and simple caret/tilde ranges.
An exact pin may advance within its caret-compatible release family; a tilde
range keeps its minor version. Zero-major ranges retain their narrower compatible
boundary. Unsupported ranges, prereleases, downgrades, and incompatible changes
are not silently widened. There is no `--latest` fallback.

All resolved releases must satisfy the existing seven-day (`604800` second)
minimum age and public-registry integrity policy. The exclusion list stays empty.
A published security fix younger than seven days remains blocked until eligible;
report that blocker. Review any incompatible upgrade as separate authorized work.
Existing reviewed patches count only after the canonical installed audit proves
those exact patch identities and bytes.

GhostInit checks the isolated repaired graph, installs it frozen with lifecycle
scripts disabled, and audits it before publishing lock/manifests/evidence. Source
publication uses a project lease and compare-and-swap filesystem transaction.
It then performs the actual frozen project install and canonical installed audit.

Verified direct, workspace, and catalog declaration fixes persist under
`ghostinit.config.json.dependencySecurity`. Keep that evidence: its version floors
enter the generation plan before hashing, so later reconciliation preserves fixes,
keeps a higher compatible generated pin, and does not recreate removed dependencies.
Standalone maintenance invalidates an obsolete generation-plan attestation; it does
not claim that newly changed bytes came from the earlier plan.

## Results and recovery

A normally returned result includes `status`, `dryRun`, `applied`,
`installedVerified`, `changes`, `remaining`, and `verifiedPatchAdvisories`;
recovery failures may also include `recoveryRequired`. The CLI wraps these in its
normal envelope; generated scripts return the result directly. A preview never
proves an installed repair.

If the runtime throws before reporting a complete outcome, a failure may instead
contain `outcomeUnknown: true`. The generated launcher omits `applied`,
`installedVerified`, and recovery facts it cannot establish. Missing fields do not
mean false: inspect source changes, the journal, and process cleanup before retrying.
Upgrade reports its own source/security outcome separately.

- `clean` / `fixed`: successful policy result; inspect `dryRun` and
  `installedVerified` before claiming verification.
- `partial`: unreviewed low/moderate findings remain. Dedicated audits/fixes exit
  `8`; automatic install/upgrade can succeed only with a verified installed graph
  under the existing high-severity gate. Report the remaining findings.
- `blocked`: unresolved high/critical/unknown findings or required recovery
  prevent acceptance. `ghostinit security` exits `8`; generated scripts exit `1`.
- `failed`: the operation or required verification failed; no success claim.

After publication, a failed install/check retains
`.ghostinit/security-installation.json`. Source changes may already be applied;
GhostInit does not roll back `node_modules`. Repair the reported cause and rerun
`ghostinit security fix` or `bun run security:fix` when the recorded lock still
matches. If sources changed meanwhile, reconcile the journal and sources first.

A failed `init` in an initially empty existing directory preserves its generated
source, dependency lock/evidence, installed output, and recovery journal once the
native installation has been attempted. Initialization is incomplete: a dependency
fix does not finish missing creation state or local secret materialization. After
resolving the cause, repeat the original `init` selections with `--force` and follow
its bootstrap instruction when it merges an isolated candidate into the directory.
A successful `init` in an initially empty directory still leaves the project
installed and initialized.

`CLEANUP_UNVERIFIED` means a prior child process has not been proven stopped.
Read-only audit/preview remain available, but all mutations stay blocked,
including stale/forced lease takeover. Independently verify process cleanup and
explicitly reconcile the journal before retrying. Do not delete a lease/journal
or weaken age, audit, integrity, patch, or architecture policy to make a gate pass.
