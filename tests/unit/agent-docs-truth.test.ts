/**
 * The generated agent instructions must never contradict reality.
 *
 * GhostInit is an agent-first tool: the AGENTS.md / CLAUDE.md / .cursor / .windsurf
 * files it emits are read as authoritative by coding agents working in the
 * generated project. When they drift, an agent does not merely get confused — it
 * actively "fixes" the repo to match the wrong instructions.
 *
 * That is not hypothetical. These files previously claimed:
 *   - "TS 7.0.2"            (real pin: packages/versions typescript, 6.0.3)
 *   - "bunfig.toml hoist false"  (real generated bunfig: hoist = true)
 *
 * Both are the exact settings packages/versions/src/index.ts documents as
 * BREAKING Next.js 16 — the TS7 native port lacks lib/typescript.js and hoist=false
 * breaks workspace resolution. An agent told to "align the repo with AGENTS.md"
 * would have reintroduced the precise failure the project worked around.
 *
 * These assertions are cheap and they are the reason the doc strings are now
 * interpolated from the SSOT instead of hardcoded.
 */

import { describe, it, expect } from "bun:test";
import * as v from "../../packages/versions/src/index.js";
import { generateProjectFiles } from "../../src/templates/default";
import type { ProjectConfig } from "../../src/lib/config";

const AGENT_DOC_PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/ghostinit.mdc",
  ".windsurf/rules/ghostinit.md",
];

function cfg(partial: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

const CORNERS: Array<{ label: string; config: ProjectConfig }> = [
  { label: "monorepo/next", config: cfg({}) },
  { label: "monorepo/tanstack", config: cfg({ framework: "tanstack-start" }) },
  { label: "single/next", config: cfg({ mode: "single" }) },
  { label: "monorepo/convex+eve", config: cfg({ database: "convex", features: ["eve"] }) },
];

describe("generated agent instructions tell the truth", () => {
  for (const { label, config } of CORNERS) {
    describe(label, () => {
      const files = generateProjectFiles(config, { dryRun: false });
      const byPath = new Map(files.map((f) => [f.path, f.content]));
      const docs = AGENT_DOC_PATHS.map((p) => byPath.get(p)).filter(
        (c): c is string => typeof c === "string",
      );

      it("emits agent instruction files", () => {
        expect(docs.length).toBeGreaterThan(0);
      });

      it("interpolates every placeholder — no raw ${...} reaches the reader", () => {
        // Caught a real regression: converting the doc strings to use the versions
        // SSOT left several inside plain double-quoted literals, so agents were
        // shown the literal text "TS ${v.typescript.typescript}".
        for (const doc of docs) {
          expect(doc).not.toContain("${");
          expect(doc).not.toContain("__PROJECT_NAME__");
        }
      });

      it("never states a TypeScript version other than the pinned one", () => {
        for (const doc of docs) {
          const claims = [...doc.matchAll(/\bTS\s+(\d+\.\d+\.\d+)|typescript\s+(\d+\.\d+\.\d+)/gi)]
            .map((m) => m[1] ?? m[2])
            .filter(Boolean);
          for (const claimed of claims) {
            expect(claimed, `agent doc claims TypeScript ${claimed}`).toBe(v.typescript.typescript);
          }
        }
      });

      it("never tells an agent to set hoist=false in the generated project", () => {
        // The generated bunfig.toml is `hoist = true`; hoist=false is the HOST's
        // setting and breaks Next 16 TS resolution in the output.
        for (const doc of docs) {
          expect(doc.toLowerCase()).not.toContain("hoist false");
          expect(doc.toLowerCase()).not.toContain("hoist = false");
          expect(doc.toLowerCase()).not.toContain("hoist=false");
        }
      });

      it("agrees with the bunfig.toml it actually emits", () => {
        const bunfig = byPath.get("bunfig.toml");
        if (!bunfig) return;
        const hoistTrue = /hoist\s*=\s*true/.test(bunfig);
        for (const doc of docs) {
          if (!/hoist/i.test(doc)) continue;
          expect(hoistTrue, "bunfig says hoist=false but docs mention hoist").toBe(true);
        }
      });

      it("does not describe the wrong framework", () => {
        const isTanstack = config.framework === "tanstack-start";
        for (const doc of docs) {
          if (!isTanstack) continue;
          // A TanStack project's instructions must not present itself as Next.js.
          expect(doc).not.toContain("flat Next.js single");
        }
      });
    });
  }
});
