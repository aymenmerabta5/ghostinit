import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emailFlowPageContent } from "../../src/templates/apps/fragments/recovery/index.js";

const root = join(tmpdir(), `ghostinit-email-flow-lint-${process.pid}`);
const generatedPaths: string[] = [];

beforeAll(() => {
  mkdirSync(root, { recursive: true });
  for (const router of ["next", "tanstack"] as const) {
    for (const kind of ["magic-link", "verify-email"] as const) {
      const path = join(root, `${router}-${kind}.tsx`);
      writeFileSync(path, emailFlowPageContent(kind, router));
      generatedPaths.push(path);
    }
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("generated identity email-flow page lint", () => {
  test("Next exports its page component and TanStack binds its route component", () => {
    for (const kind of ["magic-link", "verify-email"] as const) {
      const next = emailFlowPageContent(kind, "next");
      const tanstack = emailFlowPageContent(kind, "tanstack");
      expect(next).toContain("export default function EmailFlowPage()");
      expect(tanstack).toContain(`createFileRoute("/${kind}")({ component: EmailFlowPage })`);
      expect(tanstack).toContain("function EmailFlowPage()");
      expect(tanstack).not.toContain("export default function EmailFlowPage()");
    }
  });

  test("all shared email-flow page variants are oxlint-clean", () => {
    const result = Bun.spawnSync(
      ["bunx", "--no-install", "oxlint", "--deny-warnings", ...generatedPaths],
      {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
    expect(result.exitCode, output).toBe(0);
  });
});
