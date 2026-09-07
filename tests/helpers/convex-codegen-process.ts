import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { buildInstallEnv, runSupervisedCommand } from "../../src/commands/create/installer.js";
import { redactSecretValues } from "../../src/lib/logger.js";

export interface CodegenCommandResult {
  readonly label: string;
  readonly exitCode: number;
  readonly output: string;
}

export class ConvexCodegenRunner {
  readonly environment: NodeJS.ProcessEnv;
  readonly steps: Array<{ label: string; exitCode: number | null; cleanupVerified: boolean }> = [];
  cleanupVerified = true;
  private readonly deadline = Date.now() + 12 * 60_000;

  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {
    const environment = buildInstallEnv(root);
    const overrides = {
      HOME: join(root, ".home"),
      USERPROFILE: join(root, ".home"),
      LOCALAPPDATA: join(root, ".home", "AppData", "Local"),
      APPDATA: join(root, ".home", "AppData", "Roaming"),
      XDG_CACHE_HOME: join(root, ".home", ".cache"),
      TEMP: join(root, ".tmp"),
      TMP: join(root, ".tmp"),
      TMPDIR: join(root, ".tmp"),
      CI: "1",
      NO_COLOR: "1",
      CONVEX_AGENT_MODE: "anonymous",
    };
    const replaced = new Set(Object.keys(overrides));
    for (const key of Object.keys(environment)) {
      if (replaced.has(key.toUpperCase())) delete environment[key];
    }
    this.environment = { ...environment, ...overrides };
  }

  async run(
    label: string,
    command: string,
    argv: string[],
    timeoutMs = 120_000,
  ): Promise<CodegenCommandResult> {
    let output = "";
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new Error("Convex codegen proof exceeded its 12-minute deadline");
    const append = (chunk: Buffer): void => {
      output = (output + chunk.toString("utf8")).slice(-32_000);
    };
    const result = await runSupervisedCommand({
      command,
      argv,
      cwd: this.root,
      label,
      env: this.environment,
      timeoutMs: Math.min(timeoutMs, remaining),
      onStdout: append,
      onStderr: append,
    }).catch((error: unknown) => ({
      exitCode: null,
      signal: null,
      timedOut: false,
      cleanupVerified: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
    this.cleanupVerified &&= result.cleanupVerified;
    this.steps.push({ label, exitCode: result.exitCode, cleanupVerified: result.cleanupVerified });
    console.log(
      `[convex-codegen] ${label}: exit=${result.exitCode}, cleanup=${result.cleanupVerified}`,
    );
    const safeOutput = this.redact(output);
    if (result.exitCode !== 0) console.error(safeOutput);
    if (
      !result.cleanupVerified ||
      result.timedOut ||
      result.signal !== null ||
      result.exitCode === null
    ) {
      throw new Error(
        `${label} failed supervision: ${this.redact(result.error?.message ?? "no clean exit")}\n${safeOutput}`,
      );
    }
    return { label, exitCode: result.exitCode, output: safeOutput };
  }

  async success(
    label: string,
    command: string,
    argv: string[],
    timeoutMs?: number,
  ): Promise<CodegenCommandResult> {
    const result = await this.run(label, command, argv, timeoutMs);
    if (result.exitCode !== 0)
      throw new Error(`${label} exited ${result.exitCode}\n${result.output}`);
    return result;
  }

  private redact(output: string): string {
    return redactSecretValues(output.replaceAll(this.secret, "[REDACTED]"));
  }
}

export interface LocalCodegenBackend {
  readonly version: string;
  readonly sha256: string;
  readonly ports: readonly number[];
}

export async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function inspectLocalCodegenBackend(root: string): Promise<LocalCodegenBackend> {
  // This is fixture-owned state. Never serialize its local admin key or instance secret.
  const config = JSON.parse(
    await readFile(join(root, ".convex", "local", "default", "config.json"), "utf8"),
  ) as {
    backendVersion?: unknown;
    deploymentName?: unknown;
    cloudProjectId?: unknown;
    ports?: { cloud?: unknown; site?: unknown };
  };
  const version = config.backendVersion;
  if (typeof version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version)) {
    throw new Error("Local Convex backend did not record a valid version");
  }
  if (
    typeof config.deploymentName !== "string" ||
    !config.deploymentName.startsWith("anonymous-") ||
    config.cloudProjectId !== undefined
  ) {
    throw new Error("Convex codegen proof did not select an anonymous local deployment");
  }
  const ports = [config.ports?.cloud, config.ports?.site];
  if (
    !ports.every(
      (port) => typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536,
    )
  ) {
    throw new Error("Local Convex backend did not record valid loopback ports");
  }
  const cache =
    process.platform === "win32"
      ? join(root, ".home", "AppData", "Local", "convex")
      : join(root, ".home", ".cache", "convex");
  const binary = join(
    cache,
    "binaries",
    version,
    `convex-local-backend${process.platform === "win32" ? ".exe" : ""}`,
  );
  return { version, sha256: await fileSha256(binary), ports: ports as number[] };
}

function portAcceptsConnections(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Could not verify closure of Convex port ${port}`));
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve(false);
      // A reset can race listener shutdown; it is not evidence of a closed port.
      else if (error.code === "ECONNRESET") resolve(true);
      else reject(new Error(`Convex port closure check failed: ${error.code ?? "unknown"}`));
    });
  });
}

export async function assertLocalBackendStopped(
  backend: LocalCodegenBackend,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let closedObservations = 0;
  let lastOpen: number[] = [];
  while (Date.now() < deadline) {
    lastOpen = [];
    for (const port of backend.ports) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      if (await portAcceptsConnections(port, Math.min(1_000, remaining))) lastOpen.push(port);
    }
    closedObservations = lastOpen.length === 0 ? closedObservations + 1 : 0;
    if (closedObservations === 2 && Date.now() < deadline) return;
    // Convex sends SIGTERM without waiting; measured shutdown tails were 31–56 ms.
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Convex backend ports did not close within ${timeoutMs} ms; last open ports: ${lastOpen.join(", ") || "closure was not stable"}`,
  );
}
