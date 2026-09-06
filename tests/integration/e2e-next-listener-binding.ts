import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";

const DIRECT_NEXT_START = new Set(["next start", "bun ./node_modules/next/dist/bin/next start"]);
const WORKSPACE_START = "bun run --cwd apps/web start";
const SUPERVISED_START = "bun --env-file=.env.local run start:production";
const PRODUCTION_START = "bun scripts/start-production.mjs";

interface PackageManifest {
  scripts: Record<string, string>;
  [key: string]: unknown;
}

interface NextLoopbackEdit {
  readonly path: string;
  readonly previousContent: string;
  readonly content: string;
}

function manifest(source: string): PackageManifest {
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("scripts" in value) ||
    typeof value.scripts !== "object" ||
    value.scripts === null ||
    Array.isArray(value.scripts) ||
    Object.values(value.scripts).some((script) => typeof script !== "string")
  ) {
    throw new Error("E2E Next binding requires a generated package with string scripts");
  }
  return value as PackageManifest;
}

/** Configure the test fixture's bind address without changing root supervision or production defaults. */
export function planNextLoopbackStart(rootSource: string, webSource?: string): NextLoopbackEdit {
  const root = manifest(rootSource);
  const scripts = root.scripts;
  const supervised = scripts.start === SUPERVISED_START;
  if (
    (scripts["start:production"] !== undefined &&
      scripts["start:production"] !== PRODUCTION_START) ||
    (supervised && scripts["start:production"] !== PRODUCTION_START)
  ) {
    throw new Error("E2E Next binding encountered an unexpected production supervisor command");
  }
  const selected = webSource === undefined ? root : manifest(webSource);
  const changes: string[] = [];
  if (webSource !== undefined) {
    if (
      (!supervised && scripts.start !== WORKSPACE_START) ||
      (scripts["start:web"] !== undefined && scripts["start:web"] !== WORKSPACE_START) ||
      (supervised && scripts["start:web"] !== WORKSPACE_START) ||
      !DIRECT_NEXT_START.has(selected.scripts.start ?? "")
    ) {
      throw new Error("E2E Next binding encountered an unexpected monorepo start command");
    }
    changes.push("start");
  } else {
    if (
      (!supervised && !DIRECT_NEXT_START.has(scripts.start ?? "")) ||
      (scripts["start:web"] !== undefined && !DIRECT_NEXT_START.has(scripts["start:web"])) ||
      (supervised && !DIRECT_NEXT_START.has(scripts["start:web"] ?? "")) ||
      (!supervised && scripts["start:web"] !== undefined && scripts["start:web"] !== scripts.start)
    ) {
      throw new Error("E2E Next binding encountered an unexpected single-project start command");
    }
    if (!supervised) changes.push("start");
    if (scripts["start:web"] !== undefined) changes.push("start:web");
  }
  for (const name of changes) selected.scripts[name] += " --hostname 127.0.0.1";
  return {
    path: webSource === undefined ? "package.json" : "apps/web/package.json",
    previousContent: webSource ?? rootSource,
    content: JSON.stringify(selected, null, 2) + "\n",
  };
}

export async function configureNextLoopbackStart(projectRoot: string): Promise<void> {
  const webPath = join(projectRoot, "apps/web/package.json");
  const edit = planNextLoopbackStart(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
    existsSync(webPath) ? readFileSync(webPath, "utf8") : undefined,
  );
  const transaction = new FsTransaction(projectRoot);
  await transaction.writeIfUnchanged(edit.path, edit.content, edit.previousContent);
  await transaction.commit();
}
