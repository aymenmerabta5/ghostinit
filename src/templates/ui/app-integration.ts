import { posix } from "node:path";
import type { ProjectMode } from "../../lib/addons.js";
import { type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import {
  normalizeDesignSystemApps,
  resolveUiLayout,
  type ResolvedDesignSystemApp,
  type UiAdapterId,
} from "./layout.js";

interface AppIntegrationPaths {
  readonly css: string;
  readonly manifest: string;
  readonly root: string;
  readonly tsconfig: string;
}

function integrationPaths(mode: ProjectMode, app: ResolvedDesignSystemApp): AppIntegrationPaths {
  const prefix = mode === "monorepo" ? `apps/${app.id}/` : "";
  switch (app.target) {
    case "next":
      return {
        css: `${prefix}src/app/globals.css`,
        manifest: `${prefix}package.json`,
        root: `${prefix}src/app/layout.tsx`,
        tsconfig: `${prefix}tsconfig.json`,
      };
    case "tanstack":
      return {
        css: `${prefix}src/styles/app.css`,
        manifest: `${prefix}package.json`,
        root: `${prefix}src/routes/__root.tsx`,
        tsconfig: `${prefix}tsconfig.json`,
      };
    case "expo":
      return {
        css: `${prefix}global.css`,
        manifest: `${prefix}package.json`,
        root: `${prefix}app/_layout.tsx`,
        tsconfig: `${prefix}tsconfig.json`,
      };
    case "electron":
      return {
        css: `${prefix}src/renderer/index.css`,
        manifest: `${prefix}package.json`,
        root: `${prefix}src/renderer/main.tsx`,
        tsconfig: `${prefix}tsconfig.json`,
      };
  }
}

function adapterImportPath(mode: ProjectMode, cssPath: string, adapter: UiAdapterId): string {
  if (mode === "monorepo") return `@repo/ui/styles/adapters/${adapter}/v1.css`;
  const adapterPath = `${resolveUiLayout(mode).stylesRoot}/adapters/${adapter}/v1.css`;
  const relative = posix.relative(posix.dirname(cssPath), adapterPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function localCssContent(
  mode: ProjectMode,
  app: ResolvedDesignSystemApp,
  cssPath: string,
  previous: string,
): string {
  const adapterImport = `@import "${adapterImportPath(mode, cssPath, app.target)}";`;
  if (app.target === "expo") {
    const sources = previous
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("@source "));
    if (sources.length === 0) {
      throw new Error(`Expo design-system integration requires @source directives in ${cssPath}`);
    }
    return `@import "uniwind";\n${adapterImport}\n\n${sources.join("\n")}\n`;
  }
  if (app.target === "electron") {
    if (!/html\s*,\s*body\s*,\s*#root\s*\{[^}]*height:\s*100%/s.test(previous)) {
      throw new Error(`Electron design-system integration requires a 100% mount in ${cssPath}`);
    }
    return `${adapterImport}\n\nhtml, body, #root {\n  height: 100%;\n}\n`;
  }
  return `${adapterImport}\n`;
}

function rootContent(
  content: string,
  contractImport: string,
  app: ResolvedDesignSystemApp,
  rootPath: string,
): string {
  const marker = `GhostInit design-system invariant: ${app.id}/${app.target}/v1`;
  if (content.includes(marker)) return content;
  const importIndex = content.search(/^import\s/m);
  if (importIndex === -1) {
    throw new Error(`Design-system composition root has no import section: ${rootPath}`);
  }
  const directImport = `import { designSystemContract } from "${contractImport}";\n`;
  const withImport = `${content.slice(0, importIndex)}${directImport}${content.slice(importIndex)}`;
  const invariant = `const configuredDesignSystemApp = designSystemContract.apps.find(
  (candidate) => candidate.id === "${app.id}",
);
const configuredDesignSystemAdapter = designSystemContract.adapters.find(
  (candidate) => candidate.id === "${app.target}",
);
if (
  configuredDesignSystemApp?.adapter !== "${app.target}" ||
  configuredDesignSystemAdapter?.version !== 1 ||
  configuredDesignSystemAdapter?.status !== "applicable"
) {
  throw new Error("${marker}");
}
`;
  return `${withImport.trimEnd()}\n\n${invariant}`;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function cssDependencies(adapter: UiAdapterId): Record<string, string> {
  return {
    clsx: v.ui.clsx,
    tailwindcss: v.styling.tailwindcss,
    "tailwind-merge": v.ui["tailwind-merge"],
    ...(adapter === "expo"
      ? { uniwind: v.uniwind.uniwind }
      : { "tw-animate-css": v.uniwind["tw-animate-css"] }),
  };
}

function manifestContent(
  content: string,
  mode: ProjectMode,
  app: ResolvedDesignSystemApp,
  manifestPath: string,
): string {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Design-system app manifest is not valid JSON: ${manifestPath}`);
  }
  const dependencies = { ...(manifest.dependencies as Record<string, string> | undefined) };
  if (mode === "monorepo") {
    dependencies["@repo/ui"] = "workspace:*";
  } else {
    const owned = cssDependencies(app.target);
    Object.assign(dependencies, owned);
    const devDependencies = {
      ...(manifest.devDependencies as Record<string, string> | undefined),
    };
    for (const name of Object.keys(owned)) delete devDependencies[name];
    if (Object.keys(devDependencies).length > 0) {
      manifest.devDependencies = sortRecord(devDependencies);
    } else {
      delete manifest.devDependencies;
    }
  }
  manifest.dependencies = sortRecord(dependencies);
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function tsconfigContent(
  content: string,
  mode: ProjectMode,
  app: ResolvedDesignSystemApp,
  tsconfigPath: string,
): string {
  // Native direct typechecks resolve every workspace dependency through its
  // package exports. Mixing these aliases with Bun's workspace links gives the
  // same source two path casings on Windows (for example D:/Temp and D:/temp).
  if (mode !== "monorepo" || app.target === "expo" || app.target === "electron") return content;
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(`Design-system app tsconfig is not valid JSON: ${tsconfigPath}`);
  }
  const compilerOptions = {
    ...(config.compilerOptions as Record<string, unknown> | undefined),
  };
  const paths = {
    ...(compilerOptions.paths as Record<string, string[]> | undefined),
    "@repo/ui": ["../../packages/ui/src/index.ts"],
    "@repo/ui/*": ["../../packages/ui/src/*"],
  };
  compilerOptions.paths = Object.fromEntries(
    Object.entries(paths).sort(([left], [right]) => left.localeCompare(right)),
  );
  config.compilerOptions = compilerOptions;
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Connect emitted application entrypoints to the machine-defined UI module.
 * This deliberately runs after app composition so framework templates stay
 * independent of the monorepo/single physical layout.
 */
export function integrateDesignSystemApplications(
  files: readonly TemplateFile[],
  mode: ProjectMode,
  apps: readonly ResolvedDesignSystemApp[],
): TemplateFile[] {
  const resolved = normalizeDesignSystemApps(apps);
  const layout = resolveUiLayout(mode);
  const changes = new Map<string, (content: string) => string>();
  const obsoletePaths = new Set<string>();

  for (const app of resolved) {
    const paths = integrationPaths(mode, app);
    const contractImport =
      mode === "monorepo"
        ? layout.contractImport
        : (() => {
            const relative = posix.relative(posix.dirname(paths.root), layout.contractPath);
            return (relative.startsWith(".") ? relative : `./${relative}`).replace(/\.ts$/, "");
          })();
    changes.set(paths.css, (content) => localCssContent(mode, app, paths.css, content));
    changes.set(paths.root, (content) => rootContent(content, contractImport, app, paths.root));
    changes.set(paths.manifest, (content) => manifestContent(content, mode, app, paths.manifest));
    changes.set(paths.tsconfig, (content) => tsconfigContent(content, mode, app, paths.tsconfig));
    if (mode === "single" && app.target === "expo") obsoletePaths.add("src/styles/theme.css");
    if (mode === "single" && app.target === "electron") {
      obsoletePaths.add("src/renderer/styles/theme.css");
    }
  }

  const seen = new Set<string>();
  const integrated = files.map((template) => {
    const transform = changes.get(template.path);
    if (!transform) return template;
    seen.add(template.path);
    return { ...template, content: transform(template.content) };
  });
  const missing = [...changes.keys()].filter((path) => !seen.has(path));
  if (missing.length > 0) {
    throw new Error(`Missing design-system app integration files: ${missing.sort().join(", ")}`);
  }
  return integrated.filter((template) => !obsoletePaths.has(template.path));
}

export const applyDesignSystemApplications = integrateDesignSystemApplications;
