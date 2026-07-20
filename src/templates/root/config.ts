import { file, type TemplateFile } from "../shared.js";

export function rootTsConfig(): TemplateFile {
  return file(
    "tsconfig.json",
    JSON.stringify(
      {
        extends: "./packages/typescript-config/base.json",
        compilerOptions: {
          baseUrl: ".",
          noEmit: true,
          incremental: true,
          composite: false,
          paths: {
            "@/*": ["./src/*", "./apps/*/src/*", "./packages/*/src/*"],
            "@repo/*": ["packages/*/src", "tooling/*/src"],
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
export function oxlintConfig(): TemplateFile {
  return file(
    ".oxlintrc.json",
    JSON.stringify({ extends: ["./tooling/oxlint.json"] }, null, 2) + "\n",
  );
}
export function oxlintIgnore(): TemplateFile {
  return file(".oxlintignore", `node_modules\ndist\n.next\n`);
}
export function oxfmtConfig(): TemplateFile {
  return file(".oxfmtrc.json", JSON.stringify({ extends: "./tooling/oxfmt.json" }, null, 2) + "\n");
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
.env
.env.local
.env.*.local
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
  return file(
    ".github/workflows/ci.yml",
    `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ${runtime === "bun" ? "bun install && bun run build" : "npm install && npm run build"}\n`,
  );
}
