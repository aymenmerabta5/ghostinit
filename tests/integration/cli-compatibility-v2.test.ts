// @allow-long 451: executable compatibility matrix keeps shared CLI process and immutable-tree helpers local
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = resolve(import.meta.dir, "../..");
const CLI = join(root, "dist", "cli.js");
const CLI_CAPTURE_LIMIT_BYTES = 16 * 1024 * 1024;

function run(args: string[], cwd = root) {
  // Dry-run JSON intentionally contains the complete generation plan and file
  // contents. Bun's spawnSync compatibility layer truncates captured stdout on
  // some hosts even when maxBuffer is supplied, so capture to a bounded file.
  const captureRoot = mkdtempSync(join(tmpdir(), "ghostinit-cli-capture-"));
  const stdoutPath = join(captureRoot, "stdout.json");
  let stdoutFd: number | undefined = openSync(stdoutPath, "w");
  try {
    const result = spawnSync("node", [CLI, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", stdoutFd, "pipe"],
    });
    closeSync(stdoutFd);
    stdoutFd = undefined;
    const size = statSync(stdoutPath).size;
    if (size > CLI_CAPTURE_LIMIT_BYTES) {
      throw new Error(`CLI stdout exceeded ${CLI_CAPTURE_LIMIT_BYTES} bytes`);
    }
    return { ...result, stdout: readFileSync(stdoutPath, "utf8") };
  } finally {
    if (stdoutFd !== undefined) closeSync(stdoutFd);
    rmSync(captureRoot, { force: true, recursive: true });
  }
}

function hashTree(directory: string): string {
  const hash = createHash("sha256");
  const visit = (current: string): void => {
    for (const name of readdirSync(current).toSorted()) {
      const absolute = join(current, name);
      const rel = relative(directory, absolute).replaceAll("\\", "/");
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else {
        hash.update(rel);
        hash.update(readFileSync(absolute));
      }
    }
  };
  visit(directory);
  return hash.digest("hex");
}

function writeManagedSingle(directory: string, api: boolean, database: "postgres" | "none"): void {
  mkdirSync(join(directory, ".ghostinit"), { recursive: true });
  writeFileSync(join(directory, "package.json"), '{"name":"fixture","private":true}\n');
  const generatedAt = new Date().toISOString();
  writeFileSync(
    join(directory, ".ghostinit", "state.json"),
    `${JSON.stringify(
      {
        version: 1,
        project: {
          name: "fixture",
          runtime: "bun",
          version: "0.1.0",
          generatedAt,
          mode: "single",
          preset: api ? "custom" : "frontend",
          cache: "none",
          deploy: "none",
          auth: api,
          api,
          email: false,
          analytics: false,
          eve: false,
          i18n: false,
          pdf: false,
          messaging: false,
          billing: [],
          features: [],
          database,
          framework: "nextjs",
          apps: ["web"],
        },
        checksums: {},
        generatedBy: "0.1.0",
        generatedAt,
        modules: [],
        procedures: api ? ["health", "me"] : [],
      },
      null,
      2,
    )}\n`,
  );
  if (!api) return;
  const apiRoot = join(directory, "src", "server", "api");
  mkdirSync(join(apiRoot, "procedures"), { recursive: true });
  writeFileSync(join(apiRoot, "procedures", "health.ts"), "export const health = {};\n");
  writeFileSync(join(apiRoot, "procedures", "me.ts"), "export const me = {};\n");
  writeFileSync(
    join(apiRoot, "contract.ts"),
    `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";

export const appContract = {
  health: healthContract,
  me: meContract,
};
`,
  );
  writeFileSync(
    join(apiRoot, "router.ts"),
    `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import type { ApiContext } from "./context";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os.$context<ApiContext>().prefix("/api").router(
  implementer.router({
    health,
    me,
  }),
);
`,
  );
  mkdirSync(join(directory, "src", "server", "db", "schema"), { recursive: true });
  writeFileSync(
    join(directory, "src", "server", "db", "schema", "auth.ts"),
    "export const users = {};\n",
  );
  writeFileSync(
    join(directory, "src", "server", "db", "schema", "index.ts"),
    'export { users } from "./auth";\n',
  );
}

