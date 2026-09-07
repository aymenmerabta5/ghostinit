import { file, type TemplateFile } from "../../shared.js";
import type { AppName, FrameworkName, ProjectMode } from "../../../lib/addons.js";
import { tanstackProtectedRouteDefinition } from "../fragments/tanstack-server.js";

const AUTH_REQUIRED_WEB_ROUTES = new Set(["notifications", "storage", "jobs"]);

export interface CapabilityClientOptions {
  readonly mode: ProjectMode;
  readonly framework: FrameworkName;
  readonly apps: readonly AppName[];
  readonly notifications: boolean;
  readonly storage: boolean;
  readonly featureFlags: boolean;
  readonly jobs: boolean;
  readonly i18n: boolean;
  /** Whether the selected auth and persistence graph emits the request application facade. */
  readonly requestApplication: boolean;
}

export type ClientTarget = "web" | "mobile" | "desktop";

export function appRoot(mode: ProjectMode, target: ClientTarget): string {
  if (mode === "single") return "";
  return `apps/${target}/`;
}

export function featureRoot(mode: ProjectMode, target: ClientTarget, feature: string): string {
  const root = appRoot(mode, target);
  return target === "desktop"
    ? `${root}src/renderer/features/${feature}`
    : `${root}src/features/${feature}`;
}

export function routeFile(
  options: CapabilityClientOptions,
  target: ClientTarget,
  route: string,
  componentName: string,
  featurePath: string,
): TemplateFile {
  const root = appRoot(options.mode, target);
  if (target === "mobile") {
    return file(
      `${root}app/${route}.tsx`,
      `export { ${componentName} as default } from "@/features/${featurePath}/page";\n`,
    );
  }
  if (target === "desktop") {
    const featureImport =
      options.mode === "single"
        ? `@/renderer/features/${featurePath}/page`
        : `@/features/${featurePath}/page`;
    return file(
      `${root}src/renderer/routes/${route}.tsx`,
      `import { createFileRoute } from "@tanstack/react-router";
import { ${componentName} } from "${featureImport}";

export const Route = createFileRoute("/${route}")({ component: ${componentName} });
`,
    );
  }
  if (options.framework === "tanstack-start") {
    return file(
      `${root}src/routes/${route}.tsx`,
      AUTH_REQUIRED_WEB_ROUTES.has(route)
        ? tanstackProtectedRouteDefinition(route, componentName, `@/features/${featurePath}/page`)
        : `import { createFileRoute } from "@tanstack/react-router";
import { ${componentName} } from "@/features/${featurePath}/page";

export const Route = createFileRoute("/${route}")({ component: ${componentName} });
`,
    );
  }
  return file(
    `${root}src/app/${route}/page.tsx`,
    `export { ${componentName} as default } from "@/features/${featurePath}/page";\n`,
  );
}

export function enabledTargets(options: CapabilityClientOptions): ClientTarget[] {
  const targets = options.apps.filter(
    (app): app is ClientTarget => app === "web" || app === "mobile" || app === "desktop",
  );
  // Single native projects do not host these server-backed capability clients.
  // Keep their unsupported routes absent instead of emitting dead navigation.
  return options.mode === "single" ? targets.filter((target) => target === "web") : targets;
}
