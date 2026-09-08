import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { developmentProcessSupervisorContent } from "../../src/templates/root/process-supervisor.js";
import { reservePort } from "../integration/e2e-build-process.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("development supervisor preserves app runtime, owns Node Eve, and stops both trees", async () => {
  const root = createTemporaryWorkspace("gi-development-supervisor-");
  roots.push(root);
  const webPort = await reservePort();
  let evePort = await reservePort();
  while (evePort === webPort) evePort = await reservePort();
  const tx = new FsTransaction(root);
  await tx.write(
    "package.json",
    JSON.stringify({
      private: true,
      type: "module",
      scripts: { "eve:dev": "node eve.mjs", "dev:web": "bun web.mjs" },
    }),
  );
  await tx.write(
    "supervisor.mjs",
    developmentProcessSupervisorContent(["eve:dev", "dev:web"], {
      hostedEve: { eveScript: "eve:dev", webScript: "dev:web" },
    }),
  );
  await tx.write(
    "eve.mjs",
    `import { createServer } from "node:net";
import { writeFileSync } from "node:fs";
const server = createServer(socket => socket.end());
server.listen(Number(process.env.PORT), "127.0.0.1", () => {
  writeFileSync("eve.json", JSON.stringify({ node: typeof Bun === "undefined", environment: process.env.NODE_ENV, origin: process.env.EVE_BASE_URL, privateOrigin: process.env.EVE_NEXT_PRODUCTION_ORIGIN, port: process.env.PORT }));
});
setInterval(() => writeFileSync("eve-heartbeat", "alive"), 25);
`,
  );
  await tx.write(
    "web.mjs",
    `import { writeFileSync } from "node:fs";
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response("ready") });
writeFileSync("web.json", JSON.stringify({ bun: typeof Bun !== "undefined", environment: process.env.NODE_ENV, origin: process.env.EVE_BASE_URL, port: process.env.PORT }));
setTimeout(() => { server.stop(true); process.exit(7); }, 1500);
`,
  );
  await tx.commit();
  const run = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(webPort),
      EVE_NEXT_PRODUCTION_PORT: String(evePort),
      EVE_NEXT_PRODUCTION_ORIGIN: "",
      EVE_BASE_URL: "",
      NODE_ENV: "production",
      VERCEL: "1",
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
  });
  expect(run.error, run.stderr).toBeUndefined();
  expect(run.status, run.stderr).toBe(7);
  expect(run.stdout).toContain("development processes ready");
  const origin = `http://127.0.0.1:${evePort}`;
  expect(JSON.parse(await readFile(join(root, "eve.json"), "utf8"))).toEqual({
    node: true,
    environment: "development",
    origin,
    privateOrigin: origin,
    port: String(evePort),
  });
  expect(JSON.parse(await readFile(join(root, "web.json"), "utf8"))).toEqual({
    bun: true,
    environment: "development",
    origin,
    port: String(webPort),
  });
  await rm(join(root, "eve-heartbeat"));
  await Bun.sleep(150);
  expect(await readFile(join(root, "eve-heartbeat"), "utf8").catch(() => null)).toBeNull();
}, 25_000);
