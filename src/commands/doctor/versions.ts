import { spawn } from "node:child_process";

export function runCommand(cmd: string, args: string[]): Promise<{ ok: boolean; version: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, version: stdout.split("\n")[0].trim() });
    });
  });
}

export async function collectToolVersions() {
  const bun = await runCommand("bun", ["--version"]);
  const node = await runCommand("node", ["--version"]);
  const tsc = await runCommand("bunx", ["tsc", "--version"]);
  return { bun, node, tsc };
}
