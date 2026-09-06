import { createRequire } from "node:module";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

export interface RouterVariant {
  mode: "monorepo" | "single";
  framework: "nextjs" | "tanstack-start";
  database: "postgres" | "convex";
}

export interface RouterSources {
  files: Map<string, string>;
  webRoot: string;
  apiRoot: string;
  serviceRoot: string;
  authRoot: string;
  databaseRoot: string;
  handlerPath: string;
  planHash: string;
}

const requireHost = createRequire(import.meta.url);
export const ROUTER_FIXTURE_NOTIFICATION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";

export function generateRouterSources(variant: RouterVariant): RouterSources {
  const result = resolveCreateConfig({
    name: "authenticated-roundtrip",
    runtime: "bun",
    ...variant,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    withAuth: true,
    withApi: true,
    withNotifications: true,
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig);
  const files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
  const webRoot = variant.mode === "monorepo" ? "apps/web/src" : "src";
  return {
    files,
    webRoot,
    apiRoot: variant.mode === "monorepo" ? "packages/api/src" : "src/server/api",
    serviceRoot: variant.mode === "monorepo" ? "packages/services/src" : "src/server/services",
    authRoot:
      variant.mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts",
    databaseRoot: variant.mode === "monorepo" ? "packages/database/src" : "src/server/db",
    handlerPath:
      variant.framework === "nextjs"
        ? `${webRoot}/app/api/rpc/[...path]/route.ts`
        : `${webRoot}/server/http/rpc.server.ts`,
    planHash: plan.planHash,
  };
}

export function resolveFile(files: Map<string, string>, path: string): string {
  const bare = path.replace(/\.(?:js|jsx|mjs)$/, "");
  const found = [path, `${bare}.ts`, `${bare}.tsx`, `${bare}/index.ts`].find((candidate) =>
    files.has(candidate),
  );
  if (!found) throw new Error(`Generated import has no target: ${path}`);
  return found;
}

export function packageSource(files: Map<string, string>, specifier: string): string {
  const [name, ...segments] = specifier.slice("@repo/".length).split("/");
  const root = `packages/${name}`;
  const manifest = JSON.parse(files.get(`${root}/package.json`) ?? "null") as {
    exports?: string | Record<string, string>;
  } | null;
  const subpath = segments.length === 0 ? "." : `./${segments.join("/")}`;
  const target =
    typeof manifest?.exports === "string" ? manifest.exports : manifest?.exports?.[subpath];
  return resolveFile(
    files,
    target ? posix.join(root, target) : `${root}/src/${segments.join("/")}`,
  );
}

/** Bundle the actual emitted graph; overrides are explicit external-runtime boundaries. */
export async function compileGeneratedRouter(
  sources: RouterSources,
  entry: string,
  overrides: Readonly<Record<string, string>>,
  aliases: Readonly<Record<string, string>> = {},
): Promise<string> {
  const files = new Map([...sources.files, ...Object.entries(overrides)]);
  const externals = new Map<string, string>();
  files.set("__fixture__/entry.ts", entry);
  files.set("__fixture__/server-only.ts", "export {};\n");
  files.set(
    "__fixture__/next-runtime.ts",
    "export function after(callback) { queueMicrotask(callback); }\n",
  );
  const result = await Bun.build({
    entrypoints: ["generated-entry"],
    target: "bun",
    format: "esm",
    plugins: [
      {
        name: "generated-router-composition",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === "generated-entry") {
              return { path: "__fixture__/entry.ts", namespace: "generated" };
            }
            // Bun 1.4 reports imports from custom onLoad namespaces as "file";
            // the exact emitted importer map is the authority for this graph.
            if (!files.has(args.importer)) return;
            if (args.path === "server-only") {
              return { path: "__fixture__/server-only.ts", namespace: "generated" };
            }
            if (args.path === "next/server") {
              return { path: "__fixture__/next-runtime.ts", namespace: "generated" };
            }
            const alias = aliases[args.path];
            if (alias) return { path: resolveFile(files, alias), namespace: "generated" };
            if (args.path.startsWith("@repo/")) {
              return { path: packageSource(files, args.path), namespace: "generated" };
            }
            if (args.path.startsWith("@/")) {
              return {
                path: resolveFile(files, posix.join(sources.webRoot, args.path.slice(2))),
                namespace: "generated",
              };
            }
            if (args.path.startsWith(".")) {
              return {
                path: resolveFile(files, posix.join(posix.dirname(args.importer), args.path)),
                namespace: "generated",
              };
            }
            if (args.path.startsWith("node:") || args.path.startsWith("bun:")) {
              return { path: args.path, external: true };
            }
            const path =
              args.path === "better-call"
                ? createRequire(requireHost.resolve("better-auth")).resolve(args.path)
                : requireHost.resolve(args.path);
            externals.set(args.path, pathToFileURL(path).href);
            return { path, external: true };
          });
          builder.onLoad({ filter: /.*/, namespace: "generated" }, (args) => ({
            contents: files.get(args.path) ?? "",
            loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
          }));
        },
      },
    ],
  });
  if (!result.success) throw new AggregateError(result.logs, "Generated router bundle failed");
  const output = result.outputs[0];
  if (!output) throw new Error("Generated router bundle was empty");
  // Bun 1.4 retains the original external specifier even when onResolve returns
  // an absolute path. Bind fixture imports to the verified host installation so
  // the isolated temp directory needs no install or node_modules mutation.
  let content = await output.text();
  for (const [specifier, target] of externals) {
    for (const prefix of ["from ", "import(", "require("]) {
      content = content.replaceAll(
        prefix + JSON.stringify(specifier),
        prefix + JSON.stringify(target),
      );
    }
  }
  return content;
}

export function fixtureEnvironmentSource(): string {
  return `export const env = {
  NODE_ENV: "test", APP_NAME: "authenticated-roundtrip", DATABASE_SSL: "false",
  DATABASE_URL: process.env.DATABASE_URL, DATABASE_POOL_SIZE: 4,
  BETTER_AUTH_SECRET: "hermetic-authenticated-roundtrip-secret-at-least-32-chars",
  BETTER_AUTH_URL: "http://localhost:3000", TRUSTED_PROXY: "false",
  NOTIFICATION_TOKEN_ENCRYPTION_KEY: ${JSON.stringify(ROUTER_FIXTURE_NOTIFICATION_KEY)},
  CONVEX_URL: "https://hermetic.convex.cloud", CONVEX_SITE_URL: "https://hermetic.convex.site",
  SITE_URL: "http://localhost:3000",
};`;
}

export function fixtureImports(sources: RouterSources, variant: RouterVariant): string {
  return `import { ${variant.framework === "nextjs" ? "POST" : "handleRpcRequest"} as handle } from "../${sources.handlerPath}";
import { auth } from "../${sources.authRoot}";
import { createContext } from "../${sources.apiRoot}/context";
import { createRequestApplicationForRequest } from "../${sources.serviceRoot}/application/server";
export { handle, auth, createContext, createRequestApplicationForRequest };`;
}
