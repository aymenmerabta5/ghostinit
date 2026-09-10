import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { analyzeProjectReport } from "../../src/lib/architecture/analyzer.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(manifest: Record<string, unknown>, files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-single-expo-lint-"));
  roots.push(root);
  const transaction = new FsTransaction(root);
  await transaction.write(
    "package.json",
    JSON.stringify({ name: "fixture", dependencies: { "server-only": "1" }, ...manifest }),
  );
  await transaction.write(
    "src/server/secret.ts",
    'import "server-only"; export const secret = "server value";',
  );
  for (const [path, source] of Object.entries(files)) await transaction.write(path, source);
  for (const entry of lintScriptFiles().filter(({ path }) =>
    ["scripts/check-server-only.cjs", "scripts/lib/oxc.cjs"].includes(path),
  ))
    await transaction.write(entry.path, entry.content);
  await transaction.commit();
  return root;
}

async function check(root: string, allowed: boolean) {
  const host = await analyzeProjectReport(root);
  expect(host.complete).toBe(true);
  expect(host.findings.some(({ id }) => id === "client-transitive-server-import")).toBe(!allowed);
  for (const runtime of [process.execPath, "node"]) {
    const child = Bun.spawn([runtime, "scripts/check-server-only.cjs"], {
      cwd: root,
      env: { ...process.env, NODE_PATH: join(process.cwd(), "node_modules") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stdout + stderr).toBe(allowed ? 0 : 1);
    expect(stdout + stderr).toContain(
      allowed ? "Server-only runtime boundary check passed" : "Client-reachable server runtime",
    );
  }
}

describe("single Expo app root server-only coverage", () => {
  test.each(["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])(
    "%s Expo declarations protect root and grouped client routes",
    async (field) => {
      const root = await fixture(
        { [field]: { expo: "1", "server-only": "1" } },
        {
          "app/index.tsx":
            'import { secret } from "../src/server/secret"; export default function Screen() { return secret; }',
          "app/(private)/details.tsx":
            'import { secret } from "../../src/server/secret"; export default function Screen() { return secret; }',
          "app/apiary.tsx":
            'import { secret } from "../src/server/secret"; export default function Screen() { return secret; }',
        },
      );
      await check(root, false);
      const tainted = (await analyzeProjectReport(root)).findings
        .filter(({ id }) => id === "client-transitive-server-import")
        .map(({ file }) => file);
      expect(tainted).toEqual(["app/(private)/details.tsx", "app/apiary.tsx", "app/index.tsx"]);
    },
  );
  test("React Native declarations follow the same host/runtime classification", async () => {
    await check(
      await fixture(
        { dependencies: { "react-native": "1", "server-only": "1" } },
        {
          "app/index.tsx":
            'import { secret } from "../src/server/secret"; export default () => secret;',
        },
      ),
      false,
    );
  });
  test("supported Expo API transport remains server-owned", async () => {
    await check(
      await fixture(
        { dependencies: { expo: "1", "server-only": "1" } },
        {
          "app/api/rpc/[...path]+api.ts":
            'import { secret } from "../../../src/server/secret"; export const POST = () => secret;',
          "app/index.tsx": "export default function Screen() { return null; }",
        },
      ),
      true,
    );
  });
  test("Next root-app server pages and API routes do not become Expo clients", async () => {
    await check(
      await fixture(
        { dependencies: { next: "1", "server-only": "1" } },
        {
          "app/page.tsx":
            'import { secret } from "../src/server/secret"; export default function Page() { return secret; }',
          "app/api/health/route.ts":
            'import { secret } from "../../../src/server/secret"; export const GET = () => secret;',
        },
      ),
      true,
    );
  });
  test("explicit Next client directives remain protected in the newly collected root", async () => {
    await check(
      await fixture(
        { dependencies: { next: "1", "server-only": "1" } },
        {
          "app/page.tsx":
            '"use client"; import { secret } from "../src/server/secret"; export default function Page() { return secret; }',
        },
      ),
      false,
    );
  });
});
