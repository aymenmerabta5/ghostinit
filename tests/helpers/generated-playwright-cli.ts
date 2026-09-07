import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface LocalPlaywrightInvocation {
  command: string;
  args: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveLocalPlaywrightInvocation(
  webRoot: string,
  args: string[],
): LocalPlaywrightInvocation {
  const packagePath = join(webRoot, "node_modules", "@playwright", "test", "package.json");
  const manifest: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
  const bin = isObject(manifest) && isObject(manifest.bin) ? manifest.bin.playwright : undefined;
  if (bin !== "cli.js") {
    throw new Error('@playwright/test must declare bin.playwright === "cli.js"');
  }

  const packageRoot = dirname(packagePath);
  const cliPath = resolve(packageRoot, bin);
  const relativeCliPath = relative(packageRoot, cliPath);
  if (
    relativeCliPath === "" ||
    relativeCliPath.startsWith("..") ||
    isAbsolute(relativeCliPath) ||
    !statSync(cliPath).isFile()
  ) {
    throw new Error("Resolved Playwright CLI must be a file contained by @playwright/test");
  }

  const node = Bun.which("node");
  if (node === null) throw new Error("node executable was not found");
  return { command: node, args: [cliPath, ...args] };
}
