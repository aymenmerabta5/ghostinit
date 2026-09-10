import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative } from "node:path";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const child = relative(tmpdir(), root);
    if (
      !child ||
      child.startsWith("..") ||
      isAbsolute(child) ||
      !basename(root).startsWith("ghostinit-dashboard-shell-")
    )
      throw new Error("Refusing to remove an unverified dashboard fixture");
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe("Next dashboard shell capability closure", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const auth of [false, true]) {
      test(`${mode} analytics with auth=${auth} emits a complete reachable shell graph`, async () => {
        const config = projectConfigSchema.parse({
          name: "dashboard-shell-proof",
          runtime: "bun",
          mode,
          framework: "nextjs",
          preset: "custom",
          database: auth ? "postgres" : "none",
          apps: ["web"],
          auth,
          api: auth,
          email: false,
          analytics: true,
          billing: [],
          features: [],
        });
        const files = generateProjectFiles(config, { dryRun: true });
        const sourceRoot = mode === "single" ? "src" : "apps/web/src";
        const root = createTemporaryWorkspace("ghostinit-dashboard-shell-");
        roots.push(root);
        const transaction = new FsTransaction(root);
        for (const file of files) await transaction.write(file.path, file.content);
        await transaction.commit();
        const report = await analyzeProjectReport(root);
        expect(report.findings).toEqual([]);
        expect(report.complete).toBe(true);
        expect(files.some((file) => file.path === `${sourceRoot}/app/page.tsx`)).toBe(true);
        const shell = files.filter(
          (file) =>
            file.path.startsWith(`${sourceRoot}/features/dashboard-shell/`) ||
            file.path.startsWith(`${sourceRoot}/components/shell/`),
        );
        if (!auth) expect(shell).toEqual([]);
        else {
          for (const path of [
            "queries.ts",
            "mutations.ts",
            "use-dashboard-navbar.ts",
            "dashboard-navbar.tsx",
          ])
            expect(
              shell.some((file) => file.path === `${sourceRoot}/features/dashboard-shell/${path}`),
              path,
            ).toBe(true);
          expect(
            shell.some((file) => file.path === `${sourceRoot}/components/shell/Navbar.tsx`),
          ).toBe(true);
        }
      }, 100_000);
    }
  }
});
