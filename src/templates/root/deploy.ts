import { file, type TemplateFile } from "../shared.js";
import type {
  DeployTarget,
  FrameworkName,
  ProjectMode,
} from "../../lib/addons.js";

export interface DeployTemplateContext {
  mode: ProjectMode;
  framework: FrameworkName;
}

const CLOUDFLARE_COMPATIBILITY_DATE = "2026-09-02";

function dockerfileContent(_projectName: string): string {
  return `# syntax=docker/dockerfile:1
# Requires BuildKit (default in modern Docker). COPY --parents preserves the
# workspace layout so bun install can resolve apps/*, packages/*, tooling/*.
FROM oven/bun:1.4.0 AS base
WORKDIR /app

# Manifests first for layer caching
COPY --parents package.json bun.lock* apps/*/package.json packages/*/package.json tooling/*/package.json ./
RUN bun install --frozen-lockfile || bun install

# Source + build
COPY . .
RUN bun run build

# Runtime — plain tag (slim/alpine variants lack toolchain needed by turbo)
FROM oven/bun:1.4.0
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=base /app ./
EXPOSE 3000
# turbo start -> apps/web next start (or apps/web/server.ts for WS when messaging is on)
CMD ["bun", "run", "start"]
`;
}

function dockerignoreContent(): string {
  return `node_modules
dist
.next
.output
.turbo
.git
.ghostinit
.env
.env.local
data/uploads
convex/_generated
`;
}

function flyTomlContent(projectName: string): string {
  const sanitized = projectName.replace(/[^a-z0-9-]/g, "-").toLowerCase();
  return `app = "${sanitized}"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[services]]
  protocol = "tcp"
  internal_port = 3000
  processes = ["app"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[services.concurrency]
  type = "connections"
  hard_limit = 25
  soft_limit = 20
`;
}

function vercelJsonContent(): string {
  return JSON.stringify(
    {
      framework: "nextjs",
      buildCommand: "bun run build",
      installCommand: "bun install",
      outputDirectory: "apps/web/.next",
    },
    null,
    2,
  );
}

function cloudflareWranglerContent(
  projectName: string,
  context: DeployTemplateContext,
): string {
  const workerName =
    projectName
      .replace(/[^a-z0-9-]/g, "-")
      .toLowerCase()
      .replace(/^-+|-+$/g, "")
      .slice(0, 63)
      .replace(/-+$/g, "") || "ghostinit-app";
  const config: Record<string, unknown> = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: workerName,
    compatibility_date: CLOUDFLARE_COMPATIBILITY_DATE,
    compatibility_flags:
      context.framework === "nextjs"
        ? ["nodejs_compat", "global_fetch_strictly_public"]
        : ["nodejs_compat"],
    main:
      context.framework === "nextjs"
        ? ".open-next/worker.js"
        : "src/cloudflare-worker.ts",
    observability: { enabled: true },
  };

  if (context.framework === "nextjs") {
    config.assets = {
      directory: ".open-next/assets",
      binding: "ASSETS",
    };
  }

  return JSON.stringify(config, null, 2) + "\n";
}

function openNextConfigContent(): string {
  return `import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
`;
}

function cloudflareBuildScriptContent(): string {
  return `import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const forbiddenEnvFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
];
const monorepoRoot = resolve(process.cwd(), "../..");
const candidateRoots = [
  process.cwd(),
  ...(existsSync(resolve(monorepoRoot, "apps/web/package.json")) ? [monorepoRoot] : []),
];
const unsafe = candidateRoots.flatMap((root) =>
  forbiddenEnvFiles.map((name) => resolve(root, name)).filter(existsSync),
);
if (unsafe.length > 0) {
  console.error(
    "Refusing to build: OpenNext embeds .env* values in the Worker. Move local values to .dev.vars and configure production values in Cloudflare. Found: " +
      unsafe.join(", "),
  );
  process.exit(1);
}

const production = process.argv.includes("--production");
const dev = process.argv.includes("--dev");
if (!production && existsSync(".dev.vars")) {
  for (const line of readFileSync(".dev.vars", "utf8").split(/\\r?\\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const command = dev ? "next" : "opennextjs-cloudflare";
const args = dev ? ["dev"] : ["build"];
const result = spawnSync(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`;
}

