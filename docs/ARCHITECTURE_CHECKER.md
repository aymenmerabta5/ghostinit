# Architecture Checker — Modular Extraction Plan

This document describes the refactored architecture checker previously a single `1330 LOC` god file (`src/lib/architecture.ts`). It is now **23 files**, each `<200 LOC`, organized by responsibility.

## File Layout (23 files)

```
src/lib/architecture/
├── index.ts               # Composer: analyzeProject(root) orchestration (<150 LOC, <5 imports via barrels)
├── types.ts               # Shared pure types: ArchitectureFinding, PackageInfo, ParsedFile, etc.
├── constants.ts           # SSOT sets: FRAMEWORK_PACKAGES, DATABASE_PACKAGES, SERVER_ONLY_BILLING, RESERVED_NAMES, limits
├── utils.ts               # Pure path helpers: normalizePath, getBasePackage, isFrameworkEntryPoint, packageForFile, dedupeFindings
├── collectors/
│   ├── index.ts           # Barrel: re-export discoverPackages + collectSourceFiles
│   ├── packages.ts        # Package discovery: scans apps/, packages/, tooling/ for package.json → PackageInfo[]
│   └── files.ts           # Source collection: walks src/, tests/, root candidates with symlink & traversal guards (211 LOC)
├── parsers/
│   └── imports.ts         # oxc-parser wrapper: parseFile(source, ext) → {imports, directives} (<50 LOC)
├── rules/
│   ├── index.ts           # Barrel aggregating all rules
│   ├── layered.ts         # UI→Supporting chain check: source.level <= target.level, intra-BC skip
│   ├── domain-purity.ts   # Domain imports framework → HIGH
│   ├── application-purity.ts # Capabilities imports framework → HIGH
│   ├── private-path.ts    # Import contains /private/ or /_/ → MEDIUM
│   ├── database.ts        # DB import outside infrastructure/database → HIGH
│   ├── module-isolation.ts # @repo/modules/<other> cross-import → HIGH
│   ├── client-boundary.ts # "use client" imports server-only (@repo/database, billing SDKs, etc) → HIGH
│   ├── vendor.ts          # UI imports vendor (stripe, @chargily...) directly → HIGH
│   ├── capability.ts      # Capability imports other cap directly not via @repo/services root → HIGH
│   ├── undeclared-dep.ts  # Import not in package.json deps → MEDIUM
│   └── reserved-names.ts  # Module name clashes with node_modules/dist/api/auth/... → BLOCKER; also malformed generated module check
└── graph/
    ├── index.ts           # Barrel
    ├── cycles.ts          # DFS cycle detection over @repo/* workspace deps → BLOCKER
    └── symlink.ts         # Symlink / path-traversal guard (detailed below)
```

**LOC discipline:** Composer `index.ts` targets `<150 LOC`, `<5` aggregated barrel imports. Each collector/parser/rule/graph file `<200 LOC` (<300 repo-wide limit). No `export *`.

### What each layer does

- **collectors/packages.ts**: `discoverPackages(root)` — enumerates `apps/`, `packages/`, `tooling/` → reads `package.json` → builds `PackageInfo{name, dir, dependencies: Set}`.
- **collectors/files.ts**: `collectSourceFiles(root, packages, findings)` — for each package walks `src` + `tests` via `walkSource`, plus `scanPackageRoot` for root files, plus root candidates `src/`, `app/`, `src/routes/`, `router.tsx`. Handles traversal limits and symlink safety (see Symlink Guard).
- **parsers/imports.ts**: Uses `oxc-parser` `parseSync` to extract `ImportDeclaration`, `ExportAll/Named` re-exports, plus `"use client"` / `"use server"` directives. Returns `ParsedFile`.
- **rules/\*.ts**: Pure functions `checkX(findings, relFile, imp, ...)` — no FS, no side effects except pushing `ArchitectureFinding`. Single responsibility per rule.
- **graph/cycles.ts**: Builds dep graph filtered to `@repo/*` only → DFS with `visited` + `stack` + path slice for cycle reporting.
- **graph/symlink.ts**: `isInsideProject`, `safeRealpath`, `isDirectory`, `pathIncludesSymlink`, `parsePathRoot`.
- **index.ts composer**: orchestrates: discover packages → collect files → read + parse each file → run 10 rule checks per import → `checkPackageCycles` → `dedupeFindings`.

## Symlink Guard (files.ts — doc)

`files.ts` originally reported as 194 lines (now 211 after hardening) implements defense-in-depth:

