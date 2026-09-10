// @allow-long 390: protocol, partial startup and owner-loss faults share the same process fixture
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPostgresWorker } from "../helpers/e2e-postgres-worker.js";
import {
  deadline,
  launchPostgresLifecycle,
  lifecycleRejection,
  observeWorkerExit,
  rebindPostgresPort,
} from "../helpers/e2e-postgres-lifecycle.js";

const workerPath = fileURLToPath(new URL("./e2e-postgres-worker.mjs", import.meta.url));
const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir()))
      throw new Error("Unexpected fixture cleanup root");
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-pg-worker-"));
  temporary.push(root);
  return root;
}

function controlledWorker(
  behavior:
    | "silent"
    | "malformed"
    | "overflow"
    | "error"
    | "close-hang"
    | "crash"
    | "premature-closed"
    | "duplicate-closed"
    | "junk-tail"
    | "ready-then-error"
    | "error-then-ready",
) {
  const root = fixture();
  const metadata = join(root, "metadata.json");
  const entry = join(root, "worker.mjs");
  writeFileSync(
    entry,
    `import {createServer} from "node:net";
import {writeFileSync} from "node:fs";
const behavior=${JSON.stringify(behavior)};
const emit=(message)=>console.log(JSON.stringify({protocol:1,pid:process.pid,...message}));
const server=createServer(socket=>{socket.on("error",()=>{});if(behavior==="crash")socket.on("data",()=>process.exit(9));});
server.listen(0,"127.0.0.1",()=>{
  const port=server.address().port;
  writeFileSync(${JSON.stringify(metadata)},JSON.stringify({pid:process.pid,port}));
  if(behavior==="silent")return;
  if(behavior==="error"){emit({type:"error",message:"injected startup failure"});return;}
  if(behavior==="overflow"){process.stdout.write("x".repeat(4097)+"\\n");return;}
  if(behavior==="premature-closed")emit({type:"closed"});
  if(behavior==="ready-then-error"||behavior==="error-then-ready"){
    const records=[{type:"ready",port,nodeVersion:process.versions.node},{type:"error",message:"coalesced startup failure"}];
    if(behavior==="error-then-ready")records.reverse();
    process.stdout.write(records.map(message=>JSON.stringify({protocol:1,pid:process.pid,...message})).join("\\n")+"\\n");return;
  }
  emit({type:"ready",port:behavior==="malformed"?"bad":port,nodeVersion:process.versions.node});
});
let closing=false;
function close(){if(closing||behavior==="close-hang")return;closing=true;server.close(()=>{emit({type:"closed"});if(behavior==="duplicate-closed")emit({type:"closed"});if(behavior==="junk-tail")process.stdout.write("unterminated");process.stdin.destroy();});}
process.stdin.resume();process.stdin.on("data",close);process.stdin.on("end",close);
`,
  );
  return { entry, metadata };
}

test("the directly owned plain-JS worker closes once and releases its real port", async () => {
  const worker = await startPostgresWorker({ workerPath });
  expect(worker.nodeVersion).toMatch(/^\d+\.\d+\.\d+/);
  const closing = worker.close();
  expect(worker.close()).toBe(closing);
  await closing;
  await worker.close();
  await rebindPostgresPort(worker.port);
});

test("missing Node and missing worker entry fail without an unowned process", async () => {
  const root = fixture();
  const missingNode = await lifecycleRejection(
    startPostgresWorker({ workerPath, nodeExecutable: join(root, "missing-node") }),
  );
  expect(missingNode.message).toMatch(/ENOENT|spawn|Executable not found/);
  const missingWorker = await lifecycleRejection(
    startPostgresWorker({ workerPath: join(root, "missing-worker.mjs") }),
  );
  expect(missingWorker.message).toContain("exited unexpectedly");
});

for (const [behavior, expected] of [
  ["silent", "readiness timed out"],
  ["malformed", "Invalid PostgreSQL worker readiness message"],
  ["overflow", "protocol bound"],
  ["error", "injected startup failure"],
  ["premature-closed", "Unexpected PostgreSQL worker close acknowledgement"],
  ["ready-then-error", "coalesced startup failure"],
  ["error-then-ready", "coalesced startup failure"],
] as const) {
  test(`startup ${behavior} is bounded and releases resources`, async () => {
    const fixture = controlledWorker(behavior);
    const failure = await lifecycleRejection(
      startPostgresWorker({
        workerPath: fixture.entry,
        readyTimeoutMs: 1_500,
        closeTimeoutMs: 1_500,
      }),
    );
    expect(failure.message).toContain(expected);
    const { port } = JSON.parse(readFileSync(fixture.metadata, "utf8")) as { port: number };
    await rebindPostgresPort(port);
  });
}