function cloudflareViteScriptContent(): string {
  return `import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const action = process.argv[2] === "dev" ? "dev" : "build";
const production = process.argv.includes("--production");
if (!production && existsSync(".dev.vars")) {
  for (const line of readFileSync(".dev.vars", "utf8").split(/\\r?\\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const monorepoRoot = resolve(process.cwd(), "../..");
const roots = [
  process.cwd(),
  ...(existsSync(resolve(monorepoRoot, "apps/web/package.json")) ? [monorepoRoot] : []),
];
const unsafe = roots.flatMap((root) =>
  [".env", ".env.local", ".env.production", ".env.production.local"]
    .map((name) => resolve(root, name))
    .filter(existsSync),
);
if (unsafe.length > 0) {
  console.error("Refusing Worker build with secret-bearing .env files; use .dev.vars locally and Cloudflare variables in production: " + unsafe.join(", "));
  process.exit(1);
}
const result = spawnSync("vite", [action], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`;
}

function tanstackCloudflareWorkerContent(): string {
  return `import handler from "@tanstack/react-start/server-entry";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://us.i.posthog.com https://*.convex.cloud https://*.convex.site wss://*.convex.cloud; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
} as const;

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
`;
}

function cloudflareReadmeContent(context: DeployTemplateContext): string {
  const configDir = context.mode === "monorepo" ? "apps/web" : ".";
  const adapter =
    context.framework === "nextjs"
      ? "Next.js is packaged with @opennextjs/cloudflare."
      : "TanStack Start uses the native Cloudflare Vite plugin.";
  return `# Cloudflare Workers deployment

${adapter}

From the project root:

\`\`\`bash
bun run cf-typegen
bun run preview
bun run deploy
\`\`\`

The Wrangler project lives in \`${configDir}\`. Runtime secrets are never written
to \`wrangler.jsonc\`; local values are stored in the gitignored \`.dev.vars\`,
and production values belong in \`wrangler secret put\` or the Workers dashboard.
The Next.js Worker build refuses any \`.env*\` file because OpenNext serializes
those values into its output. Public \`NEXT_PUBLIC_*\` / \`VITE_*\` values required
while building must separately be configured as Workers Builds variables or
build secrets. Server values evaluated during the build (including
\`BETTER_AUTH_SECRET\`, \`BETTER_AUTH_URL\`, \`CONVEX_URL\`, and
\`CONVEX_SITE_URL\`) need build-time copies as well as runtime bindings;
build-only values are not available to the deployed Worker.

Run \`bun run convex:deploy\` first, then replace the example Convex URLs in
\`.dev.vars\` and configure the production \`CONVEX_URL\`,
\`CONVEX_SITE_URL\`, plus \`NEXT_PUBLIC_CONVEX_URL\` or \`VITE_CONVEX_URL\`
for the selected framework.

Supported database modes are \`convex\` and \`none\`. PostgreSQL is rejected
until GhostInit provides a request-scoped Hyperdrive adapter. Eve, server-side
PDF rendering, and the Bun/local-filesystem messaging runtime are also rejected
rather than producing a deployment that fails at runtime.
`;
}

export function deployFiles(
  projectName: string,
  deploy: DeployTarget = "none",
  context: DeployTemplateContext = { mode: "monorepo", framework: "nextjs" },
): TemplateFile[] {
  if (deploy === "none") return [];
  if (deploy === "docker") {
    return [
      file("Dockerfile", dockerfileContent(projectName)),
      file(".dockerignore", dockerignoreContent()),
    ];
  }
  if (deploy === "fly") {
    return [
      file("Dockerfile", dockerfileContent(projectName)),
      file(".dockerignore", dockerignoreContent()),
      file("fly.toml", flyTomlContent(projectName)),
    ];
  }
  if (deploy === "vercel") {
    return [file("vercel.json", vercelJsonContent())];
  }
  if (deploy === "cloudflare") {
    const base = context.mode === "monorepo" ? "apps/web/" : "";
    const files = [
      file(`${base}wrangler.jsonc`, cloudflareWranglerContent(projectName, context)),
      file("CLOUDFLARE.md", cloudflareReadmeContent(context)),
    ];
    if (context.framework === "nextjs") {
      files.push(file(`${base}open-next.config.ts`, openNextConfigContent()));
      files.push(file(`${base}scripts/build-cloudflare.mjs`, cloudflareBuildScriptContent()));
    } else {
      files.push(file(`${base}src/cloudflare-worker.ts`, tanstackCloudflareWorkerContent()));
      files.push(file(`${base}scripts/vite-cloudflare.mjs`, cloudflareViteScriptContent()));
    }
    return files;
  }
  return [];
}
