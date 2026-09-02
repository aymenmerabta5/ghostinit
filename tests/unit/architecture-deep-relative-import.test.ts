import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture/index.js";

describe("deep relative application imports", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-deep-relative-"));
    json("package.json", {
      name: "fixture",
      private: true,
      workspaces: ["apps/*", "packages/*"],
    });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function file(path: string, content = "export const value = true;\n"): void {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  function json(path: string, value: unknown): void {
    file(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function packageFile(path: string, content: string): void {
    const [container, name] = path.split("/");
    if (container === "apps" && name) {
      json(`apps/${name}/package.json`, { name, private: true });
    }
    file(path, content);
  }

  test("rejects depth-three resolved imports inside generated application alias roots", async () => {
    packageFile(
      "apps/web/src/routes/admin/users/page.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file("apps/web/src/lib/value.ts");
    packageFile(
      "apps/desktop/src/renderer/routes/admin/users/page.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file("apps/desktop/src/renderer/lib/value.ts");
    packageFile(
      "apps/mobile/app/admin/users/page.ts",
      'import { value } from "../../../src/lib/value"; export { value };\n',
    );
    file("apps/mobile/src/lib/value.ts");
    packageFile(
      "apps/mobile/src/screens/admin/users/page.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file(
      "src/routes/admin/users/page.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file("src/lib/value.ts");

    const findings = (await analyzeProject(root)).filter(({ id }) => id === "deep-relative-import");

    expect(findings.map(({ file: path }) => path)).toEqual([
      "apps/desktop/src/renderer/routes/admin/users/page.ts",
      "apps/mobile/app/admin/users/page.ts",
      "apps/mobile/src/screens/admin/users/page.ts",
      "apps/web/src/routes/admin/users/page.ts",
      "src/routes/admin/users/page.ts",
    ]);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "HIGH",
          rule: "application-import-boundary",
          specifier: "../../../lib/value",
          line: 1,
          column: 1,
        }),
      ]),
    );
  });

  test("allows shallow, config, Eve, and cross-root relative imports", async () => {
    packageFile(
      "apps/web/src/routes/admin/page.ts",
      'import { value } from "../../lib/value"; export { value };\n',
    );
    file("apps/web/src/lib/value.ts");

    packageFile(
      "apps/web/e2e/deep/config/vitest.config.ts",
      'import { value } from "../../../src/config"; export { value };\n',
    );
    file("apps/web/src/config.ts");

    packageFile(
      "apps/web/src/routes/admin/users/page.ts",
      [
        'import { api } from "../../../../../../convex/_generated/api";',
        'import { kernel } from "../../../../../../packages/kernel/src/index";',
        'import { desktop } from "../../../../../../apps/desktop/src/renderer/index";',
        "export { api, kernel, desktop };",
      ].join("\n"),
    );
    file("convex/_generated/api.js", "export const api = true;\n");
    json("packages/kernel/package.json", { name: "@repo/kernel", private: true });
    file("packages/kernel/src/index.ts", "export const kernel = true;\n");
    packageFile("apps/desktop/src/renderer/index.ts", "export const desktop = true;\n");
    file("apps/desktop/src/main/tool.ts", "export const main = true;\n");
    packageFile(
      "apps/desktop/src/renderer/routes/a/b/c.ts",
      'import { main } from "../../../../main/tool"; export { main };\n',
    );

    packageFile(
      "apps/eve/agent/a/b/c/task.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file("apps/eve/agent/lib/value.ts");
    packageFile(
      "apps/mobile/app/a/b/c/page.ts",
      'import { value } from "../../../shared/value"; export { value };\n',
    );
    file("apps/mobile/app/shared/value.ts");
    file(
      "app/api/webhooks/stripe.ts",
      'import { api } from "../../../convex/_generated/api"; export { api };\n',
    );
    file(
      "src/routes/a/b/page.ts",
      'import { api } from "../../../../convex/_generated/api"; export { api };\n',
    );
    json("packages/feature/package.json", { name: "@repo/feature", private: true });
    file(
      "packages/feature/src/routes/admin/users/page.ts",
      'import { value } from "../../../lib/value"; export { value };\n',
    );
    file("packages/feature/src/lib/value.ts");

    const findings = await analyzeProject(root);
    expect(findings.filter(({ id }) => id === "deep-relative-import")).toEqual([]);
    expect(findings.filter(({ id }) => id === "unresolved-owned-import")).toEqual([]);
  });

  test("leaves an unresolved same-domain import to the resolution blocker", async () => {
    packageFile(
      "apps/web/src/routes/admin/users/page.ts",
      'import { missing } from "../../../lib/missing"; export { missing };\n',
    );

    const findings = await analyzeProject(root);
    expect(findings.filter(({ id }) => id === "deep-relative-import")).toEqual([]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        id: "unresolved-owned-import",
        file: "apps/web/src/routes/admin/users/page.ts",
        specifier: "../../../lib/missing",
      }),
    );
  });
});
