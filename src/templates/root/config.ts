import { file, type TemplateFile } from "../shared.js";
import { generatedGitignoreContent } from "../gitignore.js";
import * as v from "../versions.js";

export function rootTsConfig(): TemplateFile {
  return file(
    "tsconfig.json",
    JSON.stringify(
      {
        extends: "./packages/typescript-config/base.json",
        compilerOptions: {
          noEmit: true,
          incremental: true,
          composite: false,
          paths: {
            "@/*": ["./src/*"],
            "@repo/services/application": ["./packages/services/src/application/index.ts"],
            "@repo/*": ["./packages/*/src", "./tooling/*/src"],
            "@repo/config": ["./packages/config/src/index.ts"],
            "@repo/config/server": ["./packages/config/src/server.ts"],
            "@repo/config/desktop-main": ["./packages/config/src/desktop-main.ts"],
            "@repo/config/next": ["./packages/config/src/next.ts"],
            "@repo/config/vite": ["./packages/config/src/vite.ts"],
            "@repo/config/expo": ["./packages/config/src/expo.ts"],
          },
        },
        exclude: [
          "node_modules",
          "dist",
          ".next",
          ".output",
          ".turbo",
          "apps/*/dist",
          "apps/*/.next",
          "packages/*/dist",
        ],
        references: [
          { path: "packages/typescript-config" },
          { path: "packages/config" },
          { path: "packages/kernel" },
          { path: "packages/contracts" },
          { path: "packages/observability" },
          { path: "packages/database" },
          { path: "packages/auth" },
          { path: "packages/billing" },
          { path: "packages/api" },
          { path: "packages/modules" },
          { path: "packages/services" },
          { path: "packages/ui" },
          { path: "apps/web" },
          { path: "apps/mobile" },
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
/**
 * Self-contained lint/format config.
 *
 * These previously did `extends: ["./tooling/oxlint.json"]` (and the oxfmt
 * equivalent), but no such file was ever emitted — so `bun run lint` failed in
 * every generated project with "invalid config file ... NotFound" for every
 * package. There is no shared tooling config package in the output, so inline it.
 */
export function oxlintConfig(): TemplateFile {
  return file(
    ".oxlintrc.json",
    JSON.stringify(
      {
        $schema: "./node_modules/oxlint/configuration_schema.json",
        plugins: ["typescript", "unicorn", "oxc"],
        categories: { correctness: "error" },
        env: { builtin: true },
        ignorePatterns: [
          "node_modules",
          "dist",
          ".next",
          ".output",
          ".turbo",
          ".vercel",
          "convex/_generated",
          "**/routeTree.gen.ts",
          "*.d.ts",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
export function oxlintIgnore(): TemplateFile {
  return file(".oxlintignore", `node_modules\ndist\n.next\n.output\n.turbo\n`);
}
export function oxfmtConfig(): TemplateFile {
  return file(
    ".oxfmtrc.json",
    JSON.stringify(
      {
        ignorePatterns: [
          "node_modules",
          "dist",
          ".next",
          ".output",
          ".turbo",
          "convex/_generated",
          "**/routeTree.gen.ts",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
export function dockerCompose(): TemplateFile {
  return file(
    "docker-compose.yml",
    `version: "3.8"
# Supply interpolation values without injecting the complete application environment:
# docker compose --env-file .env.local up -d
services:
  postgres:
    image: ${v.postgresDocker.image}
    restart: unless-stopped
    stop_grace_period: 30s
    environment:
      POSTGRES_USER: "\${POSTGRES_USER:?POSTGRES_USER is required}"
      POSTGRES_PASSWORD: "\${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
      POSTGRES_DB: "\${POSTGRES_DB:?POSTGRES_DB is required}"
    ports:
      - "127.0.0.1:\${POSTGRES_PORT:-5432}:5432"
    volumes:
      # Postgres 18 stores versioned data below /var/lib/postgresql/18/docker.
      # Mount the parent so upgrades retain the image-managed directory layout.
      - postgres_data:/var/lib/postgresql
volumes:
  postgres_data:
`,
  );
}
export function gitignore(): TemplateFile {
  return file(".gitignore", generatedGitignoreContent());
}
export function readme(projectName: string, runtime: string): TemplateFile {
  return file(
    "README.md",
    `# ${projectName}
Generated with ghostinit. Runtime: ${runtime}

Dependency installs reject package versions published less than ${v.supplyChain.minimumReleaseAgeSeconds} seconds ago. The generated \`bunfig.toml\` has no minimum-release-age exclusions.
`,
  );
}
export function githubWorkflow(runtime: string): TemplateFile {
  void runtime;
  return file(
    ".github/workflows/ci.yml",
    `name: CI
on: [push, pull_request]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: ${v.runtime.bun}
      - name: Install frozen dependencies
        run: bun install --frozen-lockfile
      - name: Audit dependencies for high-severity vulnerabilities
        run: bun run audit:dependencies
      - name: Check repository whitespace
        run: |
          empty_tree="$(git hash-object -t tree /dev/null)"
          git diff --check "$empty_tree" HEAD
      - name: Check formatting
        run: bun run format:check
      - name: Run blocking lint, boundary, and security checks
        run: bun run lint:all
      - name: Run generated project tests
        run: bun run test
      - name: Build generated project
        run: bun run build
      - name: Run pinned architecture checker
        shell: bash
        run: |
          report="$RUNNER_TEMP/ghostinit-architecture-check.json"
          bunx --bun ghostinit@${v.ghostinitVersion} check --json > "$report"
          REPORT_PATH="$report" bun -e '
            const reportPath = process.env.REPORT_PATH;
            if (!reportPath) throw new Error("architecture report path is missing");
            const payload = JSON.parse(await Bun.file(reportPath).text());
            if (
              payload.$schema !== "https://ghostinit.dev/schemas/json-envelope.schema.json" ||
              payload.schemaVersion !== 2 ||
              payload.success !== true ||
              payload.exitCode !== 0 ||
              payload.meta?.command !== "check" ||
              payload.data?.summary?.blockers !== 0 ||
              payload.data?.summary?.highs !== 0 ||
              !Array.isArray(payload.data?.findings) ||
              payload.data.findings.some(
                (finding) => finding?.severity === "HIGH" || finding?.severity === "BLOCKER"
              )
            ) {
              throw new Error("architecture check returned a failing JSON envelope");
            }
          '
      - name: Verify checks leave no tracked changes
        run: |
          git diff --check
          git diff --exit-code
`,
  );
}
