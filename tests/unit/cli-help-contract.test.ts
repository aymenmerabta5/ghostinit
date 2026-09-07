import { describe, expect, test } from "bun:test";
import { showHelp } from "../../src/cli/help.js";

describe("CLI maintenance help contract", () => {
  test("describes sync and upgrade as dry-run-capable desired-state reconciliation", () => {
    const help = showHelp();

    expect(help).toContain("upgrade [--dry-run] [--force]");
    expect(help).toContain("Hash-gated transactional desired-state upgrade");
    expect(help).toContain("sync [--check] [--dry-run] [--force]");
    expect(help).toContain("Reconcile desired state and rebuild generated indexes");
  });
});
