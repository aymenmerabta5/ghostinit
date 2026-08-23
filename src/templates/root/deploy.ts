import { file, type TemplateFile } from "../shared.js";
import type { DeployTarget } from "../../lib/addons.js";

function dockerfileContent(_projectName: string): string {
  return `# syntax=docker/dockerfile:1
# Requires BuildKit (default in modern Docker). COPY --parents preserves the
# workspace layout so bun install can resolve apps/*, packages/*, tooling/*.
FROM oven/bun:1.3.14 AS base
WORKDIR /app

# Manifests first for layer caching
COPY --parents package.json bun.lock* apps/*/package.json packages/*/package.json tooling/*/package.json ./
RUN bun install --frozen-lockfile || bun install

# Source + build
COPY . .
RUN bun run build

# Runtime — plain tag (slim/alpine variants lack toolchain needed by turbo)
FROM oven/bun:1.3.14
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

export function deployFiles(projectName: string, deploy: DeployTarget = "none"): TemplateFile[] {
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
  return [];
}
