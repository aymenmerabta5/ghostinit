/**
 * Re-export the GhostInit version registry so bundled templates can import it.
 *
 * Path points to real package at packages/versions/src/index.ts.
 * The .js extension is intentional - resolved & stripped by normalizeSourceImports
 * in the template bundler to produce correct relative imports in generated projects.
 * @see src/lib/normalizeSourceImports (regex stripping .js)
 */

import * as _versions from "../../packages/versions/src/index.js";

// Build-time assertion: if packages/versions not built, host tsc still green but
// generated package.json would get undefined. Fail fast here.
if (!_versions.ghostinitVersion || typeof _versions.ghostinitVersion !== "string") {
  throw new Error(
    "[ghostinit] packages/versions not built or ghostinitVersion missing — run `bun run build` in packages/versions first",
  );
}

// Explicit re-exports only — no `export *` per host guideline
export {
  ghostinitVersion,
  catalog,
  runtime,
  typescript,
  nextStack,
  database,
  convex,
  auth,
  orpc,
  validation,
  tanstack,
  tanstackStart,
  styling,
  ui,
  tooling,
  testing,
  eve,
  billing,
  analytics,
  email,
  cache,
  electron,
  backend,
  i18n,
  interactive,
  postgresDocker,
  expo,
  reanimated,
  worklets,
  uniwind,
} from "../../packages/versions/src/index.js";
