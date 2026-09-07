import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cloudflarePlan,
  createConvexFixture,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  readEvents,
  runFixture,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

const fixtures: RuntimeFixture[] = [];
const track = (fixture: RuntimeFixture): RuntimeFixture => (fixtures.push(fixture), fixture);
const output = (result: ReturnType<typeof runFixture>): string =>
  `${result.stdout}\n${result.stderr}`;

afterEach(() => {
  for (const fixture of fixtures.splice(0).reverse()) destroyFixture(fixture);
});

describe("Cloudflare case-insensitive secret classification", () => {
  for (const key of ["server_secret", "Server_SeCrEt", "vendor_Key"]) {
    test(`blocks a deployable artifact containing the local ${key} value`, () => {
      const secret = "case-variant-private-artifact-value";
      const fixture = track(
        createWorkerFixture({ artifactContent: secret, devVars: `${key}=${secret}\n` }),
      );
      appendFileSync(
        join(fixture.root, ".env.example"),
        `${key.toUpperCase()}=REPLACE_WITH_SECRET\n`,
      );

      const result = runFixture(fixture, ["deploy"]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toContain(`server-only value from ${key}`);
      expect(output(result)).not.toContain(secret);
      expect(readEvents(fixture.root).some(({ action }) => action === "deploy")).toBe(false);
      expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(`${key}=${secret}\n`);
    });
  }

  for (const key of ["next_public_SECRET", "vendor_publishable_SECRET"]) {
    test(`retains the public classification for ${key}`, () => {
      const publicValue = "case-variant-public-artifact-value";
      const fixture = track(
        createWorkerFixture({
          artifactContent: publicValue,
          devVars: `${key}=${publicValue}\n`,
        }),
      );
      appendFileSync(
        join(fixture.root, ".env.example"),
        `${key.toUpperCase()}=REPLACE_WITH_PUBLIC_VALUE\n`,
      );

      const result = runFixture(fixture, ["dry-run"]);
      expect(result.status, output(result)).toBe(0);
    });
  }
});

describe("Convex bootstrap output ownership", () => {
  const filesystemImport = /^import \{ [^\n]+ \} from "node:fs";$/m;

  for (const replacement of ["changed-content", "identical-content"] as const) {
    test(`preserves ${replacement} replacement after its first cleanup guard rejects it`, () => {
      const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
      const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
      const injectedFilesystem = [
        "let replacedOutput = false;",
        "function renameSync(source, destination) {",
        "  const result = realRenameSync(source, destination);",
        '  if (!replacedOutput && String(source).endsWith(".dev.vars.ghostinit-prepared")) {',
        "    replacedOutput = true;",
        '    const original = readFileSync(".env.local", "utf8");',
        '    realRenameSync(".env.local", ".original-convex-output");',
        replacement === "identical-content"
          ? '    writeFileSync(".env.local", original);'
          : '    writeFileSync(".env.local", readFileSync(".replacement-env-content", "utf8"));',
        "  }",
        "  return result;",
        "}",
      ].join("\n");
      const instrumented = generated.replace(
        filesystemImport,
        (line) =>
          `${line.replace("renameSync,", "renameSync as realRenameSync,")}\n${injectedFilesystem}`,
      );
      expect(instrumented !== generated, "rename race injection must match the fs import").toBe(
        true,
      );
      const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
      writeFileSync(
        join(fixture.root, ".replacement-env-content"),
        "USER_SECRET=user-owned-replacement-value\n",
      );

      const result = runFixture(fixture, ["bootstrap"]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toContain(".env.local changed after Convex wrote it");
      expect(output(result)).not.toContain("user-owned-replacement-value");
      const expected =
        replacement === "identical-content"
          ? readFileSync(join(fixture.root, ".original-convex-output"), "utf8")
          : "USER_SECRET=user-owned-replacement-value\n";
      expect(readFileSync(join(fixture.root, ".env.local"), "utf8")).toBe(expected);
      const rootValues = readFileSync(join(fixture.root, ".dev.vars"), "utf8");
      expect(rootValues).toContain("CONVEX_DEPLOYMENT=dev:fixture-worker");
      expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(rootValues);
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
    });
  }

  for (const action of ["bootstrap", "dev"] as const) {
    test(`preserves a file replaced during a failed ${action} cleanup attempt`, () => {
      const plan = cloudflarePlan({ mode: "single", database: "convex" });
      const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
      const injectedFilesystem = [
        "let replacedOutput = false;",
        "function unlinkSync(path) {",
        '  if (!replacedOutput && String(path).endsWith(".env.local")) {',
        "    replacedOutput = true;",
        '    renameSync(path, ".original-convex-output");',
        '    writeFileSync(path, readFileSync(".replacement-env-content", "utf8"));',
        '    throw new Error("injected cleanup interruption");',
        "  }",
        "  return realUnlinkSync(path);",
        "}",
      ].join("\n");
      const instrumented = generated.replace(
        filesystemImport,
        (line) =>
          `${line.replace("unlinkSync,", "unlinkSync as realUnlinkSync,")}\n${injectedFilesystem}`,
      );
      expect(instrumented !== generated, "unlink race injection must match the fs import").toBe(
        true,
      );
      const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
      writeFileSync(
        join(fixture.root, ".replacement-env-content"),
        "USER_SECRET=user-owned-during-cleanup-value\n",
      );
      if (action === "dev") {
        writeFileSync(join(fixture.root, ".dev.vars"), "CONVEX_DEPLOYMENT=dev:fixture-worker\n");
        writeFileSync(join(fixture.root, ".delay-convex-dev"), "2000\n");
      }

      const result = runFixture(fixture, [action]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toContain("injected cleanup interruption");
      expect(output(result)).toContain(".env.local changed after Convex wrote it");
      expect(output(result)).not.toContain("user-owned-during-cleanup-value");
      expect(readFileSync(join(fixture.root, ".env.local"), "utf8")).toBe(
        "USER_SECRET=user-owned-during-cleanup-value\n",
      );
      expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toContain(
        "CONVEX_DEPLOYMENT=dev:fixture-worker",
      );
    });
  }
});

describe("Convex mirror transaction ownership", () => {
  const original =
    "CONVEX_DEPLOYMENT=dev:example-123\nBETTER_AUTH_SECRET=original-project-secret\n";
  const replacementValue = "USER_SECRET=concurrent-project-secret\n";
  const filesystemImport = /^import \{ [^\n]+ \} from "node:fs";$/m;

  function configuredFixture(source: string): RuntimeFixture {
    const fixture = track(createConvexFixture(source, "NEXT_PUBLIC_CONVEX_URL"));
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, "apps/web/.dev.vars"), original);
    writeFileSync(join(fixture.root, ".replacement-env-content"), replacementValue);
    return fixture;
  }

  for (const replacement of ["changed-content", "identical-content"] as const) {
    test(`preserves an installed ${replacement} replacement when the second mirror fails`, () => {
      const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
      const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
      const injectedFilesystem = [
        "let installedCount = 0;",
        "function renameSync(source, target) {",
        '  if (String(source).endsWith(".dev.vars.ghostinit-prepared")) {',
        '    if (++installedCount === 2) throw new Error("injected second mirror install failure");',
        "    const result = realRenameSync(source, target);",
        '    const installed = readFileSync(target, "utf8");',
        '    realRenameSync(target, ".installed-convex-output");',
        replacement === "identical-content"
          ? "    writeFileSync(target, installed);"
          : '    writeFileSync(target, readFileSync(".replacement-env-content", "utf8"));',
        "    return result;",
        "  }",
        "  return realRenameSync(source, target);",
        "}",
      ].join("\n");
      const instrumented = generated.replace(
        filesystemImport,
        (line) =>
          `${line.replace("renameSync,", "renameSync as realRenameSync,")}\n${injectedFilesystem}`,
      );
      expect(instrumented !== generated, "mirror race injection must match the fs import").toBe(
        true,
      );
      const fixture = configuredFixture(instrumented);

      const result = runFixture(fixture, ["bootstrap"]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toContain("injected second mirror install failure");
      expect(output(result)).toContain(
        "Installed Convex environment target changed during rollback",
      );
      expect(output(result)).toContain("explicit recovery pair");
      expect(output(result)).not.toContain("concurrent-project-secret");
      const expected =
        replacement === "identical-content"
          ? readFileSync(join(fixture.root, ".installed-convex-output"), "utf8")
          : replacementValue;
      expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(expected);
      expect(readFileSync(join(fixture.root, ".dev.vars.ghostinit-backup"), "utf8")).toBe(original);
      expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(original);
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    });
  }

  test("preserves a user edit made after source capture and before the backup move", () => {
    const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const injectedFilesystem = [
      "let changedSource = false;",
      "function writeFileSync(path, ...args) {",
      "  const result = realWriteFileSync(path, ...args);",
      '  if (!changedSource && String(path).endsWith(".dev.vars.ghostinit-prepared")) {',
      "    changedSource = true;",
      '    realWriteFileSync(".dev.vars", readFileSync(".replacement-env-content", "utf8"));',
      "  }",
      "  return result;",
      "}",
    ].join("\n");
    const instrumented = generated.replace(
      filesystemImport,
      (line) =>
        `${line.replace("writeFileSync }", "writeFileSync as realWriteFileSync }")}\n${injectedFilesystem}`,
    );
    expect(instrumented !== generated, "source race injection must match the fs import").toBe(true);
    const fixture = configuredFixture(instrumented);

    const result = runFixture(fixture, ["bootstrap"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("Convex environment target changed before backup");
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(replacementValue);
    expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-backup"))).toBe(false);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-prepared"))).toBe(false);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
  });
});
