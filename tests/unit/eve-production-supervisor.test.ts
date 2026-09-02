import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionProcessSupervisorContent } from "../../src/templates/root/process-supervisor.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function canConnect(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-supervisor-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: {
        "start:web": "bun server.mjs web",
        "start:eve": "bun server.mjs eve",
      },
    }),
  );
  writeFileSync(
    join(root, "server.mjs"),
    `import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
const role = process.argv[2];
const marker = process.env.MARKER_DIR + "/" + role + ".json";
const server = createServer((socket) => socket.end());
server.listen(Number(process.env.PORT), process.env.HOST || "127.0.0.1", () => {
  writeFileSync(marker, JSON.stringify({
    eveOrigin: process.env.EVE_NEXT_PRODUCTION_ORIGIN,
    host: process.env.HOST,
    nitroHost: process.env.NITRO_HOST,
    nitroPort: process.env.NITRO_PORT,
    port: process.env.PORT,
  }));
  if (role === "web") setTimeout(() => process.exit(9), 1_500);
});
setInterval(() => {}, 1_000);
`,
  );
  writeFileSync(
    join(root, "supervisor.mjs"),
    productionProcessSupervisorContent(["start:web", "start:eve"], {
      hostedEve: { eveScript: "start:eve", webScript: "start:web" },
    }),
  );
  return root;
}

test("hosted Eve supervisor validates readiness, isolates ports, propagates failure, and cleans up", async () => {
  const root = fixtureRoot();
  const webPort = await freePort();
  let evePort = await freePort();
  while (evePort === webPort) evePort = await freePort();
  const result = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVE_NEXT_PRODUCTION_ORIGIN: "",
      EVE_NEXT_PRODUCTION_PORT: String(evePort),
      GHOSTINIT_STARTUP_TIMEOUT_MS: "10000",
      MARKER_DIR: root,
      PORT: String(webPort),
    },
    shell: false,
    timeout: 20_000,
    windowsHide: true,
  });

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(9);
  expect(result.stdout).toContain("[ghostinit] production processes ready");
  const web = JSON.parse(readFileSync(join(root, "web.json"), "utf8")) as Record<string, string>;
  const eve = JSON.parse(readFileSync(join(root, "eve.json"), "utf8")) as Record<string, string>;
  expect(web.port).toBe(String(webPort));
  expect(web.eveOrigin).toBe(`http://127.0.0.1:${evePort}`);
  expect(eve).toMatchObject({
    host: "127.0.0.1",
    nitroHost: "127.0.0.1",
    nitroPort: String(evePort),
    port: String(evePort),
  });
  expect(await canConnect(evePort)).toBe(false);
}, 25_000);

test("hosted Eve supervisor rejects a web/Eve port collision before launching either process", async () => {
  const root = fixtureRoot();
  const port = await freePort();
  const result = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVE_NEXT_PRODUCTION_ORIGIN: "",
      EVE_NEXT_PRODUCTION_PORT: String(port),
      MARKER_DIR: root,
      PORT: String(port),
    },
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });

  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain(
    "PORT and EVE_NEXT_PRODUCTION_PORT must use different ports",
  );
  expect(existsSync(join(root, "web.json"))).toBe(false);
  expect(existsSync(join(root, "eve.json"))).toBe(false);
});

test("Vercel topology never launches the local Eve process beside withEve", async () => {
  const root = fixtureRoot();
  const webPort = await freePort();
  const result = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MARKER_DIR: root,
      PORT: String(webPort),
      VERCEL: "1",
    },
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(9);
  expect(existsSync(join(root, "web.json"))).toBe(true);
  expect(existsSync(join(root, "eve.json"))).toBe(false);
});
