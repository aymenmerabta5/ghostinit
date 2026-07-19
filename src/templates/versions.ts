/**
 * Re-export the GhostInit version registry so bundled templates can import it.
 *
 * Path points to real package at packages/versions/src/index.ts.
 * The .js extension is intentional - resolved & stripped by normalizeSourceImports
 * in the template bundler to produce correct relative imports in generated projects.
 * @see src/lib/normalizeSourceImports (regex stripping .js)
 */

export * from "../../packages/versions/src/index.js";
