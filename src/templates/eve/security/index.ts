import type { DatabaseProvider, FrameworkName, ProjectMode } from "../../../lib/addons.js";
import type { TemplateFile } from "../../shared.js";
import { securedEveChannelFile } from "./channel.js";
import {
  convexEveAdmissionAdapterFile,
  convexEveActorFile,
  convexEveFunctionsFile,
  convexEveOwnershipAdapterFile,
} from "./convex.js";
import { eveFacadeFile, eveFacadeIndexFile, eveFacadeRouteFiles } from "./facade.js";
import { eveAdmissionLifecycleHookFile } from "./hook.js";
import {
  eveAdmissionReconcilerFile,
  eveLifecycleCallbackFile,
  eveLifecycleCallbackRouteFile,
} from "./lifecycle.js";
import { tanstackEveAgentHeaderFile, tanstackEveAgentPageFile } from "./page.js";
import { eveFacadePolicyFile } from "./policy.js";
import {
  postgresEveActorFile,
  postgresEveAdmissionAdapterFile,
  postgresEveOwnershipAdapterFile,
} from "./postgres.js";
import { convexEveOwnershipSchemaFile, postgresEveOwnershipSchemaFile } from "./schema.js";
import {
  eveAdmissionServiceFile,
  eveOwnershipServiceFile,
  eveOwnershipServiceIndexFile,
} from "./service.js";
import { eveAdmissionStreamFile } from "./stream.js";

export interface EveSecurityIntegrationOptions {
  readonly auth: boolean;
  readonly database: DatabaseProvider;
  readonly eve: boolean;
  readonly framework: FrameworkName;
  readonly mode: ProjectMode;
  readonly web: boolean;
}

function upsert(
  files: readonly TemplateFile[],
  additions: readonly TemplateFile[],
): TemplateFile[] {
  const replacements = new Map(additions.map((entry) => [entry.path, entry]));
  const seen = new Set<string>();
  const result = files.map((entry) => {
    const replacement = replacements.get(entry.path);
    if (!replacement) return entry;
    seen.add(entry.path);
    return replacement;
  });
  for (const addition of additions) if (!seen.has(addition.path)) result.push(addition);
  return result;
}

function patch(
  files: readonly TemplateFile[],
  path: string,
  transform: (content: string) => string,
): TemplateFile[] {
  let found = false;
  const result = files.map((entry) => {
    if (entry.path !== path) return entry;
    found = true;
    return { ...entry, content: transform(entry.content) };
  });
  if (!found) throw new Error(`Eve security integration requires ${path}`);
  return result;
}

function addLine(content: string, line: string): string {
  return content.includes(line) ? content : `${content.trimEnd()}\n${line}\n`;
}