- `realRoot = await realpath(root)` once — canonical root.
- Per `walkSource(dir, realRoot, ...)`: depth check `MAX_WALK_DEPTH = 64` (from constants) → emits `directory-depth-limit` HIGH if exceeded.
- `visited: Set<string>` keyed by `realpath(absFile)` to prevent double counting via symlinked duplicate paths.
- `MAX_VISITED_FILES = 50_000` guard after collection → `source-collection-limit` HIGH if exceeded.
- For each `Dirent`:
  - If `isSymbolicLink()` or `pathIncludesSymlink(path)` (parent chain contains symlink via `lstatSync` walk up to 64 levels):
    - `safeRealpath(path)` → if `undefined` → `unresolvable-symlink` MEDIUM.
    - `isInsideProject(realPathStat, realRoot)` — normalized string prefix check `normalizedPath === root || startsWith(root + "/")` → if outside → `path-traversal-risk` HIGH, skip.
    - If resolved is directory → recurse via `walkSource(realPathStat, ...)`.
    - If file → `tryAddSourceFile(realPathStat, ...)`.
  - Skip `node_modules` + `.git` at any depth.
- `tryAddSourceFile(absPath, ...)`:
  - `realpath(absPath)` (or `resolve` fallback) → `isInsideProject` check again → `path-traversal-risk` HIGH if outside.
  - Dedup via `visited` + push to `files[]`.

`symlink.ts` notes:

