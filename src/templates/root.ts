import { type GenerateContext, type TemplateFile, file, packageJson } from "./shared.js";
import * as v from "./versions.js";

export interface RootSecrets {
  authSecret: string;
  postgresPassword: string;
}

export function rootFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
  runtime: "node" | "bun" = "bun",
): TemplateFile[] {
  return [
    rootPackageJson(projectName, runtime),
    ...(runtime === "bun" ? [bunfig()] : []),
    turbo(runtime),
    oxlintConfig(),
    oxlintIgnore(),
    oxfmtConfig(),
    dockerCompose(),
    envExample(projectName, secrets, ctx),
    envLocal(projectName, secrets, ctx),
    webEnvLocal(projectName, secrets, ctx),
    gitignore(),
    readme(projectName, runtime),
    githubWorkflow(runtime),
  ];
}

function rootPackageJson(projectName: string, runtime: "node" | "bun"): TemplateFile {
  // Root scripts are turbo pipelines so they dispatch to the correct workspace scripts for both Bun and Node runtimes.
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const content = packageJson({
    name: projectName,
    private: true,
    type: "module",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10`,
    workspaces: ["apps/*", "packages/*", "tooling/*"],
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      start: "turbo run start",
      typecheck: "turbo run typecheck",
      test: "turbo run test",
      lint: "turbo run lint",
      format: "turbo run format",
      "format:check": "turbo run format:check",
      "db:generate": "turbo run db:generate",
      "db:migrate": "turbo run db:migrate",
      "db:push": "turbo run db:push",
      // Convenience scripts for direct project-wide operations.
      "install:cmd": installCmd,
    },
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      turbo: `^${v.tooling.turbo}`,
      typescript: `^${v.typescript.typescript}`,
    },
  }).replace(`"name": "${projectName}"`, '"name": "__PROJECT_NAME__"');

  return file("package.json", content);
}

function bunfig(): TemplateFile {
  return file("bunfig.toml", '[install]\nhoist = false\n\n[install.lockfile]\npath = "bun.lock"\n');
}

function turbo(runtime: "node" | "bun"): TemplateFile {
  const envList = [
    "NODE_ENV",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "POSTGRES_PASSWORD",
    "DATABASE_SSL",
    "DATABASE_POOL_SIZE",
  ];
  if (runtime === "node") {
    envList.push(
      "npm_config_user_agent",
      "npm_config_registry",
      "NPM_CONFIG_USER_AGENT",
      "NPM_CONFIG_REGISTRY",
    );
  }
  return file(
    "turbo.json",
    JSON.stringify(
      {
        $schema: "https://turbo.build/schema.json",
        globalEnv: envList,
        tasks: {
          build: { dependsOn: ["^build"], outputs: ["dist/**", ".next/**"] },
          typecheck: { dependsOn: ["^build"] },
          test: { dependsOn: ["^build"] },
          lint: {},
          format: {},
          "format:check": {},
          dev: { cache: false, persistent: true },
          start: {},
          "db:generate": { cache: false },
          "db:migrate": { cache: false },
          "db:push": { cache: false },
        },
      },
      null,
      2,
    ) + "\n",
  );
}

function oxlintConfig(): TemplateFile {
  return file(
    ".oxlintrc.json",
    JSON.stringify(
      {
        $schema: "./node_modules/oxlint/configuration_schema.json",
        plugins: ["typescript", "unicorn", "oxc"],
        categories: { correctness: "error" },
        rules: {},
        env: { builtin: true },
        ignorePatterns: ["node_modules", "dist", ".next", "*.d.ts"],
      },
      null,
      2,
    ) + "\n",
  );
}

function oxlintIgnore(): TemplateFile {
  return file(".oxlintignore", "node_modules\ndist\n.next\n*.d.ts\n");
}

function oxfmtConfig(): TemplateFile {
  return file(
    ".oxfmtrc.json",
    JSON.stringify(
      {
        $schema: "./node_modules/oxfmt/configuration_schema.json",
        ignorePatterns: ["node_modules", "dist", ".next"],
      },
      null,
      2,
    ) + "\n",
  );
}

function dockerCompose(): TemplateFile {
  return file(
    "docker-compose.yml",
    `services:\n  postgres:\n    image: ${v.postgresDocker.image}\n    container_name: __PROJECT_NAME___postgres\n    env_file: .env.local\n    environment:\n      POSTGRES_USER: postgres\n      POSTGRES_DB: __PROJECT_NAME__\n    ports:\n      - "5432:5432"\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      timeout: 5s\n      retries: 5\n\nvolumes:\n  postgres_data:\n`,
  );
}

function envExample(
  projectName: string,
  _secrets: RootSecrets,
  _ctx: GenerateContext,
): TemplateFile {
  return file(".env.example", envPlaceholderContent(projectName));
}

function envLocal(projectName: string, secrets: RootSecrets, ctx: GenerateContext): TemplateFile {
  return file(".env.local", envLocalContent(projectName, secrets, ctx));
}

function webEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
): TemplateFile {
  return file("apps/web/.env.local", envLocalContent(projectName, secrets, ctx));
}

function envPlaceholderContent(projectName: string): string {
  return `BETTER_AUTH_SECRET=${Placeholders.BETTER_AUTH_SECRET}\nBETTER_AUTH_URL=http://localhost:3000\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nAPP_NAME=${projectName}\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${Placeholders.POSTGRES_PASSWORD}\nPOSTGRES_HOST=localhost\nPOSTGRES_PORT=5432\nPOSTGRES_DB=${projectName}\nDATABASE_SSL=false\nDATABASE_POOL_SIZE=20\n`;
}

function envLocalContent(_projectName: string, secrets: RootSecrets, ctx: GenerateContext): string {
  if (ctx.dryRun) {
    return envPlaceholderContent(_projectName);
  }
  return `BETTER_AUTH_SECRET=${secrets.authSecret}\nBETTER_AUTH_URL=http://localhost:3000\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nAPP_NAME=${_projectName}\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${secrets.postgresPassword}\nPOSTGRES_HOST=localhost\nPOSTGRES_PORT=5432\nPOSTGRES_DB=${_projectName}\nDATABASE_SSL=false\nDATABASE_POOL_SIZE=20\n`;
}

const Placeholders = {
  BETTER_AUTH_SECRET: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
  POSTGRES_PASSWORD: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
} as const;

function gitignore(): TemplateFile {
  return file(
    ".gitignore",
    `# Dependencies and artifacts\nnode_modules\ndist\n.next\n*.map\n*.tsbuildinfo

# GhostInit internal state
.ghostinit/
.ghostinit.lock

# Environment files - never commit secrets\n.env\n.env.local\n.env.*.local\n.env.production\n.env.development\n.DS_Store\n*.log\ncoverage\nplaywright-report\ntest-results\n`,
  );
}

function readme(projectName: string, runtime: "node" | "bun"): TemplateFile {
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const runCmd = runtime === "bun" ? "bun run" : "npm run";
  const content =
    `# ${projectName}\n\nGenerated by [GhostInit](https://github.com/ghostinit/ghostinit).\n\n## Getting Started\n\n\`\`\`bash\ncp .env.example .env.local\n${installCmd}\ndocker compose up -d\n${runCmd} db:generate\n${runCmd} db:migrate\n${runCmd} dev\n\`\`\`\n\n> Security note: \`.env.local\` is generated with local development secrets and is ignored by Git. Never commit it. Copy \`.env.example\` to \`.env\` for deployment configuration and wire real secrets via your secrets manager or platform dashboard.\n\n## Scripts\n\n- \`${runCmd} dev\` - Start the Next.js dev server\n- \`${runCmd} build\` - Production build\n- \`${runCmd} typecheck\` - Type check the monorepo\n- \`${runCmd} test\` - Run unit and integration tests\n- \`${runCmd} lint\` - Lint with oxlint and format-check with oxfmt\n`.replace(
      projectName,
      "__PROJECT_NAME__",
    );

  return file("README.md", content);
}

function githubWorkflow(runtime: "node" | "bun"): TemplateFile {
  const installCmd = runtime === "bun" ? "bun install" : "npm install";
  const runCmd = runtime === "bun" ? "bun run" : "npm run";
  const setup =
    runtime === "bun"
      ? `      - uses: oven-sh/setup-bun@v1\n        with:\n          bun-version: ${v.runtime.bun}`
      : `      - uses: actions/setup-node@v4\n        with:\n          node-version: "22"\n          cache: "npm"`;
  return file(
    ".github/workflows/ci.yml",
    `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${setup}

      - name: Install dependencies
        run: ${installCmd}

      - name: Format check
        run: ${runCmd} format:check

      - name: Lint
        run: ${runCmd} lint

      - name: Type check
        run: ${runCmd} typecheck

      - name: Test
        run: ${runCmd} test

      - name: Build
        run: ${runCmd} build
`,
  );
}
