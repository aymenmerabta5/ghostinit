/**
 * No two composers may emit the same path with different content.
 *
 * Template composition collapses same-path emissions. Emitting a path twice is
 * legitimate when the content is identical (a composer overriding a default),
 * but two DIFFERENT bodies at one path means one implementation is discarded by
 * composition order and then rots undetected.
 *
 * This is not hypothetical, and it is specifically invisible to every other test
 * in this suite — including tests/unit/generation-matrix.test.ts, which parses
 * and resolves the OUTPUT and therefore only ever sees the version that won.
 * Two real bugs were found the moment the check was switched on:
 *
 *   - `api/webhooks/<provider>` was emitted by BOTH apps/api.ts (3.3KB) and
 *     billing/webhooks/providers/* (7.0KB) in all four billing corners. The
 *     apps/* copy lost, so a whole parallel webhook implementation had been
 *     dead for an unknown length of time.
 *   - `apps/web/tsconfig.json` was emitted by BOTH apps/tanstack-core.ts (647B,
 *     no @repo/* path table, no vite/client types) and apps-composer.ts (1704B)
 *     in every TanStack monorepo corner.
 *
 * generateProjectFiles throws on conflict, so a regression fails loudly here.
 */

import { describe, it, expect } from "bun:test";
import { dedupeFiles } from "../../src/templates/shared";
import { generateProjectFiles } from "../../src/templates/default";
import type { ProjectConfig } from "../../src/lib/config";

const MODES = ["monorepo", "single"] as const;
const FRAMEWORKS = ["nextjs", "tanstack-start"] as const;
const DATABASES = ["postgres", "convex", "none"] as const;

function cfg(over: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve", "i18n"],
    database: "postgres",
    framework: "nextjs",
    apps: ["web", "mobile"],
    ...over,
  } as ProjectConfig;
}

describe("template composition has no silent conflicts", () => {
  for (const mode of MODES) {
    for (const framework of FRAMEWORKS) {
      for (const database of DATABASES) {
        const label = `${mode}/${framework}/${database}`;
        it(`${label} generates without a composition conflict`, () => {
          const config = cfg({
            mode,
            framework,
            database,
            // billing requires a database; the parser rejects the combination.
            billing: database === "none" ? [] : ["stripe", "chargily", "paddle", "polar"],
          });
          expect(() => generateProjectFiles(config, { dryRun: false })).not.toThrow();
        });
      }
    }
  }

  it("dedupeFiles reports differing content and stays silent on identical duplicates", () => {
    const identical = dedupeFiles([
      { path: "a.ts", content: "same" },
      { path: "a.ts", content: "same" },
    ]);
    expect(identical.conflicts).toHaveLength(0);
    expect(identical.files).toHaveLength(1);

    const differing = dedupeFiles([
      { path: "a.ts", content: "one" },
      { path: "a.ts", content: "two" },
    ]);
    expect(differing.conflicts).toHaveLength(1);
    expect(differing.conflicts[0].path).toBe("a.ts");
    // Last-writer-wins is preserved so behaviour is unchanged; only the
    // reporting is new.
    expect(differing.files[0].content).toBe("two");
  });
});
