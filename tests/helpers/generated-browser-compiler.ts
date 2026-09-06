import { createRequire } from "node:module";
import { posix } from "node:path";
import { packageSource, resolveFile, type RouterSources } from "./generated-router-fixture.js";

interface Builder {
  onResolve(
    options: { filter: RegExp; namespace?: string },
    callback: (args: {
      path: string;
      importer: string;
    }) => { path: string; namespace?: string } | undefined,
  ): void;
  onLoad(
    options: { filter: RegExp; namespace: string },
    callback: (args: { path: string }) => { contents: string; loader: string },
  ): void;
}
interface BrowserCompiler {
  build(options: Record<string, unknown>): Promise<{ outputFiles?: Array<{ text: string }> }>;
}

/** Use drizzle-kit's already-audited compiler without altering generated browser code. */
export async function compileGeneratedBrowser(
  sources: RouterSources,
  entry: string,
): Promise<string> {
  const requireHost = createRequire(import.meta.url);
  const compiler = createRequire(requireHost.resolve("drizzle-kit/api"))(
    "esbuild",
  ) as BrowserCompiler;
  const files = new Map(sources.files);
  files.set("__fixture__/entry.ts", entry);
  const result = await compiler.build({
    entryPoints: ["generated-browser"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [
      {
        name: "generated-passkey-browser",
        setup(builder: Builder) {
          builder.onResolve({ filter: /^generated-browser$/ }, () => ({
            path: "__fixture__/entry.ts",
            namespace: "generated",
          }));
          builder.onResolve({ filter: /.*/, namespace: "generated" }, (args) => {
            if (
              args.path === "server-only" ||
              args.path.startsWith("node:") ||
              args.path.startsWith("bun:")
            ) {
              throw new Error("Generated browser reached a server dependency");
            }
            if (args.path.startsWith("@repo/"))
              return { path: packageSource(files, args.path), namespace: "generated" };
            if (args.path.startsWith("@/"))
              return {
                path: resolveFile(files, posix.join(sources.webRoot, args.path.slice(2))),
                namespace: "generated",
              };
            if (args.path.startsWith("."))
              return {
                path: resolveFile(files, posix.join(posix.dirname(args.importer), args.path)),
                namespace: "generated",
              };
            return { path: requireHost.resolve(args.path) };
          });
          builder.onLoad({ filter: /.*/, namespace: "generated" }, (args) => ({
            contents: files.get(args.path) ?? "",
            loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
          }));
        },
      },
    ],
  });
  const output = result.outputFiles?.[0]?.text;
  if (!output) throw new Error("Generated browser bundle was empty");
  return output;
}
