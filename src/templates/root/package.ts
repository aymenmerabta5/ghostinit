import { file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";
import { jobsAdapterIntegrationGuide } from "../adapters/jobs/index.js";
import {
  hasPersistentPostgresStorage,
  nodeEngineSelector,
  hasPersistentPostgresJobs,
  usesCustomNextServer,
  type DeploymentProfile,
} from "./deploy.js";
import { OPENNEXT_AWS_WINDOWS_PATCH_KEY, OPENNEXT_AWS_WINDOWS_PATCH_PATH } from "./cloudflare.js";
import { hasHostedWebEve } from "./eve-lifecycle.js";
import { customNextServerCommand } from "./next-server-runtime.js";

type AddonMapInput = AddonInstallerMap | Record<string, { inUse: boolean }> | undefined;

function isConvexAddon(input?: AddonMapInput): boolean {
  if (!input) return false;
  try {
    return hasAddon(input as AddonInstallerMap, "convex");
  } catch {
    return Boolean((input as Record<string, { inUse?: boolean }>).convex?.inUse);
  }
}

export function rootPackageJson(
  projectName: string,
  runtime: "node" | "bun",
  addonMap?: AddonMapInput,
  profile?: Partial<DeploymentProfile>,
): TemplateFile {
  const installCmd = "bun install";
  const isConvex = isConvexAddon(addonMap);
  const hasAuth = addonMap ? hasAddon(addonMap as AddonInstallerMap, "auth") : true;
  const hasPdf = addonMap ? hasAddon(addonMap as AddonInstallerMap, "pdf") : false;
  const database = profile?.database ?? (isConvex ? "convex" : "postgres");
  const hasJobs = profile?.jobs === true;
  const hasWeb = (profile?.apps ?? ["web"]).includes("web");
  const hasMobile = (profile?.apps ?? []).includes("mobile");
  const hasEve = profile?.eve === true;
  const isCloudflare = addonMap ? hasAddon(addonMap as AddonInstallerMap, "cloudflare") : false;
  const hostedEve = hasHostedWebEve(profile);
  const webStart = usesCustomNextServer(profile)
    ? customNextServerCommand(runtime, "start")
    : hasWeb
      ? "bun run --cwd apps/web start"
      : "turbo run start";
  const pinnedGhostinit = `bunx --bun ghostinit@${v.ghostinitVersion}`;

  const baseScripts: Record<string, string> = {
    dev: "turbo run dev",
    build: hostedEve ? "bun scripts/build-with-eve.mjs" : "turbo run build",
    start: hostedEve ? "bun --env-file=.env.local run start:production" : webStart,
    typecheck: "turbo run typecheck",
    test: "turbo run test",
    lint: "oxlint --deny-warnings . && bun scripts/check-import-aliases.cjs && bun scripts/check-next-parity.cjs && bun scripts/check-navigation-imports.cjs",
    "lint:oxlint": "oxlint --deny-warnings .",
    "lint:imports": "bun scripts/check-import-aliases.cjs",
    "lint:next-parity": "bun scripts/check-next-parity.cjs",
    "lint:navigation": "bun scripts/check-navigation-imports.cjs",
    "lint:architecture": "bun scripts/check-feature-folder.cjs",
    "lint:rtl": "bun scripts/check-rtl-logical.cjs",
    "lint:animations": "bun scripts/check-animation-imports.cjs",
    "lint:server-only": "bun scripts/check-server-only.cjs",
    "lint:all":
      "bun run lint && bun run lint:architecture && bun run lint:rtl && bun run lint:animations && bun run lint:server-only && bun run typecheck",
    format: "turbo run format",
    "format:check": "turbo run format:check",
    check: `${pinnedGhostinit} check`,
    "check:fix": `${pinnedGhostinit} check --fix`,
    "doctor:fix": `${pinnedGhostinit} doctor --fix`,
    prepare: "husky",
    "install:cmd": installCmd,
  };

  if (isCloudflare && hasWeb) {
    // Cloudflare's ordinary build must produce the audited Worker artifact,
    // not an unscanned framework-only bundle. Retain selected native client
    // builds without letting Turbo invoke the web package a second time.
    const hasNativeApps = (profile?.apps ?? []).some(
      (app) => app === "mobile" || app === "desktop",
    );
    baseScripts.dev = hasNativeApps ? "bun scripts/cloudflare-workspace.mjs dev" : "turbo run dev";
    baseScripts.build = hasNativeApps
      ? "bun run build:worker && bun run build:native"
      : "bun run build:worker";
    if (hasNativeApps) baseScripts["build:native"] = "bun scripts/cloudflare-workspace.mjs build";
    baseScripts.start = "bun run preview";
    baseScripts["build:worker"] = "bun run --cwd apps/web build:worker";
    baseScripts.preview = "bun run --cwd apps/web preview";
    baseScripts.deploy = "bun run --cwd apps/web deploy";
    baseScripts["cloudflare:dry-run"] = "bun run --cwd apps/web cloudflare:dry-run";
    baseScripts["cf-typegen"] = "bun run --cwd apps/web cf-typegen";
  }

  if (hasEve) {
    baseScripts["eve:build"] = "bun --env-file=.env.local run --cwd apps/eve build";
    baseScripts["eve:dev"] = "bun --env-file=.env.local run --cwd apps/eve dev:diagnostic";
    baseScripts["eve:start"] = "bun --env-file=.env.local run --cwd apps/eve start:diagnostic";
  }
  if (hostedEve) {
    baseScripts["start:web"] = webStart;
    baseScripts["start:eve"] = "node apps/eve/.output/server/index.mjs";
    baseScripts["start:production"] = "bun scripts/start-production.mjs";
  }

  if (hasJobs && database !== "none") {
    const jobsScripts: Record<string, string> = {
      ...jobsAdapterIntegrationGuide({ mode: "monorepo", database, runtime }).packageScripts,
    };
    Object.assign(baseScripts, jobsScripts);
  }
  if (hasWeb && (hasPersistentPostgresJobs(profile) || hasPersistentPostgresStorage(profile))) {
    if (hasPersistentPostgresJobs(profile)) baseScripts["start:web"] = webStart;
    baseScripts["start:production"] = "bun scripts/start-production.mjs";
  }

  const scripts: Record<string, string> = isConvex
    ? {
        ...baseScripts,
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
        "convex:dev:once": "convex dev --once",
      }
    : {
        ...baseScripts,
        "db:generate": "turbo run db:generate",
        "db:migrate": "turbo run db:migrate",
        "db:push": "turbo run db:push",
      };
  if (isCloudflare && isConvex) {
    scripts["convex:bootstrap"] = "bun scripts/cloudflare-convex.mjs bootstrap";
    scripts["convex:dev"] = "bun scripts/cloudflare-convex.mjs dev";
    scripts["convex:deploy"] = "bun scripts/cloudflare-convex.mjs deploy";
    scripts["convex:codegen"] = "bun scripts/cloudflare-convex.mjs codegen";
    scripts["convex:dev:once"] = "bun scripts/cloudflare-convex.mjs dev -- --once";
  }

  const content = packageJson({
    name: projectName,
    private: true,
    type: "module",
    engines: {
      bun: v.runtime.bun,
      ...(runtime === "node" ? { node: nodeEngineSelector() } : {}),
    },
    packageManager: `bun@${v.runtime.bun}`,
    workspaces: ["apps/*", "packages/*", "tooling/*"],
    scripts,
    dependencies: isConvex
      ? {
          "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
          ...(hasAuth
            ? {
                ...(hasMobile ? { "@better-auth/expo": `^${v.auth["@better-auth/expo"]}` } : {}),
                "@repo/auth": "workspace:*",
                "better-auth": `^${v.auth["better-auth"]}`,
              }
            : {}),
        }
      : {},
    overrides: hasPdf ? { pdfkit: v.pdf.pdfkit } : undefined,
    patchedDependencies:
      isCloudflare && profile?.framework === "nextjs"
        ? { [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH }
        : undefined,
    devDependencies: {
      "bun-types": `^${v.runtime.bun}`,
      ...(isCloudflare ? { dotenv: `^${v.cloudflare.dotenv}` } : {}),
      ...(isConvex ? { convex: `^${v.convex.convex}` } : {}),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      "oxc-parser": v.tooling["oxc-parser"],
      turbo: `^${v.tooling.turbo}`,
      husky: `^${v.tooling.husky}`,
      typescript: `^${v.typescript.typescript}`,
    },
  }).replace(`"name": "${projectName}"`, '"name": "__PROJECT_NAME__"');
  return file("package.json", content);
}

export function bunfig(): TemplateFile {
  return file(
    "bunfig.toml",
    `[install]
hoist = true
registry = "https://registry.npmjs.org/"
minimumReleaseAge = ${v.supplyChain.minimumReleaseAgeSeconds}
minimumReleaseAgeExcludes = []

[install.lockfile]
path = "bun.lock"
`,
  );
}
