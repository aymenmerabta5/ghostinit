import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  configureNextLoopbackStart,
  planNextLoopbackStart,
} from "../integration/e2e-next-listener-binding.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const direct = "bun ./node_modules/next/dist/bin/next start";
const rootPackage = (scripts: Record<string, string>) =>
  JSON.stringify({ name: "fixture", private: true, scripts });

describe("production E2E Next listener binding", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      for (const topology of ["web", "eve", "jobs", "eve-jobs"] as const) {
        test(`${mode}/${runtime}/${topology} configures direct Next scripts and preserves root supervision`, () => {
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: "listener-fixture",
              mode,
              runtime,
              framework: "nextjs",
              database: "postgres",
              apps: ["web"],
              preset: "custom",
              auth: false,
              api: false,
              email: false,
              analytics: false,
              eve: topology.includes("eve"),
              jobs: topology.includes("jobs"),
              billing: [],
              features: [],
              deploy: "none",
              messaging: false,
            }),
            { dryRun: true },
          );
          const source = (path: string) => {
            const content = files.find((file) => file.path === path)?.content;
            if (content === undefined) throw new Error("Missing generated manifest");
            return content;
          };
          const originalRoot = source("package.json");
          const originalWeb = mode === "monorepo" ? source("apps/web/package.json") : undefined;
          const edit = planNextLoopbackStart(originalRoot, originalWeb);
          expect(edit.path).toBe(mode === "monorepo" ? "apps/web/package.json" : "package.json");
          expect(edit.previousContent).toBe(originalWeb ?? originalRoot);
          const before = JSON.parse(edit.previousContent);
          const after = JSON.parse(edit.content);
          expect(Object.keys(after)).toEqual(Object.keys(before));
          for (const [name, value] of Object.entries(before.scripts)) {
            const isDirect =
              ["start", "start:web"].includes(name) &&
              [direct, "next start"].includes(String(value));
            expect(after.scripts[name]).toBe(
              isDirect ? `${String(value)} --hostname 127.0.0.1` : value,
            );
          }
          delete before.scripts;
          delete after.scripts;
          expect(after).toEqual(before);
          if (mode === "monorepo") expect(source("package.json")).toBe(originalRoot);
          else if (topology.includes("eve"))
            expect(JSON.parse(edit.content).scripts.start).toBe(
              JSON.parse(originalRoot).scripts.start,
            );
        });
      }
    }
  }

  test("rejects unknown, ambiguous, missing, and preconfigured command shapes", () => {
    const validWeb = rootPackage({ start: direct });
    const invalidScripts: Record<string, string>[] = [
      { start: "bun another-server.mjs" },
      { start: direct, "start:web": "next start" },
      { start: direct + " --hostname 0.0.0.0" },
      { start: "bun --env-file=.env.local run start:production", "start:web": direct },
      { start: direct, "start:production": "bun unexpected-supervisor.mjs" },
    ];
    for (const scripts of invalidScripts)
      expect(() => planNextLoopbackStart(rootPackage(scripts))).toThrow();
    expect(() =>
      planNextLoopbackStart(rootPackage({ start: "bun run --cwd apps/other start" }), validWeb),
    ).toThrow();
    expect(() =>
      planNextLoopbackStart(
        rootPackage({ start: "bun run --cwd apps/web start", "start:web": direct }),
        validWeb,
      ),
    ).toThrow();
    expect(() =>
      planNextLoopbackStart(
        rootPackage({ start: "bun run --cwd apps/web start" }),
        rootPackage({ start: "next dev" }),
      ),
    ).toThrow();
    expect(() => planNextLoopbackStart("{}")).toThrow();
    expect(() => planNextLoopbackStart('{"scripts":[]}')).toThrow();
  });

  test("commits the selected manifest before installation while preserving root orchestration", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-next-bind-"));
    roots.push(root);
    mkdirSync(join(root, "apps/web"), { recursive: true });
    const originalRoot = rootPackage({
      start: "bun --env-file=.env.local run start:production",
      "start:production": "bun scripts/start-production.mjs",
      "start:web": "bun run --cwd apps/web start",
      "start:eve": "bun apps/eve/.output/server/index.mjs",
    });
    writeFileSync(join(root, "package.json"), originalRoot);
    writeFileSync(
      join(root, "apps/web/package.json"),
      rootPackage({ start: direct, build: "next build" }),
    );
    await configureNextLoopbackStart(root);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(originalRoot);
    expect(JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8")).scripts).toEqual({
      start: direct + " --hostname 127.0.0.1",
      build: "next build",
    });
  });

  test("rejects invalid topology before writing any manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-next-bind-invalid-"));
    roots.push(root);
    mkdirSync(join(root, "apps/web"), { recursive: true });
    const originalRoot = rootPackage({ start: "bun unexpected.mjs" });
    const originalWeb = rootPackage({ start: direct });
    writeFileSync(join(root, "package.json"), originalRoot);
    writeFileSync(join(root, "apps/web/package.json"), originalWeb);
    await expect(configureNextLoopbackStart(root)).rejects.toThrow();
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(originalRoot);
    expect(readFileSync(join(root, "apps/web/package.json"), "utf8")).toBe(originalWeb);
  });
});
