export function customNextServerCommand(
  runtime: "node" | "bun",
  phase: "dev" | "build" | "start",
  projectRoot = ".",
): string {
  return `bun ${projectRoot}/scripts/start-next-server.mjs ${runtime} ${phase}`;
}

export function nextRuntimeCommand(
  runtime: "node" | "bun",
  command: "dev" | "build" | "start",
  hasPdf = false,
): string {
  const preload = hasPdf ? " --preload @react-pdf/renderer" : "";
  const bundler = command === "start" ? "" : " --webpack";
  return runtime === "bun"
    ? `bun${preload} ./node_modules/next/dist/bin/next ${command}${bundler}`
    : `next ${command}`;
}

export function nextServerRuntimeContent(mode: "monorepo" | "single", hasPdf = false): string {
  return `import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const runtime = process.argv[2];
const phase = process.argv[3];
if ((runtime !== "bun" && runtime !== "node") || !["dev", "build", "start"].includes(phase)) {
  throw new Error("Expected a Bun or Node runtime and dev, build, or start phase");
}
const projectRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const appRoot = resolve(projectRoot, ${JSON.stringify(mode === "single" ? "." : "apps/web")});
const entrypoint = join(appRoot, ${JSON.stringify(mode === "single" ? "next-server.ts" : "server.ts")});
const outputDirectory = join(appRoot, ".ghostinit", "runtime");
const artifactMode = phase === "dev" ? "development" : "production";
const artifactName = "next-server-" + runtime + "-" + artifactMode + ".mjs";
const outputFile = join(outputDirectory, artifactName);
const backendDirectories = [
  "src/server", "apps/web/src/server",
  ...["billing", "database", "email", "modules", "services", "storage", "pdf", "cache", "realtime", "workflows"].map((name) => "packages/" + name + "/src"),
  ...["adapters", "composition", "eve", "procedures", "server", "workers"].map((name) => "packages/api/src/" + name),
  "packages/analytics/src/server",
].map((path) => resolve(projectRoot, path));
const privateFiles = [
  "src/lib/env/server.ts", "src/lib/env/server-schema.ts",
  "apps/web/src/lib/env/server.ts", "apps/web/src/lib/env/server-schema.ts",
  "packages/config/src/server.ts", "packages/config/src/server-schema.ts",
  "packages/auth/src/server.ts", "packages/analytics/src/config.ts",
  "packages/api/src/context.ts", "packages/api/src/router.ts", "packages/api/src/messaging-outbox.ts",
].map((path) => resolve(projectRoot, path));

function within(directory, path) {
  const child = relative(directory, path);
  return child !== ".." && !child.startsWith(".." + sep) && !isAbsolute(child);
}

function trustedBackend(importer) {
  if (!importer) return false;
  let path;
  try { path = realpathSync(importer.startsWith("file:") ? fileURLToPath(importer) : importer); }
  catch { return false; }
  return privateFiles.some((file) => relative(file, path) === "") || backendDirectories.some((directory) => within(directory, path));
}

function validateOutput(create) {
  if (!within(projectRoot, realpathSync(appRoot))) throw new Error("App root escaped the project");
  let appParent = projectRoot;
  for (const segment of relative(projectRoot, appRoot).split(sep).filter(Boolean)) {
    appParent = join(appParent, segment);
    const stat = lstatSync(appParent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("App root must use regular directories");
  }
  let directory = appRoot;
  for (const segment of [".ghostinit", "runtime"]) {
    directory = join(directory, segment);
    let stat = lstatSync(directory, { throwIfNoEntry: false });
    if (!stat && create) { mkdirSync(directory); stat = lstatSync(directory); }
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory() || !within(appRoot, realpathSync(directory))) {
      throw new Error("Runtime output parent must be an owned regular directory");
    }
  }
  const artifact = lstatSync(outputFile, { throwIfNoEntry: false });
  if (artifact && (artifact.isSymbolicLink() || !artifact.isFile() || artifact.nlink !== 1)) {
    throw new Error("Runtime artifact must be a regular unlinked file");
  }
  return artifact !== undefined;
}

validateOutput(false);
process.chdir(appRoot);
if (phase !== "start") {
const result = await Bun.build({
  entrypoints: [entrypoint],
  naming: artifactName,
  // Both launchers host Next's Node HTTP contract; a Bun target preselects its ws shim.
  target: "node",
  format: "esm",
  packages: "external",
  env: "disable",
  // Bun treats NODE_ENV specially even when environment inlining is disabled.
  define: { "process.env.NODE_ENV": JSON.stringify(phase === "dev" ? "development" : "production") },
  plugins: [{
    name: "ghostinit-trusted-server-boundary",
    setup(builder) {
      // Bun 1.4's built-in ws shim cannot upgrade after asynchronous authentication.
      // Bundle the installed package's public entry instead of selecting that shim.
      builder.onResolve({ filter: /^ws$/ }, (args) => {
        const manifestPath = Bun.resolveSync("ws/package.json", dirname(args.importer));
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        const entry = manifest.exports?.["."]?.import;
        if (typeof entry !== "string" || !entry.startsWith("./")) throw new Error("ws must declare its public import entry");
        const packageRoot = realpathSync(dirname(manifestPath));
        const path = realpathSync(resolve(packageRoot, entry));
        if (!within(packageRoot, path)) throw new Error("ws entry escaped its installed package");
        return { path, external: false };
      });
      builder.onResolve({ filter: /^(?:@repo\\/|@\\/)/ }, (args) => {
        const path = realpathSync(Bun.resolveSync(args.path, dirname(args.importer)));
        if (!within(projectRoot, path)) throw new Error("Workspace import escaped the project root");
        return { path, external: false };
      });
      builder.onResolve({ filter: /^server-only$/ }, (args) => trustedBackend(args.importer)
        ? { path: "server-only", namespace: "ghostinit-trusted-server-only" }
        : { path: args.path, external: true });
      builder.onLoad({ filter: /.*/, namespace: "ghostinit-trusted-server-only" }, () => ({ contents: "export {};", loader: "js" }));
    },
  }],
});
if (!result.success) throw new AggregateError(result.logs, "Custom Next server compilation failed");
if (result.outputs.length !== 1) throw new Error("Custom Next server must produce exactly one runtime artifact");
validateOutput(false);
validateOutput(true);
const staged = join(outputDirectory, ".next-server-" + randomUUID() + ".mjs");
try {
  // Keep normal UTF-8 parsing: Bun 1.4's fast marker path corrupts non-ASCII literals.
  const source = (await result.outputs[0].text()).replace(/^(#![^\\r\\n]*\\r?\\n)?\\/\\/ @bun(?=\\r?\\n|$)/, "$1// utf8");
  writeFileSync(staged, source, { encoding: "utf8", flag: "wx" });
  validateOutput(false);
  renameSync(staged, outputFile);
} finally {
  if (lstatSync(staged, { throwIfNoEntry: false })) unlinkSync(staged);
}
}
if (!validateOutput(false)) throw new Error("Run bun run build before starting the custom Next server");
if (phase === "build") process.exit(0);
// Initialize PDFKit's package-local standard fonts before Next installs its require hook.
const preloads = runtime === "bun" && ${JSON.stringify(hasPdf)} ? ["--preload", "@react-pdf/renderer"] : [];
const child = spawn(runtime === "bun" ? process.execPath : "node", [...preloads, outputFile, appRoot], {
  cwd: appRoot,
  env: { ...process.env, NODE_ENV: phase === "dev" ? "development" : "production" },
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
process.exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});
`;
}
