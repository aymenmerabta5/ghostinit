// @allow-long 340: deterministic plan, dry-run, sequencing, state, and compatibility regressions share fixtures
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runtime } from "../../packages/versions/src/index.js";
import type { ProjectRendererPort } from "../../src/application/ports/project-renderer";
import { GenerationPlanError } from "../../src/domain/generation";
import { PROJECT_CONFIG_SCHEMA_URI, resolveProjectConfig } from "../../src/domain/project";
import { aggregateGenerationPlan } from "../../src/generation/aggregate";
import { emitLegacyTemplateTarget } from "../../src/generation/legacy-template-adapter";
import {
  compileLegacyTemplateTarget,
  LegacyRendererCompatibilityError,
  RESOLVED_TEMPLATE_RENDERER_ID,
} from "../../src/generation/resolved-template-compiler";
import { projectRendererRegistry } from "../../src/generation/renderer-registry";
import { runProjectInstall, type InstallerDependencies } from "../../src/commands/create/installer";
import { resolveCreateConfig } from "../../src/commands/create/resolution";
import { Logger } from "../../src/lib/logger";
import { loadState } from "../../src/lib/state";
import { buildProjectGenerationPlan, serializeGenerationPlan } from "../../src/templates/default";
import type { GlobalOptions } from "../../src/commands/types";

