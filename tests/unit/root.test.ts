import { describe, it, expect } from "bun:test";
import { rootFiles } from "../../src/templates/root";
import type { RootSecrets } from "../../src/templates/root";

const secrets: RootSecrets = {
  authSecret: "test_auth_secret_value_at_least_32_chars",
  postgresPassword: "test_postgres_password_value_at_least_32",
  resendApiKey: "re_test_api_key_value_at_least_32_chars_long",
};

describe("root template files", () => {
  it("does not generate a committed .env file", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(".env");
    expect(paths).toContain(".env.example");
    expect(paths).toContain(".env.local");
    expect(paths).toContain("apps/web/.env.local");
    expect(files.find((f) => f.path === ".env.example")?.content).toContain("DATABASE_SSL_CA=");
    expect(files.find((f) => f.path === ".env.local")?.content).toContain("DATABASE_SSL_CA=");
  });

  it("gitignore blocks environment variants but retains examples", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const gitignore = files.find((f) => f.path === ".gitignore")?.content ?? "";
    expect(gitignore).toContain(".env\n");
    expect(gitignore).toContain(".env.*\n");
    expect(gitignore).toContain("!.env.example\n");
    expect(gitignore).toContain("!.env.*.example\n");
  });

  it("gitignore blocks GhostInit internal state", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const gitignore = files.find((f) => f.path === ".gitignore")?.content ?? "";
    expect(gitignore).toContain(".ghostinit/\n");
    expect(gitignore).toContain(".ghostinit.lock\n");
  });

  it("dry-run uses placeholder secrets", () => {
    const files = rootFiles("demo", secrets, { dryRun: true });
    const example = files.find((f) => f.path === ".env.example")?.content ?? "";
    const local = files.find((f) => f.path === ".env.local")?.content ?? "";
    expect(example).toContain("REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS");
    expect(example).toContain("REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD");
    expect(local).toContain("REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS");
    expect(local).toContain("REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD");
  });

  it("real run writes real secrets only to .env.local", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const example = files.find((f) => f.path === ".env.example")?.content ?? "";
    const local = files.find((f) => f.path === ".env.local")?.content ?? "";
    expect(example).not.toContain(secrets.authSecret);
    expect(example).not.toContain(secrets.postgresPassword);
    expect(local).toContain(secrets.authSecret);
    expect(local).toContain(secrets.postgresPassword);
  });

  it("docker compose isolates Postgres secrets and binds only to loopback", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const compose = files.find((f) => f.path === "docker-compose.yml")?.content ?? "";
    const parsed = Bun.YAML.parse(compose) as {
      services: {
        postgres: {
          env_file?: string;
          environment: Record<string, string>;
          ports: string[];
          stop_grace_period: string;
          volumes: string[];
        };
      };
    };
    const postgres = parsed.services.postgres;

    expect(postgres.env_file).toBeUndefined();
    expect(Object.keys(postgres.environment).sort()).toEqual([
      "POSTGRES_DB",
      "POSTGRES_PASSWORD",
      "POSTGRES_USER",
    ]);
    expect(postgres.environment).toEqual({
      POSTGRES_USER: "${POSTGRES_USER:?POSTGRES_USER is required}",
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}",
      POSTGRES_DB: "${POSTGRES_DB:?POSTGRES_DB is required}",
    });
    expect(postgres.ports).toEqual(["127.0.0.1:${POSTGRES_PORT:-5432}:5432"]);
    expect(postgres.stop_grace_period).toBe("30s");
    expect(postgres.volumes).toEqual(["postgres_data:/var/lib/postgresql"]);
    expect(compose).toContain("Postgres 18 stores versioned data");
    expect(compose).not.toContain("/var/lib/postgresql/data");
    expect(compose).toContain("docker compose --env-file .env.local up -d");
    expect(compose).not.toContain(secrets.authSecret);
    expect(compose).not.toContain(secrets.postgresPassword);
  });

  it("gives root start ownership to web in multi-app monorepos for every runtime", () => {
    for (const runtime of ["bun", "node"] as const) {
      const files = rootFiles("demo", secrets, { dryRun: false }, runtime, undefined, "none", {
        mode: "monorepo",
        database: "postgres",
        framework: "nextjs",
        apps: ["web", "mobile", "desktop"],
        messaging: false,
        jobs: false,
        storage: false,
        eve: false,
      });
      const pkg = JSON.parse(files.find((file) => file.path === "package.json")?.content ?? "{}");

      expect(pkg.scripts.start).toBe("bun run --cwd apps/web start");
      expect(pkg.scripts.start).not.toBe("turbo run start");
    }
  });

  it("retains Turbo start ownership when no web app is selected", () => {
    const files = rootFiles("demo", secrets, { dryRun: false }, "bun", undefined, "none", {
      mode: "monorepo",
      database: "postgres",
      framework: "nextjs",
      apps: ["mobile", "desktop"],
      messaging: false,
      jobs: false,
      storage: false,
      eve: false,
    });
    const pkg = JSON.parse(files.find((file) => file.path === "package.json")?.content ?? "{}");

    expect(pkg.scripts.start).toBe("turbo run start");
  });
});