describe("V2 CLI compatibility contract", () => {
  let temp: string;

  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "ghostinit-cli-v2-"));
  });

  afterEach(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test("capabilities emits the typed catalog in the versioned envelope", () => {
    const result = run(["capabilities", "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.meta.command).toBe("capabilities");
    expect(payload.data.catalog.catalogVersion).toBe(2);
    expect(payload.data.catalog.capabilities.map(({ id }: { id: string }) => id)).toContain(
      "billing",
    );
    expect(payload.data.defaults.mode).toBe("monorepo");
    expect(payload.data.defaults.storage).toBe(false);
    expect(payload.data.commands.init.options).toContain("with-i18n");
    expect(payload.data.commands.status.options).not.toContain("deploy");
    expect(payload.data.schemas.projectConfig.schemaVersion).toBe(2);
    expect(payload.data.schemas.resolvedProjectConfig.schemaVersion).toBe(2);
    expect(payload.data.schemas.state.schemaVersion).toBe(2);
    expect(payload.data.deprecations.map(({ option }: { option: string }) => option)).toEqual([
      "features",
      "stack",
    ]);

    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const envelopeSchema = JSON.parse(
      readFileSync(join(root, "schemas", "json-envelope.schema.json"), "utf8"),
    );
    const catalogSchema = JSON.parse(
      readFileSync(join(root, "schemas", "support-catalog.schema.json"), "utf8"),
    );
    const validateEnvelope = ajv.compile(envelopeSchema);
    expect(validateEnvelope(payload), JSON.stringify(validateEnvelope.errors)).toBe(true);
    const validateCatalog = ajv.compile(catalogSchema);
    expect(validateCatalog(payload.data.catalog), JSON.stringify(validateCatalog.errors)).toBe(
      true,
    );
  });

  test("rejects ignored options and extra positionals before dispatch", () => {
    const cases = [
      ["version", "--force", "--json"],
      ["help", "--billing", "stripe", "--json"],
      ["upgrade", "extra", "--json"],
      ["status", "--deploy", "docker", "--json"],
    ];
    for (const args of cases) {
      const result = run(args);
      expect(result.status, args.join(" ")).toBe(2);
      const payload = JSON.parse(result.stdout);
      expect(payload.success).toBe(false);
      expect(payload.error.code).toBe("INVALID_ARGUMENTS");
    }
  });

  test("rejects capability graphs that have no secure runtime owner", () => {
    const cases = [
      ["--preset", "custom", "--database", "none", "--with-auth"],
      ["--preset", "custom", "--database", "postgres", "--billing", "stripe"],
      ["--preset", "custom", "--database", "none", "--with-jobs"],
    ];
    for (const flags of cases) {
      const result = run(["create", "invalid", "--yes", "--dry-run", "--json", ...flags]);
      expect(result.status, flags.join(" ")).toBe(2);
      expect(JSON.parse(result.stdout).error.code).toBe("INVALID_ARGUMENTS");
    }
  });

  test("single native dry-run stays frontend-only while monorepo web owns backend parity", () => {
    const serverCases = [
      { label: "saas", flags: [], selections: ["database:postgres", "auth", "api", "email"] },
      {
        label: "api",
        flags: ["--preset", "custom", "--database", "none", "--with-api"],
        selections: ["api"],
      },
      {
        label: "messaging",
        flags: ["--preset", "custom", "--database", "postgres", "--with-messaging"],
        selections: ["database:postgres", "auth", "api", "messaging", "storage"],
      },
      {
        label: "billing",
        flags: [
          "--preset",
          "custom",
          "--database",
          "postgres",
          "--with-auth",
          "--with-api",
          "--billing",
          "stripe",
        ],
        selections: ["database:postgres", "auth", "api", "billing:stripe"],
      },
      {
        label: "eve",
        flags: ["--preset", "custom", "--database", "postgres", "--with-eve"],
        selections: ["database:postgres", "auth", "api", "eve"],
      },
      {
        label: "feature-flags",
        flags: ["--preset", "custom", "--database", "none", "--feature-flags", "posthog"],
        selections: ["api", "feature-flags:posthog"],
      },
      {
        label: "cache",
        flags: ["--preset", "custom", "--database", "none", "--cache", "redis"],
        selections: ["cache:redis"],
      },
      {
        label: "deploy",
        flags: ["--preset", "custom", "--database", "none", "--deploy", "docker"],
        selections: ["deploy:docker"],
      },
    ] as const;

    for (const app of ["mobile", "desktop"] as const) {
      const frontend = run([
        "create",
        `single-${app}-frontend`,
        "--yes",
        "--dry-run",
        "--json",
        "--mode",
        "single",
        "--apps",
        app,
        "--preset",
        "frontend",
        "--database",
        "none",
        "--with-analytics",
        "--with-i18n",
      ]);
      expect(frontend.status, app).toBe(0);
      const frontendData = JSON.parse(frontend.stdout).data;
      expect(frontendData.resolvedProjectConfig.backend, app).toBe(false);
      expect(frontendData.resolvedProjectConfig.enabledCapabilities, app).toEqual([
        "analytics",
        "i18n",
      ]);
      const frontendPaths = frontendData.files.map(({ path }: { path: string }) => path);
      const allowedLocalTransport =
        app === "desktop" ? ["src/server/transport/runtime-config.ts"] : [];
      expect(
        frontendPaths.filter(
          (path: string) =>
            path.startsWith("src/server/") ||
            path.startsWith("app/api/") ||
            path.startsWith("convex/"),
        ),
        app,
      ).toEqual(allowedLocalTransport);
      if (app === "desktop") {
        expect(
          frontendData.plan.files.find(
            ({ physicalPath }: { physicalPath: string }) =>
              physicalPath === "src/server/transport/runtime-config.ts",
          )?.owner,
        ).toBe("transport");
      }
      expect(frontendPaths, app).toContain(app === "mobile" ? "app/_layout.tsx" : "src/main.ts");

      for (const entry of serverCases) {
        const rejected = run([
          "create",
          `single-${app}-${entry.label}`,
          "--yes",
          "--dry-run",
          "--json",
          "--mode",
          "single",
          "--apps",
          app,
          ...entry.flags,
        ]);
        expect(rejected.status, `${app}/${entry.label}`).toBe(2);
        const payload = JSON.parse(rejected.stdout);
        expect(payload.data.reason, `${app}/${entry.label}`).toBe(
          "single-native-server-capabilities-unsupported",
        );
        expect(payload.error.details.reason, `${app}/${entry.label}`).toBe(
          "single-native-server-capabilities-unsupported",
        );
        expect(payload.data.unsupportedSelections, `${app}/${entry.label}`).toEqual(
          entry.selections,
        );
      }

      const hosted = run([
        "create",
        `hosted-${app}`,
        "--yes",
        "--dry-run",
        "--json",
        "--mode",
        "monorepo",
        "--apps",
        `web,${app}`,
        "--preset",
        "custom",
        "--database",
        "postgres",
        "--with-auth",
        "--with-api",
        "--with-messaging",
      ]);
      expect(hosted.status, `hosted/${app}`).toBe(0);
      expect(JSON.parse(hosted.stdout).data.resolvedProjectConfig.backend, app).toEqual({
        hostApp: "web",
        executionRuntime: "bun",
        database: "postgres",
      });
    }
  });

  test("client capabilities resolve their declared secure server dependencies", () => {
    const cases = [
      {
        name: "storage",
        flags: ["--with-storage"],
        legacy: { auth: true, api: true, storage: true },
        capabilities: { auth: true, transport: true, storage: true },
        enabledCapabilities: ["auth", "storage", "transport"],
      },
      {
        name: "notifications",
        flags: ["--with-notifications"],
        legacy: { auth: true, api: true, notifications: true },
        capabilities: { auth: true, transport: true, notifications: true },
        enabledCapabilities: ["auth", "notifications", "transport"],
      },
      {
        name: "feature-flags",
        flags: ["--feature-flags", "posthog"],
        legacy: { auth: false, api: true, featureFlags: "posthog" },
        capabilities: {
          auth: false,
          transport: true,
          featureFlags: { enabled: true, provider: "posthog" },
        },
        enabledCapabilities: ["featureFlags", "transport"],
      },
    ];

    for (const { name, flags, legacy, capabilities, enabledCapabilities } of cases) {
      const result = run([
        "create",
        `implied-${name}`,
        "--yes",
        "--dry-run",
        "--json",
        "--preset",
        "custom",
        "--database",
        "postgres",
        ...flags,
      ]);
      expect(result.status, name).toBe(0);
      const data = JSON.parse(result.stdout).data;
      expect(data.resolvedConfig, name).toMatchObject(legacy);
      expect(data.resolvedProjectConfig.backend, name).toEqual({
        hostApp: "web",
        executionRuntime: "bun",
        database: "postgres",
      });
      expect(data.resolvedProjectConfig.capabilities, name).toMatchObject(capabilities);
      expect(data.resolvedProjectConfig.enabledCapabilities, name).toEqual(enabledCapabilities);
    }
  });

  test("init and create share complete non-interactive option resolution", () => {
    const flags = [
      "--yes",
      "--no-install",
      "--dry-run",
      "--json",
      "--mode",
      "single",
      "--framework",
      "nextjs",
      "--database",
      "postgres",
      "--apps",
      "web",
      "--preset",
      "custom",
      "--billing",
      "stripe",
      "--cache",
      "redis",
      "--deploy",
      "docker",
      "--with-auth",
      "--with-api",
      "--with-email",
      "--with-analytics",
      "--with-eve",
      "--with-i18n",
      "--with-pdf",
      "--with-messaging",
      "--with-storage",
      "--with-notifications",
      "--feature-flags",
      "posthog",
      "--with-jobs",
    ];
    const createBase = join(temp, "create");
    const initRoot = join(temp, "init-app");
    mkdirSync(createBase);
    mkdirSync(initRoot);
    const createResult = run(["create", "init-app", "--cwd", createBase, ...flags]);
    const initResult = run(["init", "init-app", "--cwd", initRoot, ...flags]);
    expect(createResult.status).toBe(0);
    expect(initResult.status).toBe(0);
    const created = JSON.parse(createResult.stdout).data.resolvedConfig;
    const initialized = JSON.parse(initResult.stdout).data.resolvedConfig;
    delete created.generatedAt;
    delete initialized.generatedAt;
    expect(initialized).toEqual(created);
    expect(created.storage).toBe(true);
  });

  test("preserves transport without auth or persistence through CLI resolution", () => {
    const result = run([
      "create",
      "transport-only",
      "--yes",
      "--dry-run",
      "--json",
      "--preset",
      "custom",
      "--database",
      "none",
      "--with-api",
    ]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data.resolvedConfig).toMatchObject({
      preset: "custom",
      auth: false,
      api: true,
      database: "none",
    });
    expect(payload.data.resolvedProjectConfig.enabledCapabilities).toEqual(["transport"]);
  });

  test("preserves standalone storage as an explicit secure capability", () => {
    const flags = [
      "--yes",
      "--dry-run",
      "--json",
      "--preset",
      "custom",
      "--database",
      "postgres",
      "--with-auth",
      "--with-api",
      "--with-storage",
    ];
    const initRoot = join(temp, "storage-only");
    mkdirSync(initRoot);
    const createResult = run(["create", "storage-only", ...flags]);
    const initResult = run(["init", "storage-only", "--cwd", initRoot, ...flags]);
    expect(createResult.status).toBe(0);
    expect(initResult.status).toBe(0);
    const created = JSON.parse(createResult.stdout).data;
    const initialized = JSON.parse(initResult.stdout).data;
    expect(created.resolvedConfig).toMatchObject({
      auth: true,
      api: true,
      messaging: false,
      storage: true,
    });
    expect(initialized.resolvedConfig).toMatchObject({
      auth: true,
      api: true,
      messaging: false,
      storage: true,
    });
    expect(created.resolvedProjectConfig.enabledCapabilities).toEqual([
      "auth",
      "storage",
      "transport",
    ]);
    expect(initialized.resolvedProjectConfig.enabledCapabilities).toEqual(
      created.resolvedProjectConfig.enabledCapabilities,
    );
  });

  test("upgrade, check --fix, and doctor --fix dry-runs preserve every byte", () => {
    expect(run(["create", "demo", "--cwd", temp, "--yes", "--no-install", "--force"]).status).toBe(
      0,
    );
    const project = join(temp, "demo");
    const statePath = join(project, ".ghostinit", "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.generatedBy = "0.0.1";
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    const turboPath = join(project, "turbo.json");
    const turbo = JSON.parse(readFileSync(turboPath, "utf8"));
    turbo.globalEnv = [];
    writeFileSync(turboPath, `${JSON.stringify(turbo, null, 2)}\n`);

    const before = hashTree(project);
    for (const args of [
      ["upgrade", "--dry-run", "--json"],
      ["check", "--fix", "--dry-run", "--json"],
      ["doctor", "--fix", "--dry-run", "--json"],
    ]) {
      const result = run(args, project);
      expect(result.stdout.trim().length, args.join(" ")).toBeGreaterThan(0);
      expect(hashTree(project), args.join(" ")).toBe(before);
      expect(existsSync(join(project, ".ghostinit.lock"))).toBe(false);
      expect(
        readdirSync(project, { recursive: true }).some((entry) =>
          String(entry).includes(".ghostinit-staging"),
        ),
      ).toBe(false);
    }
  });

  test("invalid state is a typed incompatibility, not a missing project", () => {
    mkdirSync(join(temp, ".ghostinit"));
    writeFileSync(join(temp, ".ghostinit", "state.json"), "{ definitely-not-json");
    const result = run(["status", "--json"], temp);
    expect(result.status).toBe(21);
    const payload = JSON.parse(result.stdout);
    expect(payload.error.code).toBe("INCOMPATIBLE_SCHEMA");
    expect(payload.error.details.path).toContain("state.json");
  });

  test("single-mode add/sync use flat paths and API-disabled layouts stay clean", () => {
    const single = join(temp, "single-app");
    mkdirSync(single);
    writeManagedSingle(single, true, "postgres");
    expect(run(["sync", "--check", "--json"], single).status).toBe(0);
    expect(run(["add", "module", "orders", "--force", "--json"], single).status).toBe(0);
    expect(existsSync(join(single, "src", "server", "modules", "orders", "index.ts"))).toBe(true);
    expect(run(["sync", "--check", "--json"], single).status).toBe(0);

    const frontend = join(temp, "frontend-app");
    mkdirSync(frontend);
    writeManagedSingle(frontend, false, "none");
    expect(run(["sync", "--check", "--json"], frontend).status).toBe(0);
    expect(run(["add", "module", "orders", "--force", "--json"], frontend).status).toBe(0);
    expect(
      run(["add", "use-case", "orders", "create-order", "--kind", "command", "--force"], frontend)
        .status,
    ).toBe(0);
    const procedure = run(
      ["add", "procedure", "orders", "create-order", "--force", "--json"],
      frontend,
    );
    expect(procedure.status).toBe(17);
    expect(existsSync(join(frontend, "src", "server", "api", "procedures"))).toBe(false);
    expect(run(["sync", "--check", "--json"], frontend).status).toBe(0);
  });
});
