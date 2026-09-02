import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];
const entryMarker = "--ghostinit-storage-cleanup-worker";

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function generatedWorker() {
  const files = generateProjectFiles({
    name: "storage-worker-entry",
    runtime: "bun",
    version: "0.1.0",
    mode: "single",
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    messaging: true,
    storage: true,
    billing: [],
    features: [],
    database: "postgres",
    framework: "tanstack-start",
    apps: ["web"],
  } as ProjectConfig);
  const source = files.find(
    ({ path }) => path === "src/server/workers/storage/cleanup.ts",
  )?.content;
  const manifest = JSON.parse(
    files.find(({ path }) => path === "package.json")?.content ?? "{}",
  ) as {
    scripts?: Record<string, string>;
  };
  if (!source) throw new Error("Generated storage cleanup worker is missing");
  return { source, command: manifest.scripts?.["storage:cleanup-worker"] ?? "" };
}

describe("storage cleanup worker entrypoint", () => {
  test("requires the explicit script marker even when bundled URL and argv collapse", () => {
    const { source, command } = generatedWorker();
    expect(source).toContain(`STORAGE_CLEANUP_WORKER_ENTRY = "${entryMarker}"`);
    expect(source).toContain("process.argv.includes(STORAGE_CLEANUP_WORKER_ENTRY)");
    expect(source).not.toContain("import.meta.url");
    expect(command).toContain(entryMarker);

    const root = mkdtempSync(join(tmpdir(), "ghostinit-storage-worker-entry-"));
    roots.push(root);
    const worker = join(root, "worker.ts");
    const selfContained = source
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("import "))
      .join("\n");
    writeFileSync(worker, selfContained);

    // Executing the module as the process entrypoint reproduces the URL/argv
    // collapse caused by bundlers. Without the explicit marker it must exit.
    const bundledImport = spawnSync(process.execPath, [worker], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 5_000,
      windowsHide: true,
    });
    expect(bundledImport.status, `${bundledImport.stdout}\n${bundledImport.stderr}`).toBe(0);

    // The generated package script appends the marker, which intentionally
    // starts the durable loop; the harness timeout proves it stayed running.
    const directWorker = spawnSync(process.execPath, [worker, entryMarker], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 1_000,
      windowsHide: true,
    });
    expect(directWorker.status).toBeNull();
    expect(directWorker.error?.code).toBe("ETIMEDOUT");
    expect(`${directWorker.stdout}\n${directWorker.stderr}`).toContain("batch-failed");
  });

  test("single Node storage source resolves its @/ env entry through the worker loader", () => {
    const node = Bun.which("node");
    if (node === null) throw new Error("Node is required for the storage worker portability test");
    const files = generateProjectFiles(
      {
        name: "storage-worker-node",
        runtime: "node",
        version: "0.1.0",
        mode: "single",
        preset: "custom",
        auth: true,
        api: true,
        email: false,
        analytics: false,
        messaging: false,
        storage: true,
        billing: [],
        features: [],
        database: "postgres",
        framework: "nextjs",
        apps: ["web"],
      } as ProjectConfig,
      { dryRun: true },
    );
    const manifest = JSON.parse(
      files.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { scripts?: Record<string, string> };
    const loader = files.find(
      ({ path }) => path === "scripts/typescript-worker-loader.mjs",
    )?.content;
    const storage = files.find(({ path }) => path === "src/server/storage/index.ts")?.content;
    if (!loader || !storage) throw new Error("Generated single Node storage runtime is incomplete");
    expect(manifest.scripts?.["storage:cleanup-worker"]).toContain(
      "--import ./scripts/typescript-worker-loader.mjs",
    );
    expect(storage).toContain('import { env } from "@/lib/env/server";');

    const root = mkdtempSync(join(tmpdir(), "ghostinit-storage-node-loader-"));
    roots.push(root);
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "src", "lib", "env"), { recursive: true });
    mkdirSync(join(root, "src", "server", "storage"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "ghostinit.config.json"), "{}\n");
    writeFileSync(join(root, "scripts", "typescript-worker-loader.mjs"), loader);
    writeFileSync(
      join(root, "src", "lib", "env", "server.ts"),
      `export const env = {
  STORAGE_DRIVER: "local",
  STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_ENDPOINT: "",
  UPLOADS_DIR: "./data/uploads",
};
`,
    );
    writeFileSync(join(root, "src", "server", "storage", "index.ts"), storage);
    writeFileSync(
      join(root, "probe.ts"),
      `import { validateFile } from "./src/server/storage/index.ts";
process.stdout.write(JSON.stringify(validateFile("text/plain", 1)));
`,
    );

    const result = spawnSync(
      node,
      [
        "--import",
        "./scripts/typescript-worker-loader.mjs",
        "--experimental-strip-types",
        "probe.ts",
      ],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
        timeout: 10_000,
        windowsHide: true,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ valid: true });
  });
});
