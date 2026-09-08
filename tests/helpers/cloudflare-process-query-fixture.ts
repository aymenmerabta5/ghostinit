import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudflareProcessHelpers } from "../../src/templates/root/cloudflare-process.js";
import { destroyFixture } from "./cloudflare-runtime-fixture.js";

interface QueryReport {
  operation: "discovery";
  success: boolean;
  ownIdentity?: boolean;
  elapsedMs: number;
  count?: number;
  error?: string;
  stages: readonly string[];
  events: readonly {
    event: string;
    elapsedMs: number;
    status?: number | null;
    signal?: string | null;
    code?: string | null;
  }[];
  totalElapsedMs: number;
  nativeCloseWaitMs?: number;
  nativeClosed: boolean;
}

export interface QueryFixtureResult {
  status: number | null;
  signal: string | null;
  stderrBytes: number;
  outputBytes: number;
  report: QueryReport | null;
}

const queryInstrumentation = String.raw`
const events = [];
const nativeClosures = [];
let nativeClosed = 0;
function record(event, details = {}) {
  events.push({ event, elapsedMs: Date.now() - startedAt, ...details });
}
function spawn(command, args, options) {
  record("SPAWN_REQUESTED");
  const instrumented = [...args];
  if (diagnoseStages) {
    const commandIndex = instrumented.indexOf("-Command") + 1;
    instrumented[commandIndex] = '[Console]::Error.WriteLine("GI_QUERY_SCRIPT");\n' +
      instrumented[commandIndex]
        .replace('$records = @(', '[Console]::Error.WriteLine("GI_QUERY_CIM");\n$records = @(')
        .replace('})\nConvertTo-Json', '})\n[Console]::Error.WriteLine("GI_QUERY_SERIALIZE");\nConvertTo-Json') +
      '\n[Console]::Error.WriteLine("GI_QUERY_DONE");';
  }
  const query = nativeSpawn(command, instrumented, options);
  query.once("spawn", () => record("SPAWNED"));
  query.once("error", (error) => record("ERROR", { code: error.code ?? null }));
  query.once("exit", (status, signal) => record("EXIT", { status, signal }));
  nativeClosures.push(new Promise((resolveClose) => {
    query.once("close", (status, signal) => {
      record("CLOSE", { status, signal });
      nativeClosed += 1;
      resolveClose();
    });
  }));
  const nativeKill = query.kill.bind(query);
  query.kill = (signal) => {
    record("KILL_REQUESTED", { signal: signal ?? "SIGTERM" });
    return nativeKill(signal);
  };
  query.stdout.once("data", () => record("FIRST_STDOUT"));
  query.stderr.once("data", () => record("FIRST_STDERR"));
  let pending = "";
  query.stderr.on("data", (chunk) => {
    const lines = (pending + chunk.toString()).split(/\r?\n/);
    pending = lines.pop().slice(-1024);
    for (const line of lines) {
      const match = /^GI_QUERY_(SCRIPT|CIM|SERIALIZE|DONE)$/.exec(line);
      if (match && !stages.includes(match[1])) {
        stages.push(match[1]);
        record(match[1]);
      }
    }
  });
  return query;
}
`;

export function runWindowsQueryFixture(
  environment: NodeJS.ProcessEnv,
  diagnoseStages = false,
): QueryFixtureResult {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-cloudflare-query-"));
  const script = "query.mjs";
  writeFileSync(
    join(root, script),
    `import { spawn as nativeSpawn, spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
const stages = [];
const diagnoseStages = ${diagnoseStages};
${queryInstrumentation}
${cloudflareProcessHelpers()}
const startedAt = Date.now();
let report;
try {
  record("DISCOVERY_STARTED");
  const rows = await windowsProcessTable();
  record("DISCOVERY_RESOLVED");
  report = { operation: "discovery", success: true, ownIdentity: rows.some((row) => row.pid === process.pid),
    elapsedMs: Date.now() - startedAt, count: rows.length, stages, events };
} catch (error) {
  record("DISCOVERY_REJECTED");
  report = { operation: "discovery", success: false, elapsedMs: Date.now() - startedAt, error: error.message, stages, events };
  process.exitCode = 1;
}
// Keep the discovery result at its original deadline. Only finish diagnostics
// after native close, including pipe drain; the outer 15s wrapper bound remains.
// Emit a provisional snapshot so an outer timeout still retains the first-call
// stages and the original verdict. No child output or environment values enter it.
console.log(JSON.stringify({ ...report, nativeClosed: nativeClosed === nativeClosures.length,
  totalElapsedMs: Date.now() - startedAt }));
const closeStartedAt = Date.now();
await Promise.all(nativeClosures);
report.nativeCloseWaitMs = Date.now() - closeStartedAt;
report.totalElapsedMs = Date.now() - startedAt;
report.nativeClosed = nativeClosed === nativeClosures.length;
console.log(JSON.stringify(report));
`,
  );
  const result = spawnSync(process.execPath, [join(root, script)], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 15_000,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  let report: QueryReport | null = null;
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    if (!line.startsWith('{"operation":"discovery"')) continue;
    try {
      report = JSON.parse(line) as QueryReport;
    } catch {
      // Retain an earlier complete snapshot if the wrapper timed out mid-write.
    }
  }
  // A timed-out wrapper may still have a native child. Keep its files for recovery.
  if (result.error || result.signal !== null) {
    const diagnostic = {
      code: (result.error as NodeJS.ErrnoException | undefined)?.code ?? null,
      status: result.status,
      signal: result.signal,
      stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
      stderrBytes: Buffer.byteLength(result.stderr ?? ""),
      report,
    };
    throw new Error(
      `Windows query fixture did not exit normally: ${JSON.stringify(diagnostic)}; retained ${root}`,
    );
  }
  try {
    return {
      status: result.status,
      signal: result.signal,
      stderrBytes: Buffer.byteLength(result.stderr),
      outputBytes: Buffer.byteLength(result.stdout),
      report,
    };
  } finally {
    destroyFixture({ root, script });
  }
}
