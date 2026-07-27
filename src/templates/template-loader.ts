/**
 * Locate template source files at runtime.
 *
 * `dist/cli.js` is a bundle, so `import.meta.url` points at `dist/`, not
 * `src/templates/`. Any template that is read from disk (rather than inlined as a
 * string) must therefore search several candidate roots. `package.json` ships
 * `src/**\/*` alongside the bundle precisely so this works when installed.
 *
 * This used to live only in billing-generator.ts; database.ts had a naive
 * single-path loader that always failed once bundled, which silently produced a
 * `schema/billing.ts` barrel re-exporting `./tables/*` files that were never
 * emitted — a generated project that could not typecheck.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

export function templateCandidates(rel: string): string[] {
  const clean = rel.replace(/^\.\//, "");
  const list: string[] = [];
  const add = (p: string) => {
    if (!list.includes(p)) list.push(p);
  };

  // Running from src/templates directly.
  add(join(thisDir, rel));
  add(join(thisDir, clean));
  add(resolve(thisDir, rel));
  add(resolve(thisDir, clean));

  // Bundled: thisDir is dist/, and src/**/* ships beside it.
  add(join(thisDir, "../src/templates", clean));
  add(join(thisDir, "../src/templates", rel));
  add(join(thisDir, "../../src/templates", clean));
  add(join(thisDir, "../../src/templates", rel));

  // Running via `bun src/cli.ts` from the repo root.
  add(join(process.cwd(), "src/templates", clean));
  add(join(process.cwd(), "src/templates", rel));

  // Resolve against this file's absolute location (symlinked / global installs).
  add(resolve(thisFile, "../../src/templates", clean));
  add(resolve(thisFile, "../../src/templates", rel));
  add(resolve(thisDir, "../src/templates", clean));
  add(resolve(thisDir, "../src/templates", rel));

  return list;
}

export function findTemplateFile(rel: string): string | null {
  for (const p of templateCandidates(rel)) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore permission errors and keep searching
    }
  }
  return null;
}

/**
 * Remove pragmas that exist only so the HOST repo can compile the template.
 *
 * Templates like billing/schema/tables/*.ts are real `.ts` files in this repo,
 * so `tsc --noEmit` tries to typecheck them — but the host does not install
 * drizzle-orm, so they carry `// @ts-nocheck - template` to stay quiet.
 *
 * That marker was being copied verbatim into generated projects, which shipped
 * 20 files with typechecking disabled in code users are meant to edit. The
 * generated project DOES install drizzle, so it needs no suppression.
 *
 * Only the exact host-only marker is stripped; a bare `@ts-nocheck` that a
 * template genuinely wants in its output is left alone.
 */
export function stripHostOnlyPragmas(content: string): string {
  return content.replace(/^\/\/\s*@ts-nocheck\s*-\s*template.*\r?\n/gm, "");
}

/** Read a template file, or null when it cannot be located. */
export function tryLoadTemplate(rel: string): string | null {
  const found = findTemplateFile(rel);
  if (!found) return null;
  try {
    return stripHostOnlyPragmas(readFileSync(found, "utf-8"));
  } catch {
    return null;
  }
}

/** Read a template file, throwing a diagnostic listing every path tried. */
export function loadTemplate(rel: string): string {
  const found = findTemplateFile(rel);
  if (!found) {
    const tried = templateCandidates(rel).join("\n  - ");
    throw new Error(
      `[ghostinit] template not found: ${rel}\n` +
        `Tried:\n  - ${tried}\n` +
        `thisDir=${thisDir}\nthisFile=${thisFile}\ncwd=${process.cwd()}`,
    );
  }
  return stripHostOnlyPragmas(readFileSync(found, "utf-8"));
}
