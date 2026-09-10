import { expect } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  assertLoopbackPortUnowned,
  reservePort,
  spawnTracked,
  terminateProcessTree,
  waitForHealthyHttp,
} from "./e2e-build-process.js";

export interface NextCompilerSnapshot {
  readonly appRoot: string;
  readonly hashes: ReadonlyMap<string, string>;
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function captureNextCompilerConfig(projectRoot: string): NextCompilerSnapshot | undefined {
  const appRoot = [projectRoot, join(projectRoot, "apps/web")].find((candidate) =>
    existsSync(join(candidate, "next.config.ts")),
  );
  if (!appRoot) return undefined;
  const paths = [join(appRoot, "tsconfig.json")];
  const preset = join(projectRoot, "packages/typescript-config/nextjs.json");
  if (appRoot !== projectRoot) {
    expect(existsSync(preset), "Next monorepo compiler preset exists").toBe(true);
    paths.push(preset);
  }
  return { appRoot, hashes: new Map(paths.map((path) => [path, hash(path)])) };
}

export function expectNextCompilerConfigUnchanged(
  snapshot: NextCompilerSnapshot | undefined,
  phase: string,
): void {
  for (const [path, before] of snapshot?.hashes ?? []) {
    expect(hash(path), `${phase} must not rewrite generator-owned ${path}`).toBe(before);
  }
}

export async function verifyNextDevelopmentConfig(
  snapshot: NextCompilerSnapshot | undefined,
  environment: NodeJS.ProcessEnv,
  generatedCustomServer = false,
): Promise<void> {
  if (!snapshot) return;
  const port = await reservePort();
  const origin = "http://127.0.0.1:" + port;
  const evePort = generatedCustomServer ? await reservePort() : undefined;
  const require = createRequire(join(snapshot.appRoot, "package.json"));
  const server = spawnTracked(
    generatedCustomServer ? process.execPath : "node",
    generatedCustomServer
      ? ["run", "dev"]
      : [
          require.resolve("next/dist/bin/next"),
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
    snapshot.appRoot,
    {
      ...environment,
      NODE_ENV: "development",
      ...(generatedCustomServer
        ? {
            PORT: String(port),
            HOSTNAME: "127.0.0.1",
            BETTER_AUTH_URL: origin,
            NEXT_PUBLIC_APP_URL: origin,
            EVE_NEXT_PRODUCTION_PORT: String(evePort),
            EVE_NEXT_PRODUCTION_ORIGIN: "http://127.0.0.1:" + evePort,
            EVE_BASE_URL: "http://127.0.0.1:" + evePort,
          }
        : {}),
    },
  );
  try {
    await waitForHealthyHttp(server, origin + "/api/health", 180_000);
    if (generatedCustomServer) {
      for (const path of ["/", "/sign-in"]) {
        const page = await fetch(origin + path, { signal: AbortSignal.timeout(90_000) });
        expect(page.status, "Generated dev command renders " + path).toBe(200);
        expect(page.headers.get("content-type")).toContain("text/html");
        expect(await page.text()).toMatch(/<html[\s>]/i);
      }
    }
  } finally {
    await terminateProcessTree(server.child);
  }
  await assertLoopbackPortUnowned(port);
  if (evePort !== undefined) await assertLoopbackPortUnowned(evePort);
  expectNextCompilerConfigUnchanged(snapshot, "Next development");
}
