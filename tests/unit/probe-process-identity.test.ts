import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import {
  captureProbeProcessIdentity,
  findProbeProcess,
  type ProbeProcessIdentity,
} from "../helpers/probe-process-identity.js";

test.skipIf(process.platform !== "linux")(
  "process identity ignores unrelated protected processes but rejects an unreadable matching identity",
  async () => {
    const helper = pathToFileURL(resolve(import.meta.dir, "../helpers/probe-process-identity.ts"));
    const child = spawn(
      process.execPath,
      [
        "-e",
        `import { dlopen } from "bun:ffi";
import { captureProbeProcessIdentity } from ${JSON.stringify(helper.href)};
const identity = captureProbeProcessIdentity();
const libc = dlopen("libc.so.6", { prctl: { args: ["i32", "u64", "u64", "u64", "u64"], returns: "i32" } });
const PR_SET_DUMPABLE = 4;
if (libc.symbols.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) !== 0) throw new Error("Could not make probe non-dumpable");
libc.close();
process.stdout.write(JSON.stringify(identity) + "\\n");
setInterval(() => {}, 1000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const completion = new Promise<void>((resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("close", () => resolveExit());
    });
    try {
      const identity = await new Promise<ProbeProcessIdentity>(
        (resolveIdentity, rejectIdentity) => {
          let output = "";
          let diagnostics = "";
          const timeout = setTimeout(
            () => rejectIdentity(new Error("Protected probe did not start")),
            10_000,
          );
          child.stderr!.on("data", (chunk) => {
            diagnostics += String(chunk);
          });
          child.stdout!.on("data", (chunk) => {
            output += String(chunk);
            if (!output.includes("\n")) return;
            clearTimeout(timeout);
            try {
              resolveIdentity(JSON.parse(output.trim()) as ProbeProcessIdentity);
            } catch (error) {
              rejectIdentity(error);
            }
          });
          child.once("error", (error) => {
            clearTimeout(timeout);
            rejectIdentity(error);
          });
          child.once("close", () => {
            clearTimeout(timeout);
            rejectIdentity(new Error(`Protected probe exited before inspection: ${diagnostics}`));
          });
        },
      );
      expect(findProbeProcess(captureProbeProcessIdentity())).toBe(process.pid);
      expect(findProbeProcess({ ...identity, started: "0" })).toBeUndefined();
      expect(() => findProbeProcess(identity)).toThrow(/EACCES|permission denied/);
    } finally {
      child.kill("SIGKILL");
      await completion;
    }
  },
  20_000,
);
