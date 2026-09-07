import { file, type TemplateFile } from "../shared.js";

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
            "@repo/*": ["./packages/*/src"],
          },
        },
        exclude: [
          "node_modules",
          "dist",
          ".next",
          ".open-next",
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
services:
  postgres:
    image: postgres:18.4
    restart: unless-stopped
    env_file: .env.local
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_DB: \${POSTGRES_DB}
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
`,
  );
}
export function gitignore(): TemplateFile {
  return file(
    ".gitignore",
    `node_modules
dist
.next
.open-next
.wrangler
.dev.vars
.dev.vars.*
!.dev.vars.example
.env*
!.env.example
.turbo
.ghostinit/
.ghostinit-staging/
.ghostinit.lock
apps/eve/.eve
apps/eve/dist
apps/eve/.env.local
`,
  );
}
export function readme(projectName: string, runtime: string): TemplateFile {
  return file("README.md", `# ${projectName}\nGenerated with ghostinit. Runtime: ${runtime}\n`);
}
export function githubWorkflow(runtime: string): TemplateFile {
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const setupBun =
    runtime === "bun"
      ? "      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: 1.4.0\n"
      : "";
  return file(
    ".github/workflows/ci.yml",
    `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${setupBun}      - run: ${installCmd}
      - run: ${runtime === "bun" ? "bun run lint" : "npm run lint"}
      - run: ${runtime === "bun" ? "bun run typecheck" : "npm run typecheck"}
      - run: ${runtime === "bun" ? "bun run build" : "npm run build"}
      - run: npx --yes ghostinit check 2>/dev/null || ${runtime === "bun" ? "bun run check" : "npm run check"} || true
`,
  );
}
