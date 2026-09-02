import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverCanonicalBunExecutable } from "../create/installer.js";

export interface ToolVersion {
  ok: boolean;
  version: string;
}

type VersionRunner = (command: string, args: string[]) => Promise<ToolVersion>;

export interface VersionProbeDependencies {
  findBun?: () => string | undefined;
  findNode?: () => string | undefined;
  readTypeScriptVersion?: (cwd: string) => Promise<ToolVersion>;
  run?: VersionRunner;
}

const missingVersion = (): ToolVersion => ({ ok: false, version: "" });

export function runCommand(command: string, args: string[]): Promise<ToolVersion> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ToolVersion): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (data) => {
      if (stdout.length < 4096) stdout += String(data).slice(0, 4096 - stdout.length);
    });
    child.once("error", () => finish(missingVersion()));
    child.once("close", (code) => {
      const version = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
      finish({ ok: code === 0 && version.length > 0, version });
    });
  });
}

export async function readInstalledTypeScriptVersion(cwd: string): Promise<ToolVersion> {
  try {
    const manifestPath = join(cwd, "node_modules", "typescript", "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
    return typeof manifest.version === "string" && manifest.version.length > 0
      ? { ok: true, version: manifest.version }
      : missingVersion();
  } catch {
    return missingVersion();
  }
}

function canonicalBunExecutable(): string | undefined {
  if (typeof Bun !== "undefined") return process.execPath || undefined;
  return discoverCanonicalBunExecutable();
}

function canonicalNodeExecutable(): string | undefined {
  if (typeof Bun === "undefined") return process.execPath || undefined;
  return Bun.which("node") ?? undefined;
}

export async function collectToolVersions(
  cwd = process.cwd(),
  dependencies: VersionProbeDependencies = {},
): Promise<{ bun: ToolVersion; node: ToolVersion; tsc: ToolVersion }> {
  const run = dependencies.run ?? runCommand;
  const bunExecutable = (dependencies.findBun ?? canonicalBunExecutable)();
  const nodeExecutable = (dependencies.findNode ?? canonicalNodeExecutable)();
  const bun = bunExecutable ? await run(bunExecutable, ["--version"]) : missingVersion();
  const node = nodeExecutable ? await run(nodeExecutable, ["--version"]) : missingVersion();
  const tsc = await (dependencies.readTypeScriptVersion ?? readInstalledTypeScriptVersion)(cwd);
  return { bun, node, tsc };
}
