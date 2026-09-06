import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { CORNERS, generatedProjectName } from "../../scripts/test-generated.js";
import { parseCreateSpecific, parseRawArgs } from "../../src/cli/args.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { GenerationPlan } from "../../src/domain/generation/types.js";
import {
  canonicalizeGenerationPlan,
  formatGenerationText,
  isGenerationFormatPath,
} from "../../src/generation/plan-formatter.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Corner = (typeof CORNERS)[number];

const firstPassCache = new Map<string, Promise<string>>();
const nextPassCache = new Map<string, Promise<string>>();
const planCache = new Map<string, Promise<GenerationPlan>>();

function cachedFormat(
  cache: Map<string, Promise<string>>,
  path: string,
  content: string,
): Promise<string> {
  const key = path + "\0" + content;
  let result = cache.get(key);
  if (!result) {
    result = formatGenerationText(path, content);
    cache.set(key, result);
  }
  return result;
}

async function createFirstFormattedPlan(corner: Corner): Promise<GenerationPlan> {
  const name = generatedProjectName(corner.id);
  const parsed = parseRawArgs([
    process.execPath,
    "./dist/cli.js",
    "create",
    name,
    "--yes",
    "--no-install",
    "--runtime",
    "bun",
    ...corner.args,
  ]);
  const options = parseCreateSpecific(parsed.values, parsed.command);
  const runtime = parsed.values.runtime;
  if (runtime !== "node" && runtime !== "bun") throw new Error("Invalid release-corner runtime");
  const resolution = resolveCreateConfig({
    ...options,
    name,
    runtime,
    databaseWasExplicit: Array.isArray(parsed.values.database)
      ? parsed.values.database.length > 0
      : Boolean(parsed.values.database),
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return canonicalizeGenerationPlan(
    buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    }),
    (path, content) => cachedFormat(firstPassCache, path, content),
  );
}

function firstFormattedPlan(corner: Corner): Promise<GenerationPlan> {
  let result = planCache.get(corner.id);
  if (!result) {
    result = createFirstFormattedPlan(corner);
    planCache.set(corner.id, result);
  }
  return result;
}

describe("first production formatting pass", () => {
  for (const corner of CORNERS) {
    test(
      corner.id + " is already canonical across every generated format path",
      async () => {
        const plan = await firstFormattedPlan(corner);
        const mismatches: string[] = [];
        let eligibleFiles = 0;
        for (const file of plan.files) {
          if (!isGenerationFormatPath(file.physicalPath)) continue;
          eligibleFiles += 1;
          // Compare only: never replace the first production pass with normalized output.
          const nextPass = await cachedFormat(nextPassCache, file.physicalPath, file.content);
          if (nextPass !== file.content) mismatches.push(file.physicalPath);
        }
        expect(eligibleFiles, corner.id).toBeGreaterThan(0);
        expect(mismatches, corner.id).toEqual([]);
      },
      60_000,
    );
  }

  const cliControls = [
    { corner: "next-convex", path: "packages/api/src/adapters/storage/convex.ts" },
    { corner: "single-convex", path: "src/server/adapters/storage/convex.ts" },
    { corner: "cloudflare-next-monorepo", path: "apps/desktop/src/preload.ts" },
  ];
  for (const control of cliControls) {
    test(
      control.corner + " " + control.path + " agrees with the pinned CLI",
      async () => {
        const corner = CORNERS.find(({ id }) => id === control.corner);
        if (!corner) throw new Error("Required formatter-control corner is missing");
        const plan = await firstFormattedPlan(corner);
        const file = plan.files.find(({ physicalPath }) => physicalPath === control.path);
        if (!file) throw new Error("Required formatter-control file is missing");
        const result = spawnSync(
          process.execPath,
          ["x", "--no-install", "oxfmt", "--stdin-filepath", file.physicalPath],
          {
            cwd: process.cwd(),
            input: file.content,
            encoding: "utf8",
            timeout: 30_000,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
          },
        );
        expect(result.error, control.path).toBeUndefined();
        expect(result.status, control.path).toBe(0);
        expect(result.stdout === file.content, control.path).toBe(true);
      },
      60_000,
    );
  }
});
