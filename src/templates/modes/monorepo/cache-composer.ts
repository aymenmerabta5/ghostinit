import type { TemplateFile } from "../../shared.js";
import { codeScripts, file, packageJson, tsconfig } from "../../shared.js";
import * as v from "../../versions.js";
import { singleCacheFiles } from "../single/cache.js";

type Runtime = "node" | "bun";

function failClosedCacheSource(): string {
  const source = singleCacheFiles().find(({ path }) => path === "src/server/cache.ts");
  if (!source) {
    throw new Error("Single cache template did not emit its canonical Redis implementation");
  }
  return source.content;
}

/**
 * Monorepo Redis cache package.
 *
 * Both project modes deliberately share the same fail-closed implementation.
 * A selected distributed cache must never degrade to process-local memory when
 * credentials are missing or the provider is unavailable.
 */
export function cacheComposerFiles(runtime: Runtime = "bun"): TemplateFile[] {
  return [
    file(
      "packages/cache/package.json",
      packageJson({
        name: "@repo/cache",
        type: "module",
        scripts: codeScripts(),
        exports: { ".": "./src/index.ts" },
        dependencies: {
          "@upstash/redis": `^${v.cache["@upstash/redis"]}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
          ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
        },
      }),
    ),
    file(
      "packages/cache/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
        },
      }),
    ),
    file("packages/cache/src/index.ts", failClosedCacheSource()),
  ];
}