function patchManifestExport(content: string, key: string, target: string): string {
  const manifest = JSON.parse(content) as Record<string, unknown>;
  const exports = (manifest.exports ?? {}) as Record<string, string>;
  exports[key] = target;
  manifest.exports = Object.fromEntries(
    Object.entries(exports).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function patchManifestDependency(content: string, name: string, version: string): string {
  const manifest = JSON.parse(content) as Record<string, unknown>;
  const dependencies = (manifest.dependencies ?? {}) as Record<string, string>;
  dependencies[name] = version;
  manifest.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function patchTanStackEveEnvironment(content: string): string {
  return content
    .replace(
      "# Leave origin empty for the integrated withEve process; set it for a separate Eve service",
      "# TanStack Start forwards only to this private Eve service origin; override it in production",
    )
    .replace(
      /^EVE_NEXT_PRODUCTION_ORIGIN=.*$/m,
      "EVE_NEXT_PRODUCTION_ORIGIN=http://127.0.0.1:4274",
    );
}

function patchAgentPage(content: string): string {
  return content
    .replace(/useEveAgent\(\)/g, 'useEveAgent({ host: "/api/agent" })')
    .replace(
      /Mounted same-origin via withEve\. Cookie auth flows[^<.]*(?:\.)?/g,
      "Authenticated through the same-origin application boundary.",
    )
    .replace(
      /same-origin \/eve\/v1\/\*, cookie auth flows Better Auth/g,
      "same-origin /api/agent/eve/v1/* with authoritative Better Auth and ownership checks",
    )
    .replace(
      /withEve\(config\) exposes its \/eve\/v1\/\* routes on the application origin\./g,
      "Browser requests use /api/agent/eve/v1/*, which verifies identity and durable-session ownership before forwarding.",
    );
}

function patchProtectedPaths(content: string): string {
  const marker = 'export const PROTECTED_PATHS = ["/dashboard"';
  if (!content.includes(marker)) throw new Error("Eve security could not find protected path list");
  return content.replace(marker, 'export const PROTECTED_PATHS = ["/agent", "/dashboard"');
}

function patchSingleDatabaseIndex(content: string): string {
  let result = content;
  const importLine = "import * as eveSchema from './schema/eve';";
  if (!result.includes(importLine)) {
    const anchor = "import * as authSchema from './schema/auth';";
    if (!result.includes(anchor)) throw new Error("Eve security could not find auth schema import");
    result = result.replace(anchor, `${anchor}\n${importLine}`);
  }
  if (!result.includes("...eveSchema")) {
    result = result.replace(/schema:\s*\{([^}]*)\}/s, (_match, body: string) => {
      const existing = body.trim().replace(/,\s*$/, "");
      return `schema: { ${existing}, ...eveSchema }`;
    });
  }
  return result;
}

function patchConvexRootSchema(content: string): string {
  let result = content;
  const importLine = 'import { eveTables } from "./schema/eve";';
  if (!result.includes(importLine)) result = `${importLine}\n${result}`;
  if (!result.includes("...eveTables,")) {
    const marker = "export default defineSchema({";
    if (!result.includes(marker)) throw new Error("Eve security could not find Convex schema root");
    result = result.replace(marker, `${marker}\n  ...eveTables,`);
  }
  return result;
}

function patchEveSecurityDocs(content: string): string {
  const line =
    "- Browser Eve traffic must use `/api/agent/eve/v1/*`; raw `/eve/v1/*` routes accept only the generated server-side proxy credential, and every durable session operation is owner/tenant checked.";
  const updated = content
    .replace(
      "Eve is emitted as `apps/eve`; do not assume a web-framework mounting adapter that was not generated.",
      "Eve is emitted as `apps/eve`; TanStack Start mounts the authenticated application facade at `/api/agent`, while the standalone Eve process remains private.",
    )
    .replace(
      "The project root is the Eve application root and `agent/` is its authored surface. No web-framework mounting adapter is generated for this target; `bun run eve:dev` and `bun run eve:start` operate the standalone backend.",
      "The project root is the Eve application root and `agent/` is its authored surface. TanStack Start mounts the authenticated application facade at `/api/agent`; `bun run eve:dev` and `bun run eve:start` operate the private standalone backend.",
    )
    .replace(
      "This TanStack Start output does not generate a framework mounting adapter; run Eve as a standalone backend and configure clients with its host when needed.",
      "TanStack Start mounts an authenticated application facade at `/api/agent`; run Eve as a private standalone backend and set `EVE_NEXT_PRODUCTION_ORIGIN` to that service origin.",
    );
  return updated.includes(line) ? updated : `${updated.trimEnd()}\n${line}\n`;
}

function hasApplicationBilling(files: readonly TemplateFile[]): boolean {
  return files.some(
    (entry) =>
      entry.path === "convex/billing.ts" ||
      entry.path === "packages/database/src/schema/billing.ts" ||
      entry.path.endsWith("/db/schema/billing.ts"),
  );
}

export function integrateEveSecurityFiles(
  baseFiles: readonly TemplateFile[],
  options: EveSecurityIntegrationOptions,
): TemplateFile[] {
  if (!options.eve) return [...baseFiles];
  const enabled =
    options.auth &&
    options.web &&
    (options.database === "postgres" || options.database === "convex");
  let files = upsert(baseFiles, [securedEveChannelFile(options.mode, enabled)]);
  const nextPagePath =
    options.mode === "monorepo" ? "apps/web/src/app/agent/page.tsx" : "src/app/agent/page.tsx";
  const tanstackPagePath =
    options.mode === "monorepo" ? "apps/web/src/routes/agent.tsx" : "src/routes/agent.tsx";
  if (!enabled) {
    return files.filter((entry) => entry.path !== nextPagePath && entry.path !== tanstackPagePath);
  }
  const hasBilling = hasApplicationBilling(baseFiles);

  const persistentFiles =
    options.database === "postgres"
      ? [
          postgresEveOwnershipSchemaFile(options.mode),
          postgresEveActorFile(options.mode),
          postgresEveOwnershipAdapterFile(options.mode),
          postgresEveAdmissionAdapterFile(options.mode, hasBilling),
        ]
      : [
          convexEveOwnershipSchemaFile(),
          convexEveFunctionsFile(hasBilling),
          convexEveActorFile(options.mode),
          convexEveOwnershipAdapterFile(options.mode),
          convexEveAdmissionAdapterFile(options.mode),
        ];
  files = upsert(files, [
    eveOwnershipServiceFile(options.mode),
    eveAdmissionServiceFile(options.mode),
    eveOwnershipServiceIndexFile(options.mode),
    eveFacadePolicyFile(options.mode),
    eveAdmissionStreamFile(options.mode),
    eveAdmissionReconcilerFile(options.mode),
    eveLifecycleCallbackFile(options.mode),
    eveFacadeFile(options.mode),
    eveFacadeIndexFile(options.mode),
    ...eveFacadeRouteFiles(options.mode, options.framework),
    eveLifecycleCallbackRouteFile(options.mode, options.framework),
    eveAdmissionLifecycleHookFile(options.mode),
    ...(options.framework === "tanstack-start"
      ? [tanstackEveAgentPageFile(options.mode), tanstackEveAgentHeaderFile(options.mode)]
      : []),
    ...persistentFiles,
  ]);

  if (options.framework === "nextjs") {
    files = patch(files, nextPagePath, patchAgentPage);
    const proxyPath = options.mode === "monorepo" ? "apps/web/src/proxy.ts" : "src/proxy.ts";
    files = patch(files, proxyPath, patchProtectedPaths);
  } else {
    for (const path of [".env.example", ".env.local"]) {
      files = patch(files, path, patchTanStackEveEnvironment);
    }
  }

  if (options.database === "postgres") {
    if (options.mode === "monorepo") {
      files = patch(files, "packages/database/src/schema/index.ts", (content) =>
        addLine(
          content,
          'export { eveAgentAdmissions, eveAgentRuntimeEvents, eveAgentRuntimeSessions, eveAgentSessions } from "./eve";',
        ),
      );
    } else {
      files = patch(files, "src/server/db/index.ts", patchSingleDatabaseIndex);
    }
  } else {
    files = patch(files, "convex/schema.ts", patchConvexRootSchema);
  }

  if (options.mode === "monorepo") {
    files = patch(files, "packages/api/package.json", (content) => {
      const withExport = patchManifestExport(content, "./eve", "./src/eve/index.ts");
      return options.database === "postgres" && hasBilling
        ? patchManifestDependency(withExport, "@repo/billing", "workspace:*")
        : withExport;
    });
    files = patch(files, "packages/services/package.json", (content) =>
      patchManifestExport(content, "./eve", "./src/eve/index.ts"),
    );
  }
  for (const path of [
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    ".cursor/rules/ghostinit.mdc",
    ".windsurf/rules/ghostinit.md",
  ]) {
    if (files.some((entry) => entry.path === path)) {
      files = patch(files, path, patchEveSecurityDocs);
    }
  }
  return files;
}
