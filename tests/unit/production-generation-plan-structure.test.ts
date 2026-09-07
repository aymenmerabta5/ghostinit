import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as nodeDirname, join } from "node:path";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution";
import { getCapabilityScopedGlobalEnvKeys } from "../../src/generation/capability-environment-sanitizer";
import { parseFile } from "../../src/lib/architecture/parsers/imports";
import { buildProjectGenerationPlan } from "../../src/templates/default";

type CreateInput = Parameters<typeof resolveCreateConfig>[0];

const BASE_INPUT = {
  name: "production-plan-structure",
  runtime: "bun",
  mode: "monorepo",
  framework: "nextjs",
  billing: [],
  features: [],
  database: "none",
  databaseWasExplicit: true,
  apps: ["web"],
  preset: "custom",
  cache: "none",
  deploy: "none",
  withAuth: false,
  withApi: false,
  withEmail: false,
  withAnalytics: false,
  withEve: false,
  withI18n: false,
  withPdf: false,
  withMessaging: false,
  withStorage: false,
  withNotifications: false,
  featureFlags: "none",
  withJobs: false,
} satisfies CreateInput;

function productionPlan(overrides: Partial<CreateInput> = {}) {
  const resolution = resolveCreateConfig({ ...BASE_INPUT, ...overrides });
  if (!resolution.ok) throw new Error(resolution.message);
  return {
    plan: buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    }),
    resolved: resolution.resolvedConfig,
  };
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function dirname(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function moduleCandidates(path: string): string[] {
  const candidates = [path];
  const withoutJs = path.replace(/\.[cm]?js$/, "");
  if (withoutJs !== path) candidates.push(withoutJs);
  if (!/\.(?:[cm]?[jt]sx?|css|json|d\.ts)$/.test(path)) {
    for (const extension of [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".d.ts"]) {
      candidates.push(`${path}${extension}`, `${path}/index${extension}`);
      if (withoutJs !== path)
        candidates.push(`${withoutJs}${extension}`, `${withoutJs}/index${extension}`);
    }
  } else if (withoutJs !== path) {
    candidates.push(`${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}.d.ts`);
  }
  return [...new Set(candidates)];
}

function unresolvedRelativeImports(plan: ReturnType<typeof productionPlan>["plan"]): string[] {
  const emitted = new Set(plan.files.map(({ physicalPath }) => physicalPath));
  const unresolved: string[] = [];
  for (const file of plan.files) {
    if (!/\.[cm]?[jt]sx?$/.test(file.physicalPath)) continue;
    const references = parseFile(file.content, file.physicalPath).importReferences;
    for (const reference of references) {
      if (!reference.specifier.startsWith(".")) continue;
      const specifier = reference.specifier.split("?")[0] ?? reference.specifier;
      const target = normalize(`${dirname(file.physicalPath)}/${specifier}`);
      if (target.endsWith("routeTree.gen")) continue;
      if (!moduleCandidates(target).some((candidate) => emitted.has(candidate))) {
        unresolved.push(`${file.physicalPath} -> ${reference.specifier}`);
      }
    }
  }
  return unresolved.sort();
}

const OFF_CORNERS: readonly { label: string; input: Partial<CreateInput> }[] = [
  {
    label: "monorepo-next-all-apps",
    input: { mode: "monorepo", framework: "nextjs", apps: ["web", "mobile", "desktop"] },
  },
  {
    label: "monorepo-tanstack-all-apps",
    input: {
      mode: "monorepo",
      framework: "tanstack-start",
      apps: ["web", "mobile", "desktop"],
    },
  },
  { label: "single-next-web", input: { mode: "single", framework: "nextjs", apps: ["web"] } },
  {
    label: "single-tanstack-web",
    input: { mode: "single", framework: "tanstack-start", apps: ["web"] },
  },
  { label: "single-mobile", input: { mode: "single", framework: "nextjs", apps: ["mobile"] } },
  { label: "single-desktop", input: { mode: "single", framework: "nextjs", apps: ["desktop"] } },
];

const LINT_CORNERS: readonly { label: string; input: Partial<CreateInput> }[] = [
  { label: "monorepo-next", input: { mode: "monorepo", framework: "nextjs", apps: ["web"] } },
  {
    label: "monorepo-tanstack",
    input: { mode: "monorepo", framework: "tanstack-start", apps: ["web"] },
  },
  { label: "single-next", input: { mode: "single", framework: "nextjs", apps: ["web"] } },
  {
    label: "single-tanstack",
    input: { mode: "single", framework: "tanstack-start", apps: ["web"] },
  },
];

describe("production GenerationPlan structure", () => {
  for (const corner of OFF_CORNERS) {
    test(`${corner.label} parses, closes relative imports, and has no disabled residue`, () => {
      const { plan, resolved } = productionPlan(corner.input);
      expect(resolved.enabledCapabilities, corner.label).toEqual([]);

      for (const file of plan.files) {
        if (!/\.[cm]?[jt]sx?$/.test(file.physicalPath)) continue;
        expect(parseSync(file.physicalPath, file.content).errors, file.physicalPath).toEqual([]);
      }
      expect(unresolvedRelativeImports(plan), corner.label).toEqual([]);
      const turboFile = plan.files.find(({ physicalPath }) => physicalPath === "turbo.json");
      if (resolved.mode === "monorepo") {
        const globalEnv = (JSON.parse(turboFile?.content ?? "{}") as { globalEnv?: string[] })
          .globalEnv;
        expect(globalEnv, `${corner.label} globalEnv`).toEqual(
          getCapabilityScopedGlobalEnvKeys(resolved),
        );
      } else {
        expect(
          turboFile,
          `${corner.label} must not emit a monorepo Turbo manifest`,
        ).toBeUndefined();
      }

      const paths = plan.files.map(({ physicalPath }) => physicalPath);
      expect(paths, corner.label).not.toContain("src/lib/access.ts");
      expect(paths, corner.label).not.toContain("src/lib/storage.ts");
      expect(paths, corner.label).not.toContain("packages/database/src/schema/posts.ts");
      expect(paths, corner.label).not.toContain("packages/database/src/schema/enums.ts");
    });
  }

  test("all-off monorepo and single config surfaces are oxlint-clean", () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-production-plan-lint-"));
    const generatedPaths: string[] = [];
    try {
      for (const corner of LINT_CORNERS) {
        const { plan } = productionPlan(corner.input);
        const configs = plan.files.filter(({ physicalPath }) =>
          /^(?:packages\/config\/src|src\/lib\/env)\/(?:server-schema|server|next|vite|expo)\.ts$/.test(
            physicalPath,
          ),
        );
        expect(configs).toHaveLength(5);
        for (const config of configs) {
          const hasZodImport = /^import\s*\{[^}]*\bz\b[^}]*\}\s*from\s*["']zod["'];?/m.test(
            config.content,
          );
          expect(hasZodImport, `${corner.label}/${config.physicalPath}`).toBe(
            /\bz\s*\./.test(config.content),
          );
          const target = join(root, corner.label, ...config.physicalPath.split("/"));
          mkdirSync(nodeDirname(target), { recursive: true });
          writeFileSync(target, config.content, "utf8");
          generatedPaths.push(target);
        }
      }

      const lint = Bun.spawnSync(
        [process.execPath, "x", "--no-install", "oxlint", "--deny-warnings", ...generatedPaths],
        { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
      );
      const output = `${lint.stdout.toString()}\n${lint.stderr.toString()}`;
      expect(lint.exitCode, output).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("translation catalogs retain i18n provenance instead of messaging provenance", () => {
    const { plan } = productionPlan({
      mode: "monorepo",
      framework: "nextjs",
      apps: ["web", "mobile", "desktop"],
      withI18n: true,
    });
    const catalogs = plan.files.filter(({ physicalPath }) =>
      /\/messages\/[^/]+\.json$/.test(physicalPath),
    );

    expect(catalogs.length).toBeGreaterThan(0);
    for (const catalog of catalogs) {
      expect(catalog.provenance.capability, catalog.physicalPath).toBe("i18n");
    }
  });

  test("authenticated transport keeps shared rate-limit environment surfaces without cache", () => {
    const { plan, resolved } = productionPlan({
      database: "postgres",
      preset: "custom",
      withAuth: true,
      withApi: true,
    });
    expect(resolved.capabilities.cache.enabled).toBe(false);
    const content = (path: string) =>
      plan.files.find(({ physicalPath }) => physicalPath === path)?.content ?? "";
    const combined = [
      content(".env.example"),
      content(".env.local"),
      content("packages/config/src/server-schema.ts"),
      content("packages/config/src/server.ts"),
    ].join("\n");
    const globalEnv = (JSON.parse(content("turbo.json")) as { globalEnv?: readonly string[] })
      .globalEnv;

    for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
      expect(combined, key).toContain(key);
      expect(globalEnv, key).toContain(key);
    }
    expect(globalEnv).toEqual(getCapabilityScopedGlobalEnvKeys(resolved));
  });

  test("agent instruction documents stay core when Eve is enabled", () => {
    const { plan } = productionPlan({
      database: "postgres",
      preset: "saas",
      withAuth: true,
      withApi: true,
      withEmail: true,
      withAnalytics: true,
      withEve: true,
      features: ["eve"],
    });
    const agents = plan.files.find(({ physicalPath }) => physicalPath === "AGENTS.md");

    expect(agents).toBeDefined();
    expect(agents?.provenance.capability).toBeNull();
  });
});