for (const behavior of ["duplicate-closed", "junk-tail"] as const) {
  test(`cleanup rejects ${behavior} protocol output after readiness`, async () => {
    const fixture = controlledWorker(behavior);
    const worker = await startPostgresWorker({ workerPath: fixture.entry });
    const failure = await lifecycleRejection(worker.close());
    expect(failure.message).toBe(
      behavior === "duplicate-closed"
        ? "Unexpected PostgreSQL worker close acknowledgement"
        : "PostgreSQL worker ended with an unterminated protocol message",
    );
    await rebindPostgresPort(worker.port);
  });
}

test("a worker that hangs during close is terminated and the failed cleanup is reported", async () => {
  const fixture = controlledWorker("close-hang");
  const worker = await startPostgresWorker({ workerPath: fixture.entry, closeTimeoutMs: 300 });
  const failure = await lifecycleRejection(worker.close());
  expect(failure.message).toBe("PostgreSQL worker shutdown timed out");
  await rebindPostgresPort(worker.port);
});

test("a post-readiness worker crash is reported and releases its listener", async () => {
  const fixture = controlledWorker("crash");
  const worker = await startPostgresWorker({ workerPath: fixture.entry });
  const client = createConnection({ host: "127.0.0.1", port: worker.port });
  client.on("error", () => undefined);
  const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
  client.once("connect", () => client.end("crash"));
  await deadline(closed);
  const failure = await lifecycleRejection(worker.close());
  expect(failure.message).toMatch(/worker .*\(9\/null\)/);
  await rebindPostgresPort(worker.port);
});

test("early owner EOF exits without advertising readiness", async () => {
  const raw = launchPostgresLifecycle(workerPath);
  try {
    raw.child.stdin.end();
    expect((await deadline(raw.completed)).code).toBe(0);
    expect(raw.messages.some((message) => message.type === "ready")).toBe(false);
    expect(raw.messages.some((message) => message.type === "closed")).toBe(true);
  } finally {
    await raw.cleanup();
  }
});

test("post-readiness EOF closes an active TCP client without TypeScript loading", async () => {
  const raw = launchPostgresLifecycle(workerPath, ["--no-experimental-strip-types"]);
  try {
    const ready = await raw.message("ready");
    const client = createConnection({ host: "127.0.0.1", port: ready.port! });
    client.on("error", () => undefined);
    const connected = new Promise<void>((resolve) => client.once("connect", resolve));
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await deadline(connected);
    raw.child.stdin.end();
    await deadline(closed);
    expect((await deadline(raw.completed)).code).toBe(0);
    expect(raw.messages.some((message) => message.type === "closed")).toBe(true);
    await rebindPostgresPort(ready.port!);
  } finally {
    await raw.cleanup();
  }
});

test("abrupt owner death closes the inherited-pipe worker and its active TCP client", async () => {
  const root = fixture();
  const ownerPath = join(root, "owner.mjs");
  writeFileSync(
    ownerPath,
    `import {spawn} from "node:child_process";
const worker=spawn(process.execPath,[${JSON.stringify(workerPath)}],{stdio:["pipe","inherit","inherit"],detached:false,windowsHide:true});
process.stdin.resume();process.stdin.on("data",()=>{void worker.pid;process.exit(23);});
`,
  );
  const owner = launchPostgresLifecycle(ownerPath);
  try {
    const ready = await owner.message("ready");
    expect(ready.pid).not.toBe(owner.child.pid);
    const waitForWorkerExit = await observeWorkerExit(ready.pid);
    const client = createConnection({ host: "127.0.0.1", port: ready.port! });
    client.on("error", () => undefined);
    const connected = new Promise<void>((resolve) => client.once("connect", resolve));
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await deadline(connected);
    owner.child.stdin.write("exit\n");
    await deadline(closed);
    const result = await deadline(owner.completed);
    expect(result.code).toBe(23);
    await waitForWorkerExit();
    await rebindPostgresPort(ready.port!);
  } finally {
    await owner.cleanup();
  }
});

