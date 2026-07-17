import { describe, it, expect } from "bun:test";
import { rootFiles } from "../../src/templates/root";
import type { RootSecrets } from "../../src/templates/root";

const secrets: RootSecrets = {
  authSecret: "test_auth_secret_value_at_least_32_chars",
  postgresPassword: "test_postgres_password_value_at_least_32",
};

describe("root template files", () => {
  it("does not generate a committed .env file", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(".env");
    expect(paths).toContain(".env.example");
    expect(paths).toContain(".env.local");
    expect(paths).toContain("apps/web/.env.local");
  });

  it("gitignore blocks .env and .env.local", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const gitignore = files.find((f) => f.path === ".gitignore")?.content ?? "";
    expect(gitignore).toContain(".env\n");
    expect(gitignore).toContain(".env.local\n");
    expect(gitignore).toContain(".env.*.local\n");
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

  it("docker compose references env_file and does not hardcode postgres password", () => {
    const files = rootFiles("demo", secrets, { dryRun: false });
    const compose = files.find((f) => f.path === "docker-compose.yml")?.content ?? "";
    expect(compose).toContain("env_file: .env");
    expect(compose).not.toContain("POSTGRES_PASSWORD:");
    expect(compose).not.toContain("postgres_password");
  });
});