const worktree = resolve(import.meta.dir, "../..");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function resolvedFixture(
  providers: Array<"stripe" | "chargily"> = ["stripe"],
  apps: Array<"web" | "mobile"> = ["web"],
) {
  const resolution = resolveCreateConfig({
    name: "plan-fixture",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    billing: providers,
    features: [],
    database: "postgres",
    databaseWasExplicit: true,
    apps,
    preset: "saas",
    cache: "none",
    deploy: "none",
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return resolution;
}

function options(root: string, dryRun: boolean): GlobalOptions {
  return {
    cwd: root,
    json: false,
    yes: true,
    force: true,
    dryRun,
    noInstall: true,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

describe("V2 GenerationPlan production pipeline", () => {
  test("keeps the legacy bridge as a pure emitter behind the resolved compiler", () => {
    const fixture = resolvedFixture();
    const target = compileLegacyTemplateTarget(fixture.resolvedConfig);
    expect(Object.isFrozen(target)).toBe(true);
    expect(Object.isFrozen(target.config)).toBe(true);
    expect(Object.isFrozen(target.addons)).toBe(true);
    expect(target.config.name).toBe(fixture.resolvedConfig.name);
    expect(emitLegacyTemplateTarget(target)).toEqual(emitLegacyTemplateTarget(target));
    expect(projectRendererRegistry().map(({ id }) => id)).toEqual([RESOLVED_TEMPLATE_RENDERER_ID]);

    const adapterSource = readFileSync(
      join(worktree, "src/generation/legacy-template-adapter.ts"),
      "utf8",
    );
    expect(adapterSource).not.toContain("ResolvedProjectConfig");
    expect(adapterSource).not.toContain("sanitizeLegacyCapabilityOutput");
    expect(adapterSource).not.toContain("PlannedFileInput");
    expect(adapterSource).not.toContain("capabilityForPath");
    expect(adapterSource).not.toContain("ownerForPath");
    expect(adapterSource).not.toContain("lifecycleForPath");
    const compilerSource = readFileSync(
      join(worktree, "src/generation/resolved-template-compiler.ts"),
      "utf8",
    );
    expect(compilerSource).toContain("SELF_ISSUED_SECRET_POLICIES");
    expect(compilerSource).toContain("EXTERNAL_SECRET_POLICIES");
    expect(compilerSource).not.toContain("function externalProvider");
    expect(compilerSource).not.toContain("function referenceSuffix");

    const plan = buildProjectGenerationPlan(fixture.resolvedConfig, {
      desiredConfig: fixture.desiredConfig,
    });
    expect(
      new Set(
        plan.files
          .filter(({ physicalPath }) => physicalPath !== "ghostinit.config.json")
          .map(({ provenance }) => provenance.renderer),
      ),
    ).toEqual(new Set([RESOLVED_TEMPLATE_RENDERER_ID]));
  });

  test("compiles immutable resolved capabilities into fully attributed plans across the matrix", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["none", "postgres", "convex"] as const) {
          const persistent = database !== "none";
          const resolution = resolveCreateConfig({
            name: `compiler-${mode}-${framework}-${database}`,
            runtime: "bun",
            mode,
            framework,
            billing: persistent ? ["stripe"] : [],
            features: [],
            database,
            databaseWasExplicit: true,
            apps: ["web"],
            preset: "custom",
            cache: "none",
            deploy: "none",
            withAuth: persistent,
            withApi: persistent,
            withEmail: persistent,
            withNotifications: persistent,
          });
          expect(resolution.ok, `${mode}/${framework}/${database}`).toBe(true);
          if (!resolution.ok) continue;
          expect(Object.isFrozen(resolution.resolvedConfig)).toBe(true);

          const target = compileLegacyTemplateTarget(resolution.resolvedConfig);
          expect(target.config.auth).toBe(resolution.resolvedConfig.capabilities.auth);
          expect(target.config.api).toBe(resolution.resolvedConfig.capabilities.transport);
          expect(target.config.notifications).toBe(
            resolution.resolvedConfig.capabilities.notifications,
          );
          const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
            desiredConfig: resolution.desiredConfig,
          });
          expect(
            buildProjectGenerationPlan(resolution.resolvedConfig, {
              desiredConfig: resolution.desiredConfig,
            }).planHash,
          ).toBe(plan.planHash);

          const paths = new Set(plan.files.map(({ physicalPath }) => physicalPath));
          for (const file of plan.files) {
            expect(file.owner, file.physicalPath).toBeTruthy();
            expect(file.lifecycle, file.physicalPath).toBeTruthy();
            expect(file.provenance, file.physicalPath).toBeDefined();
            expect(file.provenance.renderer, file.physicalPath).not.toContain(
              "legacy-template-adapter",
            );
            expect(file.provenance.acceptance.length, file.physicalPath).toBeGreaterThan(0);
            expect(file.provenance.contribution.length, file.physicalPath).toBeGreaterThan(0);
          }
          if (!persistent) {
            expect(
              plan.files.some(({ provenance }) =>
                provenance.contribution.includes("resolved-output-normalization.v2"),
              ),
            ).toBe(true);
          }
          expect(new Set(plan.secrets.map(({ reference }) => reference)).size).toBe(
            plan.secrets.length,
          );
          for (const secret of plan.secrets) {
            if (secret.kind === "require-external") {
              expect(secret.provider).not.toBe("external");
            }
            for (const destination of secret.destinations) {
              expect(paths.has(destination.physicalPath), destination.physicalPath).toBe(true);
            }
          }
        }
      }
    }
  });

  test("is stable across repeats, input order, and a separate process", () => {
    const first = resolvedFixture(["stripe"], ["web", "mobile"]);
    const second = resolvedFixture(["stripe"], ["mobile", "web"]);
    const firstPlan = buildProjectGenerationPlan(first.resolvedConfig, {
      desiredConfig: first.desiredConfig,
    });
    const repeated = buildProjectGenerationPlan(first.resolvedConfig, {
      desiredConfig: first.desiredConfig,
    });
    const reordered = buildProjectGenerationPlan(second.resolvedConfig, {
      desiredConfig: second.desiredConfig,
    });
    expect(repeated).toEqual(firstPlan);
    expect(reordered.planHash).toBe(firstPlan.planHash);
    expect(reordered.projectConfigHash).toBe(firstPlan.projectConfigHash);

    const script = `
      import { resolveCreateConfig } from "./src/commands/create/resolution.ts";
      import { buildProjectGenerationPlan } from "./src/templates/default.ts";
      const result = resolveCreateConfig({name:"plan-fixture",runtime:"bun",mode:"monorepo",framework:"nextjs",billing:["stripe"],features:[],database:"postgres",databaseWasExplicit:true,apps:["mobile","web"],preset:"saas",cache:"none",deploy:"none"});
      if (!result.ok) throw new Error(result.message);
      process.stdout.write(buildProjectGenerationPlan(result.resolvedConfig,{desiredConfig:result.desiredConfig}).planHash);
    `;
    const child = spawnSync(process.execPath, ["-e", script], {
      cwd: worktree,
      encoding: "utf8",
    });
    expect(child.status, child.error?.message ?? child.stderr).toBe(0);
    expect(child.stdout).toBe(firstPlan.planHash);
  });

  test("keeps canonical Bun package management while retaining Node execution semantics", () => {
    const resolution = resolveCreateConfig({
      name: "node-plan",
      runtime: "node",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "docker",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.desiredConfig.packageManager).toEqual({
      name: "bun",
      version: runtime.bun,
    });
    expect(resolution.resolvedConfig.packageManager).toEqual({
      name: "bun",
      version: runtime.bun,
    });
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    const rootPackage = plan.files.find(({ physicalPath }) => physicalPath === "package.json");
    expect(rootPackage).toBeDefined();
    expect(JSON.parse(rootPackage!.content).packageManager).toBe(`bun@${runtime.bun}`);
    expect(JSON.parse(rootPackage!.content).devDependencies["bun-types"]).toBe(runtime.bun);
    expect(JSON.parse(rootPackage!.content).engines).toEqual({
      bun: runtime.bun,
      node: `${runtime.node.split(".")[0]}.x`,
    });
    const dockerfile = plan.files.find(({ physicalPath }) => physicalPath === "Dockerfile");
    expect(dockerfile?.content).toContain(`FROM oven/bun:${runtime.bun} AS bun-runtime`);
    expect(dockerfile?.content).toContain(`FROM node:${runtime.node}-bookworm-slim`);
    expect(dockerfile?.content).toContain("COPY . .");
    expect(dockerfile?.content).toContain("bunfig.toml");
    expect(dockerfile?.content).not.toContain("COPY --parents");
    expect(dockerfile?.content).toContain('CMD ["bun", "run", "start"]');
    for (const manifest of plan.files.filter(({ physicalPath }) =>
      physicalPath.endsWith("package.json"),
    )) {
      const parsed = JSON.parse(manifest.content);
      if (parsed.packageManager !== undefined) {
        expect(parsed.packageManager, manifest.physicalPath).toBe(`bun@${runtime.bun}`);
      }
    }
    for (const file of plan.files.filter(({ physicalPath }) =>
      /\.(?:test|spec)\.tsx?$/.test(physicalPath),
    )) {
      expect(file.content, file.physicalPath).not.toContain('from "vitest"');
    }
    for (const candidate of [plan, buildProjectGenerationPlan(resolvedFixture().resolvedConfig)]) {
      for (const file of candidate.files) {
        expect(file.content, file.physicalPath).not.toMatch(
          /npm (?:install|run)|npm@|["']packageManager["']\s*:\s*["']npm/i,
        );
      }
    }
  });

  test("rejects desired project names that the renderer cannot represent", () => {
    const base = resolvedFixture().desiredConfig;
    for (const name of ["foo.bar", "foo_bar", "1foo", "foo-", "foo--bar"]) {
      const result = resolveProjectConfig({ ...base, name });
      expect(result.ok, name).toBe(false);
      if (!result.ok) {
        expect(
          result.issues.map(({ code }) => code),
          name,
        ).toContain("invalid-project-name");
      }
    }
  });

  test("plans notification token protection as a post-verification secret reference", () => {
    const resolution = resolveCreateConfig({
      name: "notification-secret",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "none",
      withNotifications: true,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    const operation = plan.secrets.find(
      ({ reference }) => reference === "notifications.token-encryption-key",
    );
    expect(operation).toEqual(
      expect.objectContaining({
        kind: "generate-self-issued",
        environmentKey: "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
        bytes: 32,
        encoding: "base64url",
      }),
    );
    const env = plan.files.find(({ physicalPath }) => physicalPath === ".env.local");
    expect(env?.content).toContain(
      "NOTIFICATION_TOKEN_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64URL_KEY",
    );
  });

  test("plans Eve facade authentication as a post-verification self-issued secret", () => {
    const resolution = resolveCreateConfig({
      name: "eve-secret",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: ["eve"],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "none",
      withEve: true,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    expect(plan.secrets.find(({ reference }) => reference === "eve.internal-auth-secret")).toEqual(
      expect.objectContaining({
        kind: "generate-self-issued",
        environmentKey: "EVE_INTERNAL_AUTH_SECRET",
        bytes: 32,
        encoding: "base64url",
      }),
    );
    const env = plan.files.find(({ physicalPath }) => physicalPath === ".env.local");
    expect(env?.content).toContain(
      "EVE_INTERNAL_AUTH_SECRET=REPLACE_WITH_A_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
    );
  });

  test("rejects even byte-identical physical writers from distinct owners", () => {
    const config = resolvedFixture().resolvedConfig;
    const renderer = (id: string, owner: "domain" | "application"): ProjectRendererPort => ({
      id,
      render: () => ({
        files: [
          {
            logicalPath: `${owner}/shared.ts`,
            physicalPath: "src/shared.ts",
            content: "export const shared = true;\n",
            owner,
            lifecycle: "generator-owned",
            provenance: {
              renderer: id,
              source: `tests/${id}`,
              capability: null,
              acceptance: ["project.render.v2"],
              contribution: [`tests.${owner}.v2`],
            },
          },
        ],
        secrets: [],
      }),
    });
    expect(() =>
      aggregateGenerationPlan({
        config,
        renderers: [renderer("tests.domain", "domain"), renderer("tests.app", "application")],
      }),
    ).toThrow(GenerationPlanError);
  });

  test("does not invent capability or operation provenance for core files", () => {
    const fixture = resolvedFixture([]);
    const plan = buildProjectGenerationPlan(fixture.resolvedConfig, {
      desiredConfig: fixture.desiredConfig,
    });
    const probes = [
      "AGENTS.md",
      "apps/web/src/components/header.tsx",
      "packages/ui/src/contract.ts",
    ];
    for (const path of probes) {
      const file = plan.files.find(({ physicalPath }) => physicalPath === path);
      expect(file, path).toBeDefined();
      expect(file?.provenance.capability, path).toBeNull();
      expect(file?.provenance.acceptance, path).toEqual(["project.render.v2"]);
    }
    expect(plan.files.find(({ physicalPath }) => physicalPath === "AGENTS.md")?.owner).toBe(
      "documentation",
    );
    expect(
      plan.files.find(({ physicalPath }) => physicalPath === "packages/ui/src/contract.ts")?.owner,
    ).toBe("ui");
  });

  test("attributes messaging-implied storage and rejects an inconsistent resolved graph", () => {
    const resolved = resolveProjectConfig({
      $schema: PROJECT_CONFIG_SCHEMA_URI,
      schemaVersion: 2,
      name: "messaging-provenance",
      mode: "monorepo",
      packageManager: { name: "bun", version: runtime.bun },
      apps: [{ id: "web", target: "nextjs", deploy: "none" }],
      backend: { hostApp: "web", executionRuntime: "bun", database: "postgres" },
      capabilities: { messaging: true },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
    const plan = buildProjectGenerationPlan(resolved.config);
    for (const path of [
      "packages/services/src/storage/policy.ts",
      "packages/api/src/storage/contract.ts",
      "packages/api/src/adapters/storage/postgres.ts",
      "apps/web/src/features/storage/mutations.ts",
    ]) {
      expect(
        plan.files.find((file) => file.physicalPath === path)?.provenance.capability,
        path,
      ).toBe("storage");
    }

    const inconsistent = {
      ...resolved.config,
      capabilities: { ...resolved.config.capabilities, storage: false },
      enabledCapabilities: resolved.config.enabledCapabilities.filter(
        (capability) => capability !== "storage",
      ),
    };
    expect(() => buildProjectGenerationPlan(inconsistent)).toThrow(
      LegacyRendererCompatibilityError,
    );
    expect(() => buildProjectGenerationPlan(inconsistent)).toThrow(/disabled storage output/);
  });

  test("removes disabled feature clients, runtime config, environment values, and secret work", () => {
    const forbiddenPath =
      /(?:NotificationBell|use-notifications|feature-flags|use-logout|components\/ui\/chat|components\/shell|services\/invoice|modules\/(?:src|tests)\/identity|kernel\/src\/(?:admin|billing)|schema\/billing)/i;
    const forbiddenEnvironmentKeys = [
      "AI_GATEWAY_API_KEY",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "CHARGILY_API_KEY",
      "EVE_INTERNAL_AUTH_SECRET",
      "FEATURE_FLAG_TIMEOUT_MS",
      "GITHUB_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "JOB_WORKER_ID",
      "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
      "PADDLE_API_KEY",
      "POLAR_ACCESS_TOKEN",
      "POSTHOG_API_KEY",
      "S3_SECRET_ACCESS_KEY",
      "STORAGE_DRIVER",
      "STRIPE_SECRET_KEY",
      "UPSTASH_REDIS_REST_TOKEN",
    ] as const;

    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const resolution = resolveCreateConfig({
          name: `disabled-${mode}-${framework}`,
          runtime: "bun",
          mode,
          framework,
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
        });
        expect(resolution.ok, `${mode}/${framework}`).toBe(true);
        if (!resolution.ok) continue;
        expect(resolution.resolvedConfig.enabledCapabilities).toEqual([]);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const label = `${mode}/${framework}`;
        const paths = plan.files.map(({ physicalPath }) => physicalPath);
        expect(
          paths.filter((path) => forbiddenPath.test(path)),
          label,
        ).toEqual([]);
        expect(
          paths.filter((path) => /(?:app|routes)\/(?:forbidden|unauthorized)\.tsx$/.test(path)),
          label,
        ).toEqual([]);

        const configRoot = mode === "monorepo" ? "packages/config/src" : "src/lib/env";
        const selectedPublic = framework === "nextjs" ? "next" : "vite";
        const runtimeConfig = [
          `${configRoot}/server-schema.ts`,
          `${configRoot}/server.ts`,
          `${configRoot}/${selectedPublic}.ts`,
        ]
          .map(
            (path) => plan.files.find(({ physicalPath }) => physicalPath === path)?.content ?? "",
          )
          .join("\n");
        const environment = [".env.example", ".env.local"]
          .map(
            (path) => plan.files.find(({ physicalPath }) => physicalPath === path)?.content ?? "",
          )
          .join("\n");
        const turbo = JSON.parse(
          plan.files.find(({ physicalPath }) => physicalPath === "turbo.json")?.content ?? "{}",
        ) as { globalEnv?: string[] };
        const testEnvironment =
          plan.files.find(({ physicalPath }) => physicalPath === "scripts/test-env.ts")?.content ??
          "";
        const testValues = testEnvironment.slice(testEnvironment.indexOf("const testEnvironment:"));

        expect(runtimeConfig, `${label} orphan Upstash helper`).not.toContain(
          "unconfiguredUpstashValue",
        );

        for (const key of forbiddenEnvironmentKeys) {
          expect(runtimeConfig, `${label} runtime ${key}`).not.toContain(key);
          expect(environment, `${label} dotenv ${key}`).not.toMatch(new RegExp(`^${key}=`, "m"));
          expect(turbo.globalEnv ?? [], `${label} turbo ${key}`).not.toContain(key);
          expect(testValues, `${label} tests ${key}`).not.toMatch(new RegExp(`^\\s+${key}:`, "m"));
        }
        expect(plan.secrets, label).toEqual([]);

        if (mode === "monorepo") {
          const databaseSurface = [
            "packages/database/src/index.ts",
            "packages/database/src/schema/index.ts",
          ]
            .map(
              (path) => plan.files.find(({ physicalPath }) => physicalPath === path)?.content ?? "",
            )
            .join("\n");
          expect(databaseSurface, label).not.toMatch(
            /\b(?:users|sessions|checkouts|subscriptions|webhook_events)\b/,
          );
        }
      }
    }
  });

  test("dry-run touches no effect adapter, clock, entropy, root, lock, or process", async () => {
    const fixture = resolvedFixture();
    const root = join(tmpdir(), `ghostinit-plan-dry-${process.pid}-absent`);
    rmSync(root, { recursive: true, force: true });
    let calls = 0;
    const forbidden = () => {
      calls += 1;
      throw new Error("dry-run invoked an effect adapter");
    };
    const effects = {
      checkGitStatus: forbidden,
      assertCleanGit: forbidden,
      acquireLock: forbidden,
      createTransaction: forbidden,
      readFile: forbidden,
      loadState: forbidden,
      saveState: forbidden,
      runInstall: forbidden,
      runFormat: forbidden,
      runVerification: forbidden,
      createSecretMaterializer: forbidden,
    } as unknown as Partial<InstallerDependencies>;
    const originalNow = Date.now;
    Date.now = () => {
      throw new Error("dry-run consulted the clock");
    };
    try {
      const result = await runProjectInstall(
        {
          projectName: fixture.config.name,
          projectRoot: root,
          desiredConfig: fixture.desiredConfig,
          resolvedConfig: fixture.resolvedConfig,
          options: options(root, true),
          noInstall: true,
        },
        effects,
      );
      expect(result.isDryRun).toBe(true);
      expect(result.plan.planHash).toHaveLength(64);
      expect(calls).toBe(0);
      expect(existsSync(root)).toBe(false);
      for (const operation of result.plan.secrets) {
        expect(Object.prototype.hasOwnProperty.call(operation, "value")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(operation, "materializedValue")).toBe(false);
      }
      expect(JSON.parse(serializeGenerationPlan(result.plan))).toEqual(result.plan);
    } finally {
      Date.now = originalNow;
    }
  });

  test("publishes a new project only after its private sibling candidate succeeds", async () => {
    const fixture = resolvedFixture();
    const root = join(tmpdir(), `ghostinit-plan-publish-${process.pid}-${Date.now()}`);
    rmSync(root, { recursive: true, force: true });
    roots.push(root);
    let candidateRoot = "";
    let released = false;
    const result = await runProjectInstall(
      {
        projectName: fixture.config.name,
        projectRoot: root,
        desiredConfig: fixture.desiredConfig,
        resolvedConfig: fixture.resolvedConfig,
        options: options(root, false),
        noInstall: true,
        requireAbsentTarget: true,
      },
      {
        checkGitStatus: async (candidate) => {
          candidateRoot = candidate;
          return { isRepo: false, dirty: false, untracked: [], modified: [] };
        },
        assertCleanGit: () => undefined,
        acquireLock: async () => ({
          owner: { pid: 1, startTime: "2026-01-01T00:00:00.000Z" },
          release: async () => {
            released = true;
          },
        }),
        createTransaction: () =>
          ({
            write: async () => undefined,
            commit: async () => ({ written: ["candidate"] }),
            rollback: async () => ({ restored: [], removed: [] }),
          }) as ReturnType<InstallerDependencies["createTransaction"]>,
        readFile: async () => "",
        loadState: async () => undefined,
        saveState: async () => undefined,
        createSecretMaterializer: () => ({
          materialize: async (operations) => ({
            references: operations.map(({ reference }) => reference),
          }),
        }),
      } as unknown as Partial<InstallerDependencies>,
    );

    expect(result.installFailed).toBe(false);
    expect(candidateRoot).not.toBe(root);
    expect(candidateRoot).toContain(".ghostinit-candidate-");
    expect(released).toBe(true);
    expect(existsSync(root)).toBe(true);
    expect(existsSync(candidateRoot)).toBe(false);
  });

  test("keeps placeholders through install and verification, then materializes", async () => {
    const fixture = resolvedFixture();
    const root = mkdtempSync(join(tmpdir(), "ghostinit-plan-order-"));
    roots.push(root);
    const events: string[] = [];
    let secretPhase = false;
    const result = await runProjectInstall(
      {
        projectName: fixture.config.name,
        projectRoot: root,
        desiredConfig: fixture.desiredConfig,
        resolvedConfig: fixture.resolvedConfig,
        options: { ...options(root, false), noInstall: false },
        noInstall: false,
      },
      {
        checkGitStatus: async () => ({
          isRepo: false,
          dirty: false,
          untracked: [],
          modified: [],
        }),
        assertCleanGit: () => undefined,
        acquireLock: async () => ({
          owner: { pid: 1, startTime: "2026-01-01T00:00:00.000Z" },
          release: async () => {
            events.push("release");
          },
        }),
        runInstall: async (candidate) => {
          events.push("install");
          const env = readFileSync(join(candidate, ".env.local"), "utf8");
          expect(secretPhase).toBe(false);
          expect(env).toContain("BETTER_AUTH_SECRET=REPLACE_WITH_");
        },
        runFormat: async () => {
          events.push("format");
          expect(secretPhase).toBe(false);
        },
        runVerification: async () => {
          events.push("verify");
          expect(secretPhase).toBe(false);
        },
        createSecretMaterializer: () => ({
          materialize: async (operations) => {
            events.push("secret");
            secretPhase = true;
            return { references: operations.map(({ reference }) => reference) };
          },
        }),
        loadState: async () => undefined,
        saveState: async () => {
          events.push("state");
        },
      },
    );
    expect(result.installFailed).toBe(false);
    expect(events).toEqual(["install", "format", "verify", "secret", "state", "release"]);
  });

  test("rolls back a failed candidate without secrets or successful state", async () => {
    const fixture = resolvedFixture();
    const root = mkdtempSync(join(tmpdir(), "ghostinit-plan-failure-"));
    roots.push(root);
    let materialized = false;
    let saved = false;
    const result = await runProjectInstall(
      {
        projectName: fixture.config.name,
        projectRoot: root,
        desiredConfig: fixture.desiredConfig,
        resolvedConfig: fixture.resolvedConfig,
        options: { ...options(root, false), noInstall: false },
        noInstall: false,
      },
      {
        checkGitStatus: async () => ({
          isRepo: false,
          dirty: false,
          untracked: [],
          modified: [],
        }),
        assertCleanGit: () => undefined,
        acquireLock: async () => ({
          owner: { pid: 1, startTime: "2026-01-01T00:00:00.000Z" },
          release: async () => undefined,
        }),
        runInstall: async () => {
          expect(readFileSync(join(root, ".env.local"), "utf8")).toContain(
            "BETTER_AUTH_SECRET=REPLACE_WITH_",
          );
          throw new Error("candidate install failed");
        },
        createSecretMaterializer: () => ({
          materialize: async () => {
            materialized = true;
            return { references: [] };
          },
        }),
        saveState: async () => {
          saved = true;
        },
      },
    );
    expect(result.installFailed).toBe(true);
    expect(materialized).toBe(false);
    expect(saved).toBe(false);
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(existsSync(join(root, ".ghostinit", "state.json"))).toBe(false);
  });

  test("round-trips plan identity and exact file provenance through state", async () => {
    const fixture = resolvedFixture();
    const root = mkdtempSync(join(tmpdir(), "ghostinit-plan-state-"));
    roots.push(root);
    const result = await runProjectInstall({
      projectName: fixture.config.name,
      projectRoot: root,
      desiredConfig: fixture.desiredConfig,
      resolvedConfig: fixture.resolvedConfig,
      options: options(root, false),
      noInstall: true,
    });
    const state = await loadState(root);
    expect(state?.generationPlan?.planHash).toBe(result.plan.planHash);
    expect(state?.generationPlan?.projectConfigHash).toBe(result.plan.projectConfigHash);
    expect(state?.generationPlan?.secretReferences).toEqual(
      result.plan.secrets.map(({ reference }) => reference).sort(),
    );
    const planned = result.plan.files.find(({ physicalPath }) => physicalPath.includes("billing"));
    expect(planned).toBeDefined();
    expect(state?.files[planned!.physicalPath]).toEqual(
      expect.objectContaining({
        owner: planned!.owner,
        lifecycle: planned!.lifecycle,
        provenance: planned!.provenance,
      }),
    );
  });

  test("fails closed instead of collapsing custom or multi-web layouts", () => {
    const base = resolvedFixture().desiredConfig;
    const custom = resolveProjectConfig({
      ...base,
      apps: [{ id: "console", target: "nextjs", deploy: "none" }],
      backend: { ...base.backend!, hostApp: "console" },
    });
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(() => buildProjectGenerationPlan(custom.config)).toThrow(
      LegacyRendererCompatibilityError,
    );

    const multiple = resolveProjectConfig({
      ...base,
      apps: [
        { id: "web", target: "nextjs", deploy: "none" },
        { id: "admin", target: "tanstack-start", deploy: "none" },
      ],
      backend: { ...base.backend!, hostApp: "web" },
    });
    expect(multiple.ok).toBe(true);
    if (multiple.ok) {
      expect(() => buildProjectGenerationPlan(multiple.config)).toThrow(
        LegacyRendererCompatibilityError,
      );
    }
  });
});
