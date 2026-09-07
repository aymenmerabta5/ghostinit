import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Match workspace-link realpaths, including the actual on-disk casing on Windows. */
export function createTemporaryWorkspace(prefix: string, parent = tmpdir()): string {
  return realpathSync.native(mkdtempSync(join(parent, prefix)));
}
