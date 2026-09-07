import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function eveNitroResolverPreamble(typescript = false): string {
  const sourceType = typescript ? ": string" : "";
  const returnType = typescript ? ": string | null" : "";
  const candidateType = typescript ? ": string" : "";
  const booleanType = typescript ? ": boolean" : "";
  return `import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const EVE_RESOLVER_EXTENSIONS = [
  "",
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".json",
  ".cjs",
  ".cts",
  ".tsx",
  ".jsx",
  ".node",
  ".wasm",
];
const EVE_RESOLVER_PLUGIN_NAME = "ghostinit:eve-import-resolver";
const eveRequire = createRequire(import.meta.url);

function isEveImportFile(candidate${candidateType})${booleanType} {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveEveAbsoluteImport(source${sourceType})${returnType} {
  let path;
  if (source.startsWith("file://")) {
    try {
      path = fileURLToPath(source);
    } catch {
      return null;
    }
  } else if (isAbsolute(source) || /^[A-Za-z]:[\\\\/]/.test(source)) {
    path = source;
  } else {
    return null;
  }
  for (const extension of EVE_RESOLVER_EXTENSIONS) {
    const candidate = path + extension;
    if (isEveImportFile(candidate)) return candidate;
  }
  return null;
}
`;
}

export function eveNitroResolverHooks(): string {
  return `  hooks: {
    "rollup:before"(_nitro, config) {
      const plugins = Array.isArray(config.plugins) ? config.plugins : [];
      if (
        plugins.some(
          (plugin) =>
            typeof plugin === "object" &&
            plugin !== null &&
            Reflect.get(plugin, "name") === EVE_RESOLVER_PLUGIN_NAME,
        )
      ) {
        return;
      }
      plugins.unshift({
        name: EVE_RESOLVER_PLUGIN_NAME,
        resolveId(source) {
          const absolute = resolveEveAbsoluteImport(source);
          if (absolute) return absolute;
          if (source === "eve" || source.startsWith("eve/")) {
            try {
              return eveRequire.resolve(source);
            } catch {
              return null;
            }
          }
          return null;
        },
      });
      config.plugins = plugins;
    },
  },`;
}

export function eveNitroConfigContent(): string {
  return `${eveNitroResolverPreamble()}
export default {
${eveNitroResolverHooks()}
};
`;
}

export function eveNitroConfig(): TemplateFile {
  return file("apps/eve/nitro.config.mjs", eveNitroConfigContent());
}

export function eveTsconfig(): TemplateFile {
  return file(
    "apps/eve/tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2024"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          types: ["node"],
          paths: {
            "#*": ["./agent/*"],
            "#evals/*": ["./evals/*"],
            "@repo/*": ["../../packages/*/src"],
          },
          outDir: "./dist",
          rootDir: ".",
        },
        include: ["agent/**/*", "lib/**/*"],
        exclude: ["node_modules", "dist", ".eve"],
      },
      null,
      2,
    ) + "\n",
  );
}

export function eveGitignore(): TemplateFile {
  return file("apps/eve/.gitignore", `node_modules\n.eve\ndist\n.env\n.env.local\n*.log\n`);
}
export function eveVercelIgnore(): TemplateFile {
  return file("apps/eve/.vercelignore", `node_modules\n.eve\n`);
}
export function eveReadme(projectName: string): TemplateFile {
  return file(
    "apps/eve/README.md",
    `# ${projectName} — Eve Durable Agent
Uses eve@${v.eve.eve} filesystem-first durable backend agents.
Agent directory: agent/agent.ts + instructions.md + tools/ + skills/ + channels/ + schedules/ + subagents/
Standalone diagnostic: from the repository root run bun run eve:dev
Integrated Next.js projects use the root bun run dev/build/start lifecycle.
Docs: node_modules/eve/docs/README.md
`,
  );
}