- `pathIncludesSymlink` uses sync `lstatSync` per ancestor (fast, bounded to 64) because async per entry would blow up.
- `parsePathRoot` handles Windows `C:\`, `\\UNC\`, POSIX `/` for traversal root detection.
- All emitted paths normalized via `normalizePath` (`sep` → `/`) + `relative(realRoot, ...)` for stable reporting.

## How to Add New Rule

1. Create `src/lib/architecture/rules/<my-rule>.ts` with signature:

   ```ts
   import type { ArchitectureFinding } from "../types.js";
   export function checkMyRule(
     findings: ArchitectureFinding[],
     relFile: string,
     imp: string,
     // pkg, parsed, absFile as needed
   ): void {
     if (/* violation */) {
       findings.push({
         id: "my-rule-id",               // kebab, stable
         severity: "HIGH",               // BLOCKER|HIGH|MEDIUM|LOW
         message: `...`,
         file: relFile,                  // already normalized
         rule: "my-rule",                // maps to rule name
       });
     }
   }
   ```

   Keep file `<200 LOC`, single responsibility, pure (no FS).

2. Export from `rules/index.ts`:

   ```ts
   export { checkMyRule } from "./my-rule.js";
   ```

3. Wire in `src/lib/architecture/index.ts`:
   - Import `checkMyRule` from `./rules/index.js`.
   - Inside `for (const imp of parsed.imports)` loop call `checkMyRule(findings, relFile, imp, ...)`.
   - For file-level rules (no import) like `reserved-names`, call outside import loop once per file.

4. Document in `docs/ARCHITECTURE.md` → `Additional Architecture Rules` section: id, severity, trigger.

5. Validate:

   ```bash
   bun run build
   bun run check   # oxlint + oxfmt + tsc
   bun test --timeout 100000
   # manual smoke
   rm -rf /tmp/gi-test && mkdir /tmp/gi-test
   bunx ghostinit create demo --yes --no-install --cwd /tmp/gi-test
   cd /tmp/gi-test/demo && bun run typecheck && ghostinit check
   ```

6. Ensure <300 LOC per file, no `export *`, composer <5 imports.

## oxc-parser Version Pinning and Breaking Change Handling

- Pinned in host `package.json`: `"oxc-parser": "^0.139.0"`. Catalog SSOT in `packages/versions/src/index.ts` should mirror this for generated? Actually checker is host-only, but build externalizes oxc-parser via `scripts/build.ts` `Bun.build({external: ["oxc-parser"]})`.
- Why external: oxc-parser contains native bindings/wasm — bundling breaks; host build keeps it as external dep.
- API used: `parseSync(filename, source, {sourceType:"module", lang})` where `lang` is `undefined | "jsx" | "tsx"` inferred from ext (`.tsx` → `tsx`, `.jsx` → `jsx`). Only iterates `result.program.body` for `ExpressionStatement` (directives), `ImportDeclaration`, `ExportAllDeclaration`, `ExportNamedDeclaration`.
- Breaking change history:
  - Pre-0.90: `parseSync` returned different shape, `program` vs `program.body` missing.
  - 0.110+ introduced `lang` option deprecation path — monitor `oxc-parser` changelog.
  - 0.139 stabilizes `parseSync` signature; upgrade tested via `bun test integration/architecture.test.ts` (if exists).
- Handling strategy:
  - Pin minor `^0.139.0` with caret — allows patch but not `0.140` breaking. For critical checker, consider exact pin `0.139.0` or Renovate group.
  - Wrap `parseFile` in try/catch at call site (`index.ts`): on exception push `parseable-source` LOW, continue — never crash whole check on one file parse error.
  - If oxc API changes (`result.program` renamed or body iterator breaks), fallback:
    ```ts
    try {
      /* oxc */
    } catch {
      /* attempt regex fallback or emit parse-error LOW */
    }
    ```
  - Test with `tsc --noEmit` + integration generation: checker runs on generated project with many TSX files.
  - Document migration in `docs/ARCHITECTURE_CHECKER.md` version matrix: oxc-parser version ↔ required code change.

## Test Strategy

Unit (`tests/unit/architecture.test.ts` or similar):

- Mock FS for collectors? Or use temp dirs.
- `discoverPackages`: create temp `apps/foo/package.json`, `packages/bar/package.json` → assert names + deps parsed.
- `collectSourceFiles`: temp project with symlinks:
  - symlink inside project → should resolve and include.
  - symlink outside project (`/etc/passwd` or `../outside`) → should emit `path-traversal-risk` HIGH, not include.
  - circular symlink → visited set prevents infinite loop, depth guard triggers.
  - depth >64 → `directory-depth-limit`.
  - 50k file limit simulation via small MAX_VISITED_FILES override in test build.
- `parseFile`: various imports (`import x from "y"`, `export * from "z"`, `export {a} from "b"`), directive detection.
- Rules: table-driven `({relFile, imp, shouldTrigger})` per rule.

Integration (`tests/integration/`):

- Generate real project via `generateProjectFiles` dry-run or `bunx ghostinit create demo --yes --no-install` in temp.
- Run `analyzeProject(tempRoot)` → expect zero findings for clean generation (checker must pass on own template).
- Inject violations (e.g., write file `apps/web/src/app/page.tsx` importing `stripe` directly) → assert `vendor-isolation` HIGH found.
- Test cycle detection: create two packages `args-a` deps `args-b` and vice versa → expect `package-dependency-cycle` BLOCKER.

Compatibility (`tests/fixtures/compatibility`):

- Not directly checker, but ensure generated project still `ghostinit check` passes after deps upgrade (oxc-parser compat).

CI command: `bun test --timeout 100000 tests/unit tests/integration` — timeout required due to heavy generation.

## Future: Extract to @ghostinit/arch-lint Standalone Package

Idea: publish checker as own package for reuse outside ghostinit, similar to eslint plugin.

Potential design:

- Package name `@ghostinit/arch-lint` in `packages/arch-lint/` (or `tooling/arch-lint`).
- Exports:
  ```ts
  export { analyzeProject } from "./index.js"; // programmatic API
  export type { ArchitectureFinding, CheckConfig } from "./types.js";
  // CLI: bin/arch-lint -> calls analyzeProject(process.cwd()) + pretty print JSON + exit code
  ```
- Config file `.archlintrc.json` or `archlint.config.ts` allowing:
  - Custom layer definitions (level → path globs + name).
  - Additional vendor isolation sets.
  - Reserved names override.
  - Severity overrides per rule.
- Implementation steps:
  1. Move `src/lib/architecture/` → `packages/arch-lint/src/` (keep same modular layout).
  2. Make `oxc-parser` a peer dep + optional fallback to `@babel/parser` if native missing.
  3. Add JSON schema + zod config parser.
  4. Add reporter formatters: `json`, `stylish`, `github`.
  5. CI: `arch-lint` would be run as `ghostinit check` thin wrapper calling `analyzeProject` from package.
  6. Versioning: follows ghostinitVersion but independent semver possible.
  7. Publish: included in `npm pack`? Host already publishes only `dist/cli.js` + `src/**`, but extracted package could be separate npm package.
- Tradeoffs:
  - Pro: reusable in non-ghostinit monorepos, faster iteration, separate tests.
  - Con: adds package maintenance, need to sync layer definitions between templates and arch-lint config. Could keep SSOT in `packages/versions` or `arch-lint` constants.
- Interim step (now): keep modular files in host, but ensure each <200 LOC + pure, so extraction is `cp -r`.

## References

- Host vs Generated: see `docs/ARCHITECTURE.md`.
- Security: symlink guard complements `FsTransaction` path traversal protection in `src/lib/fs.ts`.
- Build: `scripts/build.ts` externalizes `oxc-parser` — must stay in sync on version bump.
- Constants: `MAX_VISITED_FILES=50_000`, `MAX_WALK_DEPTH=64` in `constants.ts` (SSOT for tests).
