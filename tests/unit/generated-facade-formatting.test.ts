import { describe, expect, test } from "bun:test";
import {
  resolveCreateConfig,
  type CreateResolutionInput,
} from "../../src/commands/create/resolution.js";
import {
  canonicalizeGenerationPlan,
  formatGenerationText,
} from "../../src/generation/plan-formatter.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import {
  requestApplicationFiles,
  type RequestApplicationSelection,
} from "../../src/templates/services/application.js";

const SCHEDULED_PROFILES: Pick<
  CreateResolutionInput,
  "name" | "framework" | "billing" | "features"
>[] = [
  {
    name: "next-dual",
    framework: "nextjs",
    billing: ["stripe", "chargily"],
    features: ["eve"],
  },
  {
    name: "next-all",
    framework: "nextjs",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve", "i18n"],
  },
  {
    name: "tanstack-all",
    framework: "tanstack-start",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve"],
  },
];

async function expectAlreadyCanonical(path: string, content: string): Promise<void> {
  expect(await formatGenerationText(path, content), path).toBe(content);
  const result = Bun.spawnSync(
    [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", path],
    {
      cwd: process.cwd(),
      stdin: new TextEncoder().encode(content),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  expect(new TextDecoder().decode(result.stdout), path).toBe(content);
}

describe("generated request facade is already formatter-clean", () => {
  for (const profile of SCHEDULED_PROFILES) {
    test(profile.name + " passes the scheduled check without a normalization step", async () => {
      const resolution = resolveCreateConfig({
        ...profile,
        runtime: "bun",
        mode: "monorepo",
        database: "postgres",
        databaseWasExplicit: true,
        apps: ["web"],
        preset: "saas",
        cache: "none",
        deploy: "none",
      });
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = await canonicalizeGenerationPlan(
        buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        }),
      );
      const facade = plan.files.find(
        ({ physicalPath }) => physicalPath === "packages/services/src/application/facade.ts",
      );
      expect(facade).toBeDefined();
      if (!facade) throw new Error("Scheduled profile has no request facade");
      await expectAlreadyCanonical(facade.physicalPath, facade.content);
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    test(mode + " keeps every optional facade shape formatter-clean", async () => {
      for (let bits = 0; bits < 32; bits += 1) {
        const selection: RequestApplicationSelection = {
          admin: (bits & 1) !== 0,
          identity: (bits & 2) !== 0,
          billing: (bits & 4) !== 0,
          messaging: (bits & 8) !== 0,
          notifications: (bits & 16) !== 0,
        };
        const facade = requestApplicationFiles(mode, selection, "").find(({ path }) =>
          path.endsWith("/facade.ts"),
        );
        if (!facade) throw new Error("Selected shape has no request facade");
        const canonical = await formatGenerationText(facade.path, facade.content);
        await expectAlreadyCanonical(facade.path, canonical);
      }
    });
  }
});
