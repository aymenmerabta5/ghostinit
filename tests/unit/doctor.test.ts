// @allow-long 480: doctor security, backend, and Cloudflare environment matrices share one fixture
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorCommand } from "../../src/commands/doctor";
import {
  CLOUDFLARE_ENVIRONMENT_LOCK_FILE,
  CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE,
  MAX_DOTENV_FILE_BYTES,
} from "../../src/lib/dotenv";
import { Logger } from "../../src/lib/logger";
import type { GlobalOptions } from "../../src/commands/types";

function makeOptions(cwd: string, overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    cwd,
    json: true,
    yes: false,
    dryRun: false,
    force: false,
    noInstall: false,
    runtime: "bun",
    logger: new Logger({ quiet: true }),
    ...overrides,
  };
}

describe("doctor command", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-doctor-"));
    mkdirSync(join(root, ".ghostinit"), { recursive: true });
    writeFileSync(
      join(root, ".ghostinit", "state.json"),
      JSON.stringify({
        version: 1,
        project: {
          name: "test",
          runtime: "bun",
          version: "0.1.0",
          generatedAt: new Date().toISOString(),
        },
        checksums: {},
        generatedBy: "ghostinit",
        generatedAt: new Date().toISOString(),
        modules: [],
        procedures: [],
      }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function doctorJson(overrides: Partial<GlobalOptions> = {}) {
    let stdout = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      const exitCode = await doctorCommand([], makeOptions(root, overrides));
      return { exitCode, payload: JSON.parse(stdout) };
    } finally {
      process.stdout.write = originalWrite;
    }
  }

  function replaceLegacyProject(project: Record<string, unknown>): void {
    const path = join(root, ".ghostinit", "state.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.project = { ...state.project, ...project };
    writeFileSync(path, JSON.stringify(state));
  }

  it("does not leak BETTER_AUTH_SECRET in JSON output even when present", async () => {
    writeFileSync(
      join(root, ".env"),
      "BETTER_AUTH_SECRET=super_secret_value_12345\nDATABASE_URL=postgresql://user:pass@localhost/db\n",
    );
    process.env.BETTER_AUTH_SECRET = "super_secret_value_12345_super_secret_value_12345";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/db";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    let stdout = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await doctorCommand([], makeOptions(root));
    } finally {
      process.stdout.write = originalWrite;
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
    }

    expect(stdout).not.toContain("super_secret_value_12345");
    const parsed = JSON.parse(stdout);
    const secretCheck = parsed.data.checks.find(
      (c: { name: string }) => c.name === "secret-strength",
    );
    expect(secretCheck?.ok).toBe(true);
  });

  it("database check passes when POSTGRES_* variables are provided instead of DATABASE_URL", async () => {
    writeFileSync(
      join(root, ".env"),
      [
        "BETTER_AUTH_SECRET=super_secret_value_12345_super_secret_value_12345",
        "POSTGRES_USER=pguser",
        "POSTGRES_PASSWORD=super_secret_pg_pass",
        "POSTGRES_HOST=localhost",
        "POSTGRES_PORT=5432",
        "POSTGRES_DB=testdb",
        "BETTER_AUTH_URL=http://localhost:3000",
        "NEXT_PUBLIC_APP_URL=http://localhost:3000",
      ].join("\n") + "\n",
    );
    delete process.env.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = "super_secret_value_12345_super_secret_value_12345";
    process.env.POSTGRES_USER = "pguser";
    process.env.POSTGRES_PASSWORD = "super_secret_pg_pass";
    process.env.POSTGRES_HOST = "localhost";
    process.env.POSTGRES_PORT = "5432";
    process.env.POSTGRES_DB = "testdb";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    let stdout = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await doctorCommand([], makeOptions(root));
    } finally {
      process.stdout.write = originalWrite;
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.DATABASE_URL;
      delete process.env.POSTGRES_USER;
      delete process.env.POSTGRES_PASSWORD;
      delete process.env.POSTGRES_HOST;
      delete process.env.POSTGRES_PORT;
      delete process.env.POSTGRES_DB;
      delete process.env.BETTER_AUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
    }

    expect(stdout).not.toContain("super_secret_pg_pass");
    const parsed = JSON.parse(stdout);
    const databaseCheck = parsed.data.checks.find(
      (c: { name: string }) => c.name === "database-url",
    );
    expect(databaseCheck?.ok).toBe(true);
  });

  it("uses resolved TanStack/database-none Cloudflare checks without PostgreSQL false failures", async () => {
    replaceLegacyProject({
      mode: "single",
      preset: "frontend",
      database: "none",
      framework: "tanstack-start",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    writeFileSync(join(root, ".dev.vars"), "VITE_APP_URL=http://localhost:3000\n");

    const { exitCode, payload } = await doctorJson();
    expect(exitCode).toBe(1);
    expect(
      payload.data.checks.filter(
        ({ name, ok }: { name: string; ok: boolean }) =>
          !ok && !["bun", "node", "typescript"].includes(name),
      ),
    ).toEqual([]);
    const names = payload.data.checks.map(({ name }: { name: string }) => name);
    expect(names).toContain("vite_app_url");
    expect(names).toContain("cloudflare-environment-files");
    expect(names).not.toContain("database-url");
    expect(names).not.toContain("postgres_password");
    expect(names).not.toContain("secret-strength");
  });

  it("validates Convex Cloudflare values and rejects forbidden runtime dotenv files", async () => {
    replaceLegacyProject({
      mode: "single",
      preset: "custom",
      database: "convex",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: true,
      api: true,
      email: false,
      analytics: false,
    });
    writeFileSync(
      join(root, ".dev.vars"),
      [
        "BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
        "BETTER_AUTH_URL=https://app.example.test",
        "NEXT_PUBLIC_APP_URL=https://app.example.test",
        "CONVEX_DEPLOYMENT=dev:fixture-worker",
        "CONVEX_URL=https://fixture-worker.convex.cloud",
        "CONVEX_SITE_URL=https://fixture-worker.convex.site",
        "NEXT_PUBLIC_CONVEX_URL=https://fixture-worker.convex.cloud",
      ].join("\n") + "\n",
    );
    writeFileSync(join(root, ".env.production"), "SERVER_SECRET=forbidden\n");

    const { exitCode, payload } = await doctorJson();
    expect(exitCode).not.toBe(0);
    expect(payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "cloudflare-environment-files", ok: false }),
    );
    const names = payload.data.checks.map(({ name }: { name: string }) => name);
    expect(names).toContain("convex_deployment");
    expect(names).toContain("convex_url");
    expect(payload.data.checks).toContainEqual(
      expect.objectContaining({
        name: "convex-deployment-environment",
        ok: true,
        message: expect.stringContaining("local .dev.vars does not configure it"),
        meta: { manualRemoteVerificationRequired: true },
      }),
    );
    expect(names).not.toContain("postgres_password");
  });

  it("covers the remaining Next/none and TanStack/Convex Cloudflare doctor matrix", async () => {
    const cases = [
      {
        framework: "nextjs",
        database: "none",
        auth: false,
        environment: ["NEXT_PUBLIC_APP_URL=http://localhost:3000"],
        expected: ["next_public_app_url"],
      },
      {
        framework: "tanstack-start",
        database: "convex",
        auth: true,
        environment: [
          "BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
          "BETTER_AUTH_URL=https://app.example.test",
          "VITE_APP_URL=https://app.example.test",
          "CONVEX_DEPLOYMENT=dev:fixture-worker",
          "CONVEX_URL=https://fixture-worker.convex.cloud",
          "CONVEX_SITE_URL=https://fixture-worker.convex.site",
          "VITE_CONVEX_URL=https://fixture-worker.convex.cloud",
        ],
        expected: ["vite_app_url", "vite_convex_url", "convex_url"],
      },
    ] as const;
    for (const entry of cases) {
      replaceLegacyProject({
        mode: "single",
        preset: entry.auth ? "custom" : "frontend",
        database: entry.database,
        framework: entry.framework,
        apps: ["web"],
        deploy: "cloudflare",
        billing: [],
        features: [],
        auth: entry.auth,
        api: entry.auth,
        email: false,
        analytics: false,
      });
      writeFileSync(join(root, ".dev.vars"), `${entry.environment.join("\n")}\n`);
      const { payload } = await doctorJson();
      const checks = payload.data.checks as Array<{ name: string; ok: boolean }>;
      for (const name of entry.expected) {
        expect(checks, `${entry.framework}/${entry.database}/${name}`).toContainEqual(
          expect.objectContaining({ name, ok: true }),
        );
      }
      expect(checks.map(({ name }) => name)).not.toContain("postgres_password");
      expect(checks.map(({ name }) => name)).not.toContain("database-url");
    }
  });

  it("compares monorepo Cloudflare mirrors by dotenv key/value semantics", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "frontend",
      database: "none",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(
      join(root, ".dev.vars"),
      '# root comments and ordering are not runtime values\nAPP_NAME="Ghost Init"\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n',
    );
    writeFileSync(
      join(root, "apps", "web", ".dev.vars"),
      "NEXT_PUBLIC_APP_URL=http://localhost:3000\n# web comment\nAPP_NAME=Ghost Init\n",
    );

    let { payload } = await doctorJson();
    expect(payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "cloudflare-environment-files", ok: true }),
    );

    writeFileSync(
      join(root, "apps", "web", ".dev.vars"),
      "NEXT_PUBLIC_APP_URL=https://different.example.test\nAPP_NAME=Ghost Init\n",
    );
    ({ payload } = await doctorJson());
    expect(payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "cloudflare-environment-files", ok: false }),
    );
  });

  it("fixes semantically equal Cloudflare mirrors once without rotating the result", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "custom",
      database: "convex",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: true,
      api: true,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    const placeholder = "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS";
    writeFileSync(
      join(root, ".dev.vars"),
      `BETTER_AUTH_SECRET=${placeholder}\nBETTER_AUTH_URL=http://localhost:3000\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nAPP_NAME="Ghost Init"\nCONVEX_DEPLOYMENT=dev:fixture-worker\nCONVEX_URL=https://fixture-worker.convex.cloud\nCONVEX_SITE_URL=https://fixture-worker.convex.site\nNEXT_PUBLIC_CONVEX_URL=https://fixture-worker.convex.cloud\n`,
    );
    writeFileSync(
      join(root, "apps", "web", ".dev.vars"),
      `NEXT_PUBLIC_CONVEX_URL=https://fixture-worker.convex.cloud\nCONVEX_SITE_URL=https://fixture-worker.convex.site\nCONVEX_URL=https://fixture-worker.convex.cloud\nCONVEX_DEPLOYMENT=dev:fixture-worker\nAPP_NAME=Ghost Init\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET='${placeholder}'\n`,
    );

    const first = await doctorJson({ fix: true, force: true });
    expect(first.payload.data.fixMessages).not.toContainEqual(
      expect.stringContaining("Refused to update divergent"),
    );
    const rootContent = readFileSync(join(root, ".dev.vars"), "utf8");
    expect(readFileSync(join(root, "apps", "web", ".dev.vars"), "utf8")).toBe(rootContent);
    expect(rootContent).not.toContain(placeholder);
    const secret = /^BETTER_AUTH_SECRET=(.+)$/m.exec(rootContent)?.[1];
    expect(secret?.length).toBeGreaterThanOrEqual(32);

    await doctorJson({ fix: true, force: true });
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toBe(rootContent);
    expect(readFileSync(join(root, "apps", "web", ".dev.vars"), "utf8")).toBe(rootContent);
  });

  it("refuses doctor fixes while legacy dotenv paths make the secret authority ambiguous", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "custom",
      database: "convex",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: true,
      api: true,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    const rootLegacy =
      "BETTER_AUTH_SECRET=legacy-root-secret-that-must-remain-authoritative\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n";
    const webLegacy =
      "NEXT_PUBLIC_APP_URL=http://localhost:3000\nBETTER_AUTH_SECRET=legacy-root-secret-that-must-remain-authoritative\n";
    writeFileSync(join(root, ".env.local"), rootLegacy);
    writeFileSync(join(root, "apps/web/.env.local"), webLegacy);
    writeFileSync(
      join(root, ".env.example"),
      "BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\n",
    );

    const result = await doctorJson({ fix: true, force: true });
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("alternate local environment files exist"),
    );
    expect(existsSync(join(root, ".dev.vars"))).toBe(false);
    expect(existsSync(join(root, "apps/web/.dev.vars"))).toBe(false);
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe(rootLegacy);
    expect(readFileSync(join(root, "apps/web/.env.local"), "utf8")).toBe(webLegacy);
  });

  it("refuses Cloudflare fixes for runtime dotenv files and linked entries without mutating values", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "frontend",
      database: "none",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    const rootSecret = "operator-root-production-secret-must-survive";
    const linkedSecret = "operator-linked-production-secret-must-survive";
    const rootRuntime = join(root, ".env.production");
    const linkedSource = join(root, "operator-linked-secret-source");
    const linkedRuntime = join(root, "apps/web/.env.staging");
    writeFileSync(rootRuntime, `SERVER_SECRET=${rootSecret}\n`);
    writeFileSync(linkedSource, `SERVER_SECRET=${linkedSecret}\n`);
    symlinkSync(linkedSource, linkedRuntime, "file");
    writeFileSync(join(root, ".env.example"), "NEXT_PUBLIC_APP_URL=http://localhost:3000\n");

    const result = await doctorJson({ fix: true, force: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("Cloudflare runtime dotenv files exist"),
    );
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("No local environment file was created or changed"),
    );
    expect(JSON.stringify(result.payload)).not.toContain(rootSecret);
    expect(JSON.stringify(result.payload)).not.toContain(linkedSecret);
    expect(existsSync(join(root, ".dev.vars"))).toBe(false);
    expect(existsSync(join(root, "apps/web/.dev.vars"))).toBe(false);
    expect(readFileSync(rootRuntime, "utf8")).toBe(`SERVER_SECRET=${rootSecret}\n`);
    expect(readFileSync(linkedSource, "utf8")).toBe(`SERVER_SECRET=${linkedSecret}\n`);
    expect(lstatSync(linkedRuntime).isSymbolicLink()).toBe(true);
  });

  it("requires an explicit copy when exactly one Cloudflare environment mirror is missing", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "frontend",
      database: "none",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    const rootContent =
      "NEXT_PUBLIC_APP_URL=http://localhost:3000\nCUSTOM_PRIVATE_VALUE=preserve-me\n";
    writeFileSync(join(root, ".dev.vars"), rootContent);

    const result = await doctorJson({ fix: true, force: true });
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("Refused to guess a missing environment mirror"),
    );
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toBe(rootContent);
    expect(existsSync(join(root, "apps/web/.dev.vars"))).toBe(false);
  });

  it("never replaces dangling current or legacy Cloudflare environment symlinks", async () => {
    replaceLegacyProject({
      mode: "single",
      preset: "custom",
      database: "convex",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: true,
      api: true,
      email: false,
      analytics: false,
    });
    writeFileSync(
      join(root, ".env.example"),
      "BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\n",
    );

    for (const entry of [".dev.vars", ".env.local"]) {
      const link = join(root, entry);
      const target = join(root, `missing-${entry.slice(1).replaceAll(".", "-")}-target`);
      symlinkSync(target, link, "file");
      const result = await doctorJson({ fix: true, force: true });
      expect(result.payload.data.fixMessages).toContainEqual(expect.stringContaining("Refused"));
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(existsSync(target)).toBe(false);
      if (entry === ".env.local") expect(existsSync(join(root, ".dev.vars"))).toBe(false);
      rmSync(link, { force: true });
    }
  });

  it("refuses oversized Cloudflare examples and local values before reading or repairing them", async () => {
    replaceLegacyProject({
      mode: "single",
      preset: "frontend",
      database: "none",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    const oversized = Buffer.alloc(MAX_DOTENV_FILE_BYTES + 1, "x");
    const examplePath = join(root, ".env.example");
    writeFileSync(examplePath, oversized);
    let result = await doctorJson({ fix: true, force: true });
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("unsafe or oversized Cloudflare environment documentation files"),
    );
    expect(existsSync(join(root, ".dev.vars"))).toBe(false);
    expect(readFileSync(examplePath).byteLength).toBe(oversized.byteLength);

    rmSync(examplePath);
    const localPath = join(root, ".dev.vars");
    writeFileSync(localPath, oversized);
    result = await doctorJson({ fix: true, force: true });
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("unsafe local environment files"),
    );
    expect(result.payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "cloudflare-environment-files", ok: false }),
    );
    expect(readFileSync(localPath).byteLength).toBe(oversized.byteLength);
  });

  it("doctor does not create mirrors while the Cloudflare wrapper has hidden them", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "custom",
      database: "convex",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: true,
      api: true,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    const localValues =
      "BETTER_AUTH_SECRET=operator-value-that-must-not-rotate-or-split\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n";
    const rootPath = join(root, ".dev.vars");
    const webPath = join(root, "apps/web/.dev.vars");
    const rootHidden = join(root, CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE);
    const webHidden = join(root, "apps/web", CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE);
    writeFileSync(rootPath, localValues);
    writeFileSync(webPath, localValues);
    renameSync(rootPath, rootHidden);
    renameSync(webPath, webHidden);
    writeFileSync(
      join(root, CLOUDFLARE_ENVIRONMENT_LOCK_FILE),
      JSON.stringify({ version: 1, pid: process.pid, owner: "doctor-overlap" }) + "\n",
    );
    writeFileSync(
      join(root, ".env.example"),
      "BETTER_AUTH_SECRET=REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS\n",
    );

    const result = await doctorJson({ fix: true, force: true });
    expect(result.payload.data.fixMessages).toContainEqual(
      expect.stringContaining("environment lifecycle is active or requires recovery"),
    );
    expect(result.payload.data.wouldFix ?? []).toEqual([]);
    expect(existsSync(rootPath)).toBe(false);
    expect(existsSync(webPath)).toBe(false);
    expect(readFileSync(rootHidden, "utf8")).toBe(localValues);
    expect(readFileSync(webHidden, "utf8")).toBe(localValues);
  });

  it("creates two absent Cloudflare mirrors and refreshes the final doctor checks", async () => {
    replaceLegacyProject({
      mode: "monorepo",
      preset: "frontend",
      database: "none",
      framework: "nextjs",
      apps: ["web"],
      deploy: "cloudflare",
      billing: [],
      features: [],
      auth: false,
      api: false,
      email: false,
      analytics: false,
    });
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(
      join(root, ".env.example"),
      "NEXT_PUBLIC_APP_URL=http://localhost:3000\nAPP_NAME=GhostInit\n",
    );

    const result = await doctorJson({ fix: true, force: true });
    const rootContent = readFileSync(join(root, ".dev.vars"), "utf8");
    expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toBe(rootContent);
    expect(result.payload.data.fixed).toEqual(
      expect.arrayContaining([".dev.vars", "apps/web/.dev.vars"]),
    );
    expect(result.payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "cloudflare-environment-files", ok: true }),
    );
    expect(result.payload.data.checks).toContainEqual(
      expect.objectContaining({ name: "next_public_app_url", ok: true }),
    );
  });
});