test("actual worker startup failure closes a partially started socket and database", async () => {
  const root = fixture();
  const entry = join(root, "worker.mjs");
  const metadata = join(root, "partial.json");
  const databaseClosed = join(root, "database-closed");
  writeFileSync(entry, readFileSync(workerPath));
  for (const name of ["pglite", "pglite-socket"]) {
    const directory = join(root, "node_modules", "@electric-sql", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: `@electric-sql/${name}`, type: "module", exports: "./index.mjs" }),
    );
    writeFileSync(
      join(directory, "index.mjs"),
      name === "pglite"
        ? `import {writeFileSync} from "node:fs";
export class PGlite {static defaultStartParams=[];static async create(){return {close:async()=>writeFileSync(${JSON.stringify(databaseClosed)},"closed")};}}
`
        : `import {createServer} from "node:net";import {writeFileSync} from "node:fs";
export class PGLiteSocketServer {constructor(){this.server=createServer();}async start(){await new Promise(resolve=>this.server.listen(0,"127.0.0.1",resolve));writeFileSync(${JSON.stringify(metadata)},JSON.stringify({port:this.server.address().port}));throw new Error("injected socket startup failure");}async stop(){await new Promise(resolve=>this.server.close(resolve));}}
`,
    );
  }
  const failure = await lifecycleRejection(startPostgresWorker({ workerPath: entry }));
  expect(failure.message).toContain("injected socket startup failure");
  expect(readFileSync(databaseClosed, "utf8")).toBe("closed");
  const { port } = JSON.parse(readFileSync(metadata, "utf8")) as { port: number };
  await rebindPostgresPort(port);
});

test("owner-channel EOF retains the worker deadline when stop throws with a live listener", async () => {
  const root = fixture();
  const entry = join(root, "worker.mjs");
  const metadata = join(root, "retained-listener.json");
  const databaseClosed = join(root, "database-closed");
  writeFileSync(entry, readFileSync(workerPath));
  for (const name of ["pglite", "pglite-socket"]) {
    const directory = join(root, "node_modules", "@electric-sql", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: `@electric-sql/${name}`, type: "module", exports: "./index.mjs" }),
    );
    writeFileSync(
      join(directory, "index.mjs"),
      name === "pglite"
        ? `import {writeFileSync} from "node:fs";
export class PGlite {static defaultStartParams=[];static async create(){return {close:async()=>writeFileSync(${JSON.stringify(databaseClosed)},"closed")};}}
`
        : `import {createServer} from "node:net";import {writeFileSync} from "node:fs";
export class PGLiteSocketServer {constructor(){this.server=createServer(socket=>socket.on("error",()=>{}));}async start(){await new Promise(resolve=>this.server.listen(0,"127.0.0.1",resolve));}getServerConn(){return "127.0.0.1:"+this.server.address().port;}async stop(){writeFileSync(${JSON.stringify(metadata)},JSON.stringify({port:this.server.address().port,failedAt:Date.now()}));throw new Error("injected stop failure retaining listener");}}
`,
    );
  }
  const raw = launchPostgresLifecycle(entry);
  try {
    const ready = await raw.message("ready");
    const waitForWorkerExit = await observeWorkerExit(ready.pid);
    const client = createConnection({ host: "127.0.0.1", port: ready.port! });
    client.on("error", () => undefined);
    const connected = new Promise<void>((resolve) => client.once("connect", resolve));
    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    await deadline(connected);
    raw.child.stdin.end();
    expect((await raw.message("error")).message).toBe("injected stop failure retaining listener");
    expect(client.destroyed).toBe(false);
    await deadline(closed, 15_000);
    await waitForWorkerExit();
    expect((await deadline(raw.completed)).code).toBe(1);
    const failed = JSON.parse(readFileSync(metadata, "utf8")) as { port: number; failedAt: number };
    expect(failed.port).toBe(ready.port!);
    expect(Date.now() - failed.failedAt).toBeGreaterThanOrEqual(9_000);
    expect(Date.now() - failed.failedAt).toBeLessThan(15_000);
    expect(readFileSync(databaseClosed, "utf8")).toBe("closed");
    await rebindPostgresPort(ready.port!);
  } finally {
    await raw.cleanup();
  }
});
