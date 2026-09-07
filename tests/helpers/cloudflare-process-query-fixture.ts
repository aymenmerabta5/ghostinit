import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudflareProcessHelpers } from "../../src/templates/root/cloudflare-process.js";
import { destroyFixture } from "./cloudflare-runtime-fixture.js";

interface QueryReport {
  success: boolean;
  ownIdentity?: boolean;
  elapsedMs: number;
  count?: number;
  error?: string;
  stages: readonly string[];
}

export interface QueryFixtureResult {
  status: number | null;
  signal: string | null;
  stderrBytes: number;
  outputBytes: number;
  report: QueryReport | null;
}

const stageInstrumentation = String.raw`
function spawn(command, args, options) {
  const instrumented = [...args];
  const commandIndex = instrumented.indexOf("-Command") + 1;
  instrumented[commandIndex] = '[Console]::Error.WriteLine("GI_QUERY_SCRIPT");\n' +
    instrumented[commandIndex]
      .replace('$records = @(', '[Console]::Error.WriteLine("GI_QUERY_CIM");\n$records = @(')
      .replace('})\nConvertTo-Json', '})\n[Console]::Error.WriteLine("GI_QUERY_SERIALIZE");\nConvertTo-Json') +
    '\n[Console]::Error.WriteLine("GI_QUERY_DONE");';
  const query = nativeSpawn(command, instrumented, options);
  let pending = "";
  query.stderr.on("data", (chunk) => {
    const lines = (pending + chunk.toString()).split(/\r?\n/);
    pending = lines.pop().slice(-1024);
    for (const line of lines) {
      const match = /^GI_QUERY_(SCRIPT|CIM|SERIALIZE|DONE)$/.exec(line);
      if (match && !stages.includes(match[1])) stages.push(match[1]);
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
${diagnoseStages ? stageInstrumentation : "const spawn = nativeSpawn;"}
${cloudflareProcessHelpers()}
const startedAt = Date.now();
try {
  const rows = await windowsProcessTable();
  console.log(JSON.stringify({ success: true, ownIdentity: rows.some((row) => row.pid === process.pid),
    elapsedMs: Date.now() - startedAt, count: rows.length, stages }));
} catch (error) {
  console.log(JSON.stringify({ success: false, elapsedMs: Date.now() - startedAt, error: error.message, stages }));
  process.exitCode = 1;
}
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
  // A timed-out wrapper may still have a native child. Keep its files for recovery.
  if (result.error || result.signal !== null) {
    const diagnostic = {
      code: (result.error as NodeJS.ErrnoException | undefined)?.code ?? null,
      status: result.status,
      signal: result.signal,
      stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
      stderrBytes: Buffer.byteLength(result.stderr ?? ""),
    };
    throw new Error(
      `Windows query fixture did not exit normally: ${JSON.stringify(diagnostic)}; retained ${root}`,
    );
  }
  try {
    let report: QueryReport | null = null;
    try {
      report = JSON.parse(result.stdout) as QueryReport;
    } catch {
      // Diagnostics contain only byte counts when the wrapper output is incomplete.
    }
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
