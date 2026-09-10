import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { authFeatureFiles } from "../../src/templates/apps/fragments/auth/feature.js";
import {
  emailFlowFiles,
  emailFlowPageContent,
} from "../../src/templates/apps/fragments/recovery/index.js";

const root = mkdtempSync(join(tmpdir(), "ghostinit-email-flow-lint-"));
const generatedPaths: string[] = [];

beforeAll(async () => {
  const transaction = new FsTransaction(root);
  for (const router of ["next", "tanstack"] as const) {
    const fixtureRoot = join(root, router);
    const files = [
      ...emailFlowFiles(router),
      ...authFeatureFiles({ router, hasEmail: true, hasPasskey: false }),
    ];
    for (const { path, content } of files) {
      await transaction.write(`${router}/${path}`, content);
      generatedPaths.push(join(fixtureRoot, path));
    }
  }
  await transaction.commit();
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("generated identity email-flow page lint", () => {
  test("Next exports its page component and TanStack binds its route component", () => {
    for (const kind of ["magic-link", "verify-email"] as const) {
      const screenName = kind === "magic-link" ? "MagicLinkScreen" : "VerifyEmailScreen";
      const next = emailFlowPageContent(kind, "next");
      const tanstack = emailFlowPageContent(kind, "tanstack");
      const importStatement = `import { ${screenName} } from "@/features/auth/${kind}-screen"`;
      expect(next).toContain(importStatement);
      expect(next).toContain(`export default function Page() { return <${screenName} />; }`);
      expect(tanstack).toContain(importStatement);
      expect(tanstack).toContain(`createFileRoute("/${kind}")({ component: ${screenName} })`);
      expect(tanstack).not.toContain("export default");
      for (const router of ["next", "tanstack"] as const) {
        const files = authFeatureFiles({ router, hasEmail: true, hasPasskey: false });
        const featureRoot = "apps/web/src/features/auth";
        const screen = files.find(
          ({ path }) => path === `${featureRoot}/${kind}-screen.tsx`,
        )?.content;
        expect(screen).toContain(`export function ${screenName}()`);
        expect(screen).toContain(`useEmailFlowForm("${kind}")`);
        expect(screen).toContain(`import { EmailFlowView } from "./components/${kind}-form"`);
        const view = files.find(
          ({ path }) => path === `${featureRoot}/components/${kind}-form.tsx`,
        )?.content;
        expect(view).toContain("export function EmailFlowView(");
        expect(view).toContain("<form.SubmitButton");
      }
    }
  });

  test("all shared email-flow pages and their emitted auth features are oxlint-clean", () => {
    const result = Bun.spawnSync(
      [process.execPath, "x", "--no-install", "oxlint", "--deny-warnings", ...generatedPaths],
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
