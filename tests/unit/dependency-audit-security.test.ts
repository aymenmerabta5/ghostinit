import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { runtime, supplyChain } from "../../packages/versions/src/index.js";
import type { DependencySecurityRunOptions } from "../../src/lib/dependency-security/runtime-types.js";
import {
  createReviewedImageSizeAuditFixture,
  reviewedImageSizeFixtureRoot,
} from "../helpers/reviewed-image-size-fixture.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { dependencySecurityPolicy } from "../../src/templates/tooling/dependency-security-policy.js";
import {
  dependencySecurityFiles,
  dependencySecurityLauncherContent,
} from "../../src/templates/tooling/dependency-security.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  dependencyAuditScriptContent,
  integrateDependencyAuditManifest,
  IMAGE_SIZE_PATCH_GITATTRIBUTES,
  IMAGE_SIZE_PATCH_CONTENT,
  IMAGE_SIZE_PATCH_KEY,
  IMAGE_SIZE_PATCH_PATH,
  IMAGE_SIZE_PATCH_SHA256,
  BRACES_PATCH_ADVISORIES,
  BRACES_PATCH_CONTENT,
  BRACES_PATCH_KEY,
  BRACES_PATCH_PATH,
  BRACES_PATCH_SHA256,
  HTTP_CACHE_SEMANTICS_PATCH_ADVISORIES,
  HTTP_CACHE_SEMANTICS_PATCH_CONTENT,
  HTTP_CACHE_SEMANTICS_PATCH_KEY,
  HTTP_CACHE_SEMANTICS_PATCH_PATH,
  HTTP_CACHE_SEMANTICS_PATCH_SHA256,
  NODE_FORGE_PATCH_ADVISORIES,
  NODE_FORGE_PATCH_CONTENT,
  NODE_FORGE_PATCH_KEY,
  NODE_FORGE_PATCH_PATH,
  NODE_FORGE_PATCH_SHA256,
} from "../../src/templates/tooling/dependency-audit.js";
import { generatedGitattributesContent } from "../../src/templates/gitignore.js";
import {
  OPENNEXT_AWS_WINDOWS_PATCH_KEY,
  OPENNEXT_AWS_WINDOWS_PATCH_PATH,
} from "../../src/templates/root/cloudflare.js";

const root = resolve(import.meta.dir, "../..");
const fixtureRoot = resolve(root, "tests/fixtures/compatibility/expo-uniwind-rnr");
const bunV2FixtureRoot = resolve(root, "tests/fixtures/compatibility/next-tailwind-biome");
const reviewedPatchDigest = "7805ea36efb396516b71b6965774b03c7df465bdda1489b937dc19d3bde8a7d8";
const reviewedInstalledDigests = [
  "ea073da10e66839d1f989dd62775312f85ba53e3d6b37476bce477f25da4e82f",
  "6786c3d52ea46fab31d0d7883c16041f15a1604356bd0f139c1b2adc261234c1",
] as const;
const reviewedAdvisories = [
  "GHSA-5p2g-fcmc-qvqq",
  "GHSA-86w9-cpqp-85rv",
  "GHSA-ch52-4w7c-c8xp",
  "GHSA-vfj7-8cjw-p6xm",
  "GHSA-w3rx-r6r6-pgpr",
] as const;

function normalizeCheckoutLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function generated(mode: "monorepo" | "single", mobile: boolean) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `${mode}-${mobile ? "mobile" : "web"}`,
      runtime: "bun",
      version: "0.1.0",
      mode,
      billing: [],
      features: [],
      database: "postgres",
      framework: "nextjs",
      apps: mobile ? ["web", "mobile"] : ["web"],
    }),
    { dryRun: true },
  );
}

function removeTemporaryDirectory(path: string): void {
  const base = realpathSync.native(resolve(tmpdir()));
  const target = realpathSync.native(resolve(path));
  const descendant = relative(base, target);
  if (
    descendant.length === 0 ||
    descendant === ".." ||
    descendant.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(descendant)
  ) {
    throw new Error(`Refusing to remove unsafe TypeScript fixture path: ${target}`);
  }
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function environmentWithTemporaryAlias(directory: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (["TEMP", "TMP", "TMPDIR"].includes(key.toUpperCase())) delete environment[key];
  }
  return { ...environment, TEMP: directory, TMP: directory, TMPDIR: directory };
}

function dependencyAuditWithMockedBunAudit(
  hasImageSizePatch: boolean,
  spawnResultExpression: string,
): string {
  const importMarker = 'import { spawnSync } from "node:child_process";';
  const source = dependencyAuditScriptContent(hasImageSizePatch);
  if (source.split(importMarker).length !== 2) {
    throw new Error("Generated dependency audit spawn import changed unexpectedly");
  }
  return source.replace(
    importMarker,
    `const spawnSync = (..._arguments: unknown[]) => (${spawnResultExpression});`,
  );
}

function runFixtureAuditWithMockedBunAudit(
  spawnResultExpression: string,
  changeInstalledPackage?: (installedRoot: string) => void,
) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-audit-advisory-"));
  try {
    const installedRoot = createReviewedImageSizeAuditFixture(temporaryRoot);
    changeInstalledPackage?.(installedRoot);
    const script = resolve(temporaryRoot, "audit-dependencies.ts");
    writeFileSync(script, dependencyAuditWithMockedBunAudit(true, spawnResultExpression));
    return spawnSync(process.execPath, [script], {
      cwd: temporaryRoot,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });
  } finally {
    removeTemporaryDirectory(temporaryRoot);
  }
}

function mockedAdvisoryResult(report: Record<string, unknown>, status = 1): string {
  return JSON.stringify({
    error: null,
    status,
    signal: null,
    stdout: JSON.stringify(report),
    stderr: "",
  });
}

describe("reviewed image-size advisory containment", () => {
  test("pins the reviewed patch bytes and installed-file digests", () => {
    const fixturePatch = readFileSync(resolve(fixtureRoot, IMAGE_SIZE_PATCH_PATH), "utf8");
    const digest = createHash("sha256").update(IMAGE_SIZE_PATCH_CONTENT).digest("hex");

    expect(IMAGE_SIZE_PATCH_SHA256).toBe(reviewedPatchDigest);
    expect(digest).toBe(reviewedPatchDigest);
    expect(fixturePatch).toBe(IMAGE_SIZE_PATCH_CONTENT);
    const audit = dependencyAuditScriptContent(true);
    for (const installedDigest of reviewedInstalledDigests)
      expect(audit).toContain(installedDigest);
    for (const [index, fixtureName] of ["icns.js.fixture", "utils.js.fixture"].entries()) {
      const bytes = readFileSync(resolve(reviewedImageSizeFixtureRoot, fixtureName));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        reviewedInstalledDigests[index],
      );
    }
  });

  test("pins the reviewed braces and node-forge patch bytes and installed-file digests", () => {
    const auditFixtureRoot = resolve(root, "tests/fixtures/dependency-audit");
    for (const [key, path, content, sha, files] of [
      [
        BRACES_PATCH_KEY,
        BRACES_PATCH_PATH,
        BRACES_PATCH_CONTENT,
        BRACES_PATCH_SHA256,
        [
          ["lib/compile.js", "a71354e4a311c711e88b814ccf9f67055999a1740fe3280a16e3ae4e7944160d"],
          ["lib/expand.js", "e7e8585cac782c5ec279597c590d104384822f6a7efe35c7099f533401095953"],
          ["lib/stringify.js", "0092609fb84653bbbef555721b57b6c067db87393fa1b1721584252301506dbf"],
        ],
      ],
      [
        NODE_FORGE_PATCH_KEY,
        NODE_FORGE_PATCH_PATH,
        NODE_FORGE_PATCH_CONTENT,
        NODE_FORGE_PATCH_SHA256,
        [["lib/rsa.js", "8010ab4231d66004e1c190af1ddeb28d4185f6e45d08df4a45436c7676aa07da"]],
      ],
    ] as const) {
      const fixturePatch = readFileSync(resolve(fixtureRoot, path), "utf8");
      expect(createHash("sha256").update(content).digest("hex")).toBe(sha);
      expect(fixturePatch).toBe(content);
      expect(fixturePatch).not.toContain("\r");
      const audit = dependencyAuditScriptContent(true, false, true);
      for (const [, digest] of files) expect(audit).toContain(digest);
      // Installed-file bytes are asserted from install-independent fixtures so
      // this test passes before any fixture node_modules tree exists.
      const packageName = key.slice(0, key.indexOf("@"));
      const packageVersion = key.slice(key.indexOf("@") + 1);
      const provenance = JSON.parse(
        readFileSync(
          resolve(auditFixtureRoot, `${packageName}-${packageVersion}`, "provenance.json"),
          "utf8",
        ),
      ) as { files: Array<{ path: string; patchedSha256: string }> };
      for (const [file, digest] of files) {
        const fixtureName = `${file.slice(file.lastIndexOf("/") + 1)}.fixture`;
        const bytes = readFileSync(
          resolve(auditFixtureRoot, `${packageName}-${packageVersion}`, fixtureName),
        );
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
        expect(
          provenance.files.find((entry) => entry.path === file)?.patchedSha256,
          `${packageName}-${packageVersion}:${file}`,
        ).toBe(digest);
      }
    }
    expect([...BRACES_PATCH_ADVISORIES]).toEqual(["GHSA-vfj7-8cjw-p6xm"]);
    expect([...NODE_FORGE_PATCH_ADVISORIES]).toEqual(["GHSA-86w9-cpqp-85rv"]);
  });

  test("pins the reviewed http-cache-semantics patch bytes", () => {
    expect(createHash("sha256").update(HTTP_CACHE_SEMANTICS_PATCH_CONTENT).digest("hex")).toBe(
      HTTP_CACHE_SEMANTICS_PATCH_SHA256,
    );
    expect(HTTP_CACHE_SEMANTICS_PATCH_SHA256).toBe(
      "da0f0c3f67d4f57af1368ae196c2755a97daf6c743dd983b789d9e78844af24c",
    );
    expect(HTTP_CACHE_SEMANTICS_PATCH_CONTENT).not.toContain("\r");
    // The backport carries upstream's Vary hardening and status propagation.
    expect(HTTP_CACHE_SEMANTICS_PATCH_CONTENT).toContain("if (name === '*') {");
    expect(HTTP_CACHE_SEMANTICS_PATCH_CONTENT).toContain("status: this._status,");
    expect([...HTTP_CACHE_SEMANTICS_PATCH_ADVISORIES]).toEqual(["GHSA-ch52-4w7c-c8xp"]);
    const audit = dependencyAuditScriptContent(false, false, false, true);
    expect(audit).toContain("ede1cc404a492fa348eb9d97a3007a0d72aa717bd22cd86a56bd0824c19729ca");
    expect(audit).toContain(
      "if (HAS_ELECTRON_TOOLCHAIN_PATCHES) verifyHttpCacheSemanticsPatchInstalled(root, manifest);",
    );
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} desktop emits the http-cache-semantics patch without mobile patches`, () => {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: `${mode}-desktop`,
          runtime: "bun",
          version: "0.1.0",
          mode,
          billing: [],
          features: [],
          database: "postgres",
          framework: "nextjs",
          apps: ["web", "desktop"],
        }),
        { dryRun: true },
      );
      const byPath = new Map(files.map((file) => [file.path, file.content]));
      const manifest = JSON.parse(byPath.get("package.json") ?? "{}") as {
        patchedDependencies?: Record<string, string>;
        overrides?: Record<string, string>;
      };
      expect(manifest.patchedDependencies?.[HTTP_CACHE_SEMANTICS_PATCH_KEY]).toBe(
        HTTP_CACHE_SEMANTICS_PATCH_PATH,
      );
      expect(byPath.get(HTTP_CACHE_SEMANTICS_PATCH_PATH)).toBe(HTTP_CACHE_SEMANTICS_PATCH_CONTENT);
      expect(manifest.overrides?.["http-cache-semantics"]).toBe("4.2.0");
      expect(manifest.overrides?.["undici"]).toBeUndefined();
      expect(manifest.patchedDependencies?.[IMAGE_SIZE_PATCH_KEY]).toBeUndefined();
      expect(byPath.has(IMAGE_SIZE_PATCH_PATH)).toBe(false);
      expect(manifest.patchedDependencies?.[BRACES_PATCH_KEY]).toBeUndefined();
      expect(byPath.has(BRACES_PATCH_PATH)).toBe(false);
      expect(manifest.patchedDependencies?.[NODE_FORGE_PATCH_KEY]).toBeUndefined();
      expect(byPath.has(NODE_FORGE_PATCH_PATH)).toBe(false);
      expect(byPath.get("scripts/audit-dependencies.ts")).toBe(
        dependencyAuditScriptContent(false, false, false, true),
      );
    });
  }

  test("accepts both Bun 1.4 text-lock versions and rejects unreviewed versions", () => {
    const fixtureV1 = Bun.JSONC.parse(readFileSync(resolve(fixtureRoot, "bun.lock"), "utf8")) as {
      lockfileVersion?: unknown;
    };
    const fixtureV2 = Bun.JSONC.parse(
      readFileSync(resolve(bunV2FixtureRoot, "bun.lock"), "utf8"),
    ) as {
      lockfileVersion?: unknown;
    };
    const audit = dependencyAuditScriptContent(true);

    expect(fixtureV1.lockfileVersion).toBe(1);
    expect(fixtureV2.lockfileVersion).toBe(2);
    expect(audit).toContain("SUPPORTED_BUN_LOCKFILE_VERSIONS = new Set<number>([1, 2])");
    expect(audit).toContain("!SUPPORTED_BUN_LOCKFILE_VERSIONS.has(lock.lockfileVersion)");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const mobile of [false, true]) {
      test(`${mode} ${mobile ? "with" : "without"} mobile emits the correct audit contract`, () => {
        const files = generated(mode, mobile);
        const byPath = new Map(files.map((file) => [file.path, file.content]));
        const manifest = JSON.parse(byPath.get("package.json") ?? "{}") as {
          scripts?: Record<string, string>;
          patchedDependencies?: Record<string, string>;
        };

        expect(manifest.scripts?.["audit:dependencies"]).toBe("bun scripts/audit-dependencies.ts");
        expect(manifest.scripts?.preinstall).toBe("bun scripts/audit-dependencies.ts --lock-only");
        expect(manifest.scripts?.["install:verified"]).toBe(
          "bun scripts/security-dependencies.cjs install",
        );
        expect(manifest.scripts?.["install:bootstrap"]).toBe(
          "bun scripts/security-dependencies.cjs install --bootstrap",
        );
        expect(byPath.get("scripts/audit-dependencies.ts")).toBe(
          dependencyAuditScriptContent(mobile, false, mobile),
        );
        expect(byPath.get("bunfig.toml")).toContain('registry = "https://registry.npmjs.org/"');
        const workflow = byPath.get(".github/workflows/ci.yml") ?? "";
        expect(workflow).toContain("bun run audit:dependencies");
        expect(workflow.indexOf("bun run audit:lock")).toBeLessThan(
          workflow.indexOf("bun install --frozen-lockfile"),
        );
        expect(byPath.get("README.md")).toContain("bun run install:bootstrap");
        expect(byPath.get("AGENTS.md")).toContain("bun run install:verified");
        if (mobile) {
          expect(manifest.patchedDependencies?.[IMAGE_SIZE_PATCH_KEY]).toBe(IMAGE_SIZE_PATCH_PATH);
          expect(byPath.get(IMAGE_SIZE_PATCH_PATH)).toBe(IMAGE_SIZE_PATCH_CONTENT);
          expect(manifest.patchedDependencies?.[BRACES_PATCH_KEY]).toBe(BRACES_PATCH_PATH);
          expect(byPath.get(BRACES_PATCH_PATH)).toBe(BRACES_PATCH_CONTENT);
          expect(manifest.patchedDependencies?.[NODE_FORGE_PATCH_KEY]).toBe(NODE_FORGE_PATCH_PATH);
          expect(byPath.get(NODE_FORGE_PATCH_PATH)).toBe(NODE_FORGE_PATCH_CONTENT);
          expect(byPath.get(".gitattributes")).toBe(IMAGE_SIZE_PATCH_GITATTRIBUTES);
        } else {
          expect(manifest.patchedDependencies?.[IMAGE_SIZE_PATCH_KEY]).toBeUndefined();
          expect(byPath.has(IMAGE_SIZE_PATCH_PATH)).toBe(false);
          expect(manifest.patchedDependencies?.[BRACES_PATCH_KEY]).toBeUndefined();
          expect(byPath.has(BRACES_PATCH_PATH)).toBe(false);
          expect(manifest.patchedDependencies?.[NODE_FORGE_PATCH_KEY]).toBeUndefined();
          expect(byPath.has(NODE_FORGE_PATCH_PATH)).toBe(false);
          expect(byPath.get(".gitattributes")).toBe(generatedGitattributesContent(false));
        }
        expect(manifest.patchedDependencies?.[HTTP_CACHE_SEMANTICS_PATCH_KEY]).toBeUndefined();
        expect(byPath.has(HTTP_CACHE_SEMANTICS_PATCH_PATH)).toBe(false);
      });
    }
  }

  test("fails closed around advisories, lock binding, unknown severity, and every installation", () => {
    const audit = dependencyAuditScriptContent(true);
    const ids = [...audit.matchAll(/"(GHSA-[a-z0-9-]+)"/g)].map((match) => match[1]).sort();

    expect(ids).toEqual([...reviewedAdvisories]);
    for (const id of reviewedAdvisories) {
      expect(audit).toContain(`["${id}", "https://github.com/advisories/${id}"]`);
    }
    expect(audit).toContain(
      "if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatchInstalled(root, manifest);",
    );
    expect(audit).toContain("REVIEWED_ADVISORIES.get(id) === entry.url");
    expect(audit).toContain('rank === undefined || severity === "unknown"');
    expect(audit).toContain("result.status !== 0 && result.status !== 1");
    expect(audit).toContain('JSON.parse(String(result.stdout ?? ""))');
    expect(audit).toContain("timeout: ADVISORY_AUDIT_ATTEMPT_TIMEOUT_MS");
    expect(audit).toContain('code !== "ETIMEDOUT"');
    expect(audit).toContain("ADVISORY_AUDIT_MAX_ATTEMPTS = 3");
    expect(audit).toContain("bun audit failed after ");
    expect(audit).not.toContain('"--audit-level=high"');
    expect(audit).not.toContain('"--ignore="');
    expect(audit).toContain("bun.lock does not bind the reviewed image-size patch");
    expect(audit).toContain("JSON.parse(normalizedJsonc(tokens))");
    expect(audit).toContain("assertNoDuplicateJsoncKeys(tokens)");
    expect(audit).toContain("resolution !== PATCH_KEY");
    expect(audit).not.toContain("lock.includes(lockPatchBinding)");
    expect(audit).toContain("workspaceRoots(root, manifest)");
    expect(audit).toContain('const nested = join(location.root, "node_modules")');
    expect(audit).toContain('installedPackages(root, manifest, "image-size")');
    expect(audit).toContain("resolveContained(projectRoot, path, label)");
    expect(audit).toContain("lstatSync(path).isFile()");
    expect(audit).toContain("the installed image-size patch was not applied exactly");
    expect(
      audit.indexOf("if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatchInstalled(root, manifest);"),
    ).toBeLessThan(audit.indexOf("const parsedReport = await bunAuditReport(root);"));
    expect(audit).toContain("const registryPackages = lockedRegistryPackages(lock)");
    expect(audit).toContain('.filter(({ name }) => name === "image-size")');
    expect(audit).toContain("integrity does not attest bun.lock");
    expect(audit).toContain("bun.lock integrity does not match the public npm registry");
  });

  test("uses one bounded JSON advisory pass and locally allows only exactly reviewed patched findings", () => {
    const reviewedReport = {
      "image-size": reviewedAdvisories.map((id) => ({
        severity: "high",
        url: `https://github.com/advisories/${id}`,
      })),
    };
    const accepted = runFixtureAuditWithMockedBunAudit(mockedAdvisoryResult(reviewedReport));
    expect(accepted.status, `${accepted.stdout}\n${accepted.stderr}`).toBe(0);
    expect(`${accepted.stdout}\n${accepted.stderr}`).toContain(
      "Dependency audit passed with 5 exactly patched advisories",
    );

    const unreviewed = runFixtureAuditWithMockedBunAudit(
      mockedAdvisoryResult({
        ...reviewedReport,
        "unreviewed-package": [
          {
            severity: "critical",
            url: "https://github.com/advisories/GHSA-1111-2222-3333",
          },
        ],
      }),
    );
    expect(unreviewed.status).toBe(1);
    expect(`${unreviewed.stdout}\n${unreviewed.stderr}`).toContain(
      "unreviewed HIGH/CRITICAL advisories: unreviewed-package:GHSA-1111-2222-3333:critical",
    );

    const timedOut = runFixtureAuditWithMockedBunAudit(
      '{ error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }), status: null, signal: "SIGTERM", stdout: "", stderr: "" }',
    );
    expect(timedOut.status).toBe(1);
    expect(`${timedOut.stdout}\n${timedOut.stderr}`).toContain(
      "bun audit failed after 3 attempts: timed out after 60000ms",
    );
    expect(`${timedOut.stdout}\n${timedOut.stderr}`).not.toContain(
      "unreviewed HIGH/CRITICAL advisories",
    );

    const emptyFailure = runFixtureAuditWithMockedBunAudit(mockedAdvisoryResult({}, 1));
    expect(emptyFailure.status).toBe(1);
    expect(`${emptyFailure.stdout}\n${emptyFailure.stderr}`).toContain(
      "bun audit failed after 3 attempts: returned an invalid advisory report",
    );
  });

  test("rejects missing and tampered reviewed bytes before accepting an advisory pass", () => {
    for (const file of ["icns.js", "utils.js"]) {
      const missing = runFixtureAuditWithMockedBunAudit(mockedAdvisoryResult({}, 0), (root) => {
        rmSync(resolve(root, "dist/types", file));
      });
      expect(missing.status).toBe(1);
      expect(`${missing.stdout}\n${missing.stderr}`).toContain(
        `installed image-size file dist/types/${file}`,
      );
      expect(`${missing.stdout}\n${missing.stderr}`).not.toContain("Dependency audit passed");

      const tampered = runFixtureAuditWithMockedBunAudit(mockedAdvisoryResult({}, 0), (root) => {
        writeFileSync(resolve(root, "dist/types", file), "// tampered fixture\n");
      });
      expect(tampered.status).toBe(1);
      expect(`${tampered.stdout}\n${tampered.stderr}`).toContain(
        `the installed image-size patch was not applied exactly: dist/types/${file}`,
      );
      expect(`${tampered.stdout}\n${tampered.stderr}`).not.toContain("Dependency audit passed");
    }
  });

  test("bootstraps a fresh lock without lifecycle scripts, then enforces evidence before lifecycle", async () => {
    const temporaryRoot = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ghostinit-audit-bootstrap-")),
    );
    const temporaryAliasRoot = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ghostinit-audit-temp-alias-")),
    );
    try {
      const temporaryTarget = resolve(temporaryAliasRoot, "target");
      const temporaryAlias = resolve(temporaryAliasRoot, "alias");
      mkdirSync(temporaryTarget);
      symlinkSync(
        temporaryTarget,
        temporaryAlias,
        process.platform === "win32" ? "junction" : "dir",
      );
      mkdirSync(resolve(temporaryRoot, "scripts"), { recursive: true });
      mkdirSync(resolve(temporaryRoot, "packages/local"), { recursive: true });
      writeFileSync(
        resolve(temporaryRoot, "packages/local/package.json"),
        '{"name":"@fixture/local","version":"1.0.0"}\n',
      );
      const integrated = integrateDependencyAuditManifest(
        {
          path: "package.json",
          content: `${JSON.stringify(
            {
              name: "ghostinit-audit-bootstrap",
              version: "1.0.0",
              private: true,
              workspaces: ["packages/*"],
              dependencies: { "@fixture/local": "workspace:*" },
              scripts: {
                postinstall: "bun scripts/assert-attested-lifecycle.ts",
              },
            },
            null,
            2,
          )}\n`,
        },
        false,
      );
      writeFileSync(resolve(temporaryRoot, "package.json"), integrated.content);
      writeFileSync(
        resolve(temporaryRoot, "bunfig.toml"),
        [
          "[install]",
          'registry = "https://registry.npmjs.org/"',
          "minimumReleaseAge = 604800",
          "minimumReleaseAgeExcludes = []",
          "",
          "[install.lockfile]",
          'path = "bun.lock"',
          "",
        ].join("\n"),
      );
      writeFileSync(
        resolve(temporaryRoot, "scripts/audit-dependencies.ts"),
        dependencyAuditWithMockedBunAudit(false, mockedAdvisoryResult({}, 0)),
      );
      writeFileSync(
        resolve(temporaryRoot, "scripts/assert-attested-lifecycle.ts"),
        [
          'import { existsSync, writeFileSync } from "node:fs";',
          'if (!existsSync("bun.lock") || !existsSync("dependency-lock-evidence.json")) process.exit(91);',
          'writeFileSync("lifecycle-attested", "ok\\n");',
          "",
        ].join("\n"),
      );

      const securityTransaction = new FsTransaction(temporaryRoot);
      for (const file of dependencySecurityFiles(false)) {
        await securityTransaction.write(
          file.path,
          file.path === "scripts/security-dependencies.cjs"
            ? dependencySecurityLauncherContent({
                ...dependencySecurityPolicy(false),
                auditScriptContent: dependencyAuditWithMockedBunAudit(
                  false,
                  mockedAdvisoryResult({}, 0),
                ),
              })
            : file.content,
        );
      }
      expect(securityTransaction.getStagedFiles()).toHaveLength(3);
      await securityTransaction.commit();

      expect(existsSync(resolve(temporaryRoot, "bun.lock"))).toBe(false);
      const bootstrap = spawnSync(process.execPath, ["run", "install:bootstrap"], {
        cwd: temporaryRoot,
        encoding: "utf8",
        env: environmentWithTemporaryAlias(temporaryAlias),
        timeout: 180_000,
        windowsHide: true,
      });
      expect(
        bootstrap.status,
        `Fresh bootstrap failed:\n${bootstrap.stdout}\n${bootstrap.stderr}`,
      ).toBe(0);
      expect(existsSync(resolve(temporaryRoot, "bun.lock"))).toBe(true);
      expect(existsSync(resolve(temporaryRoot, "dependency-lock-evidence.json"))).toBe(true);
      expect(readFileSync(resolve(temporaryRoot, "lifecycle-attested"), "utf8")).toBe("ok\n");
      const refreshed = spawnSync(process.execPath, ["run", "audit:lock:refresh"], {
        cwd: temporaryRoot,
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: true,
      });
      expect(
        refreshed.status,
        `Existing evidence refresh failed:\n${refreshed.stdout}\n${refreshed.stderr}`,
      ).toBe(0);

      rmSync(resolve(temporaryRoot, "lifecycle-attested"));
      const evidencePath = resolve(temporaryRoot, "dependency-lock-evidence.json");
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { lockSha256: string };
      evidence.lockSha256 = "0".repeat(64);
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
      const blocked = spawnSync(process.execPath, ["install", "--frozen-lockfile"], {
        cwd: temporaryRoot,
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: true,
      });
      expect(blocked.status).not.toBe(0);
      expect(`${blocked.stdout}\n${blocked.stderr}`).toContain(
        "dependency-lock-evidence.json does not attest the current bun.lock",
      );
      expect(existsSync(resolve(temporaryRoot, "lifecycle-attested"))).toBe(false);
    } finally {
      removeTemporaryDirectory(temporaryRoot);
      removeTemporaryDirectory(temporaryAliasRoot);
    }
  });

  test("retries transient registry HTTP and malformed JSON failures before attesting a lock", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-audit-registry-retry-"));
    const integrity =
      "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    try {
      mkdirSync(resolve(temporaryRoot, "scripts"), { recursive: true });
      writeFileSync(resolve(temporaryRoot, "package.json"), '{"private":true}\n');
      writeFileSync(
        resolve(temporaryRoot, "bunfig.toml"),
        '[install]\nregistry = "https://registry.npmjs.org/"\nminimumReleaseAge = 604800\nminimumReleaseAgeExcludes = []\n[install.lockfile]\npath = "bun.lock"\n',
      );
      writeFileSync(
        resolve(temporaryRoot, "bun.lock"),
        `${JSON.stringify({
          lockfileVersion: 2,
          workspaces: {},
          packages: { package: ["package@1.0.0", "", {}, integrity] },
        })}\n`,
      );
      const registryDocument = JSON.stringify({
        name: "package",
        time: { "1.0.0": "2020-01-01T00:00:00.000Z" },
        versions: { "1.0.0": { dist: { integrity } } },
      });
      const runtimeMarker =
        "const bunRuntime = (globalThis as typeof globalThis & { readonly Bun?: BunRuntime }).Bun;";
      const withFetchMock = (body: string): string => {
        const source = dependencyAuditScriptContent(false);
        if (source.split(runtimeMarker).length !== 2) {
          throw new Error("Generated dependency audit runtime marker changed unexpectedly");
        }
        return source.replace(runtimeMarker, `${body}\n${runtimeMarker}`);
      };
      const scriptPath = resolve(temporaryRoot, "scripts/audit-dependencies.ts");
      writeFileSync(
        scriptPath,
        withFetchMock(`
let registryAttempt = 0;
const fetch = async () => {
  registryAttempt += 1;
  if (registryAttempt === 1) return new Response("busy", { status: 503 });
  if (registryAttempt === 2) return new Response("{", { status: 200 });
  return new Response(${JSON.stringify(registryDocument)}, { status: 200 });
};`),
      );
      const recovered = spawnSync(
        process.execPath,
        ["scripts/audit-dependencies.ts", "--refresh-lock-evidence"],
        {
          cwd: temporaryRoot,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
        },
      );
      expect(recovered.status, `${recovered.stdout}\n${recovered.stderr}`).toBe(0);
      expect(existsSync(resolve(temporaryRoot, "dependency-lock-evidence.json"))).toBe(true);

      writeFileSync(
        scriptPath,
        withFetchMock('const fetch = async () => new Response("{", { status: 200 });'),
      );
      const exhausted = spawnSync(
        process.execPath,
        ["scripts/audit-dependencies.ts", "--refresh-lock-evidence"],
        {
          cwd: temporaryRoot,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
        },
      );
      expect(exhausted.status).toBe(1);
      expect(`${exhausted.stdout}\n${exhausted.stderr}`).toContain(
        "npm publication metadata failed after 3 attempts for package: response body was malformed or truncated JSON",
      );
    } finally {
      removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("every malformed lock package record fails before reviewed patch filtering", () => {
    for (const [label, audit] of [
      ["image-size", dependencyAuditScriptContent(true, false)],
      ["OpenNext", dependencyAuditScriptContent(false, true)],
    ] as const) {
      const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-audit-malformed-"));
      try {
        mkdirSync(resolve(temporaryRoot, "scripts"), { recursive: true });
        writeFileSync(resolve(temporaryRoot, "scripts/audit-dependencies.ts"), audit);
        writeFileSync(
          resolve(temporaryRoot, "package.json"),
          `${JSON.stringify({
            patchedDependencies: {
              [IMAGE_SIZE_PATCH_KEY]: IMAGE_SIZE_PATCH_PATH,
              [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH,
            },
          })}\n`,
        );
        writeFileSync(
          resolve(temporaryRoot, "bunfig.toml"),
          '[install]\nregistry = "https://registry.npmjs.org/"\nminimumReleaseAge = 604800\nminimumReleaseAgeExcludes = []\n[install.lockfile]\npath = "bun.lock"\n',
        );
        writeFileSync(
          resolve(temporaryRoot, "bun.lock"),
          `${JSON.stringify({
            lockfileVersion: 2,
            patchedDependencies: {
              [IMAGE_SIZE_PATCH_KEY]: IMAGE_SIZE_PATCH_PATH,
              [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH,
            },
            workspaces: {},
            packages: {
              reviewed: [
                label === "image-size" ? IMAGE_SIZE_PATCH_KEY : OPENNEXT_AWS_WINDOWS_PATCH_KEY,
                "",
                {},
                "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
              ],
              "unrelated-malformed-record": { resolution: "ignored-by-unsafe-filter" },
            },
          })}\n`,
        );
        const result = spawnSync(
          process.execPath,
          ["scripts/audit-dependencies.ts", "--lock-only"],
          {
            cwd: temporaryRoot,
            encoding: "utf8",
            timeout: 30_000,
            windowsHide: true,
          },
        );
        expect(result.status, label).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`, label).toContain(
          "bun.lock contains an invalid package record: unrelated-malformed-record",
        );
      } finally {
        removeTemporaryDirectory(temporaryRoot);
      }
    }
  });

  test("committed evidence binds each lock tuple to the reviewed public-registry integrity", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-audit-integrity-"));
    const integrityA =
      "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    const integrityB =
      "sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==";
    try {
      mkdirSync(resolve(temporaryRoot, "scripts"), { recursive: true });
      writeFileSync(
        resolve(temporaryRoot, "scripts/audit-dependencies.ts"),
        dependencyAuditScriptContent(false),
      );
      writeFileSync(resolve(temporaryRoot, "package.json"), '{"private":true}\n');
      writeFileSync(
        resolve(temporaryRoot, "bunfig.toml"),
        '[install]\nregistry = "https://registry.npmjs.org/"\nminimumReleaseAge = 604800\nminimumReleaseAgeExcludes = []\n[install.lockfile]\npath = "bun.lock"\n',
      );
      const lockPath = resolve(temporaryRoot, "bun.lock");
      const evidencePath = resolve(temporaryRoot, "dependency-lock-evidence.json");
      const lock = (integrity: string) =>
        `${JSON.stringify({
          lockfileVersion: 2,
          workspaces: {},
          packages: { package: ["package@1.0.0", "", {}, integrity] },
        })}\n`;
      const auditedAt = new Date(Date.now() - 1_000).toISOString();
      const writeEvidence = (lockSource: string): void => {
        writeFileSync(
          evidencePath,
          `${JSON.stringify(
            {
              schemaVersion: 1,
              registry: "https://registry.npmjs.org",
              minimumReleaseAgeSeconds: 604800,
              auditedAt,
              lockSha256: createHash("sha256").update(lockSource).digest("hex"),
              releases: [
                {
                  package: "package",
                  version: "1.0.0",
                  publishedAt: "2020-01-01T00:00:00.000Z",
                  integrity: integrityA,
                },
              ],
            },
            null,
            2,
          )}\n`,
        );
      };
      const reviewedLock = lock(integrityA);
      writeFileSync(lockPath, reviewedLock);
      writeEvidence(reviewedLock);
      const runLockAudit = (environment = process.env) =>
        spawnSync(process.execPath, ["scripts/audit-dependencies.ts", "--lock-only"], {
          cwd: temporaryRoot,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          env: environment,
        });
      const accepted = runLockAudit();
      expect(accepted.status, `${accepted.stdout}\n${accepted.stderr}`).toBe(0);

      const tamperedLock = lock(integrityB);
      writeFileSync(lockPath, tamperedLock);
      writeEvidence(tamperedLock);
      const tampered = runLockAudit();
      expect(tampered.status).toBe(1);
      expect(`${tampered.stdout}\n${tampered.stderr}`).toContain(
        "integrity does not attest bun.lock for package@1.0.0",
      );

      const overridden = runLockAudit({
        ...process.env,
        BUN_CONFIG_REGISTRY: "https://registry.example.invalid/",
      });
      expect(overridden.status).toBe(1);
      expect(`${overridden.stdout}\n${overridden.stderr}`).toContain(
        "registry override does not select the public npm registry",
      );
    } finally {
      removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("strict TypeScript 7 compiles the generated single-project audit script", () => {
    const files = generated("single", false);
    const audit = files.find(({ path }) => path === "scripts/audit-dependencies.ts")?.content;
    expect(audit).toBeDefined();
    const temporaryRoot = mkdtempSync(join(tmpdir(), "ghostinit-audit-ts7-"));
    try {
      mkdirSync(resolve(temporaryRoot, "scripts"), { recursive: true });
      writeFileSync(resolve(temporaryRoot, "scripts/audit-dependencies.ts"), audit ?? "");
      const compilerPackage = JSON.parse(
        readFileSync(resolve(root, "node_modules/typescript/package.json"), "utf8"),
      ) as { version?: string };
      expect(compilerPackage.version).toMatch(/^7\./);
      writeFileSync(
        resolve(temporaryRoot, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              target: "ES2024",
              lib: ["ES2024"],
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              skipLibCheck: true,
              types: ["node"],
              typeRoots: [resolve(root, "node_modules/@types")],
            },
            include: ["scripts/**/*.ts"],
          },
          null,
          2,
        )}\n`,
      );
      const result = spawnSync(
        process.execPath,
        ["x", "--no-install", "tsc", "-p", resolve(temporaryRoot, "tsconfig.json"), "--noEmit"],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 60_000,
          windowsHide: true,
        },
      );
      expect(
        result.status,
        `Generated audit TypeScript failed:\n${result.stdout}\n${result.stderr}`,
      ).toBe(0);
    } finally {
      removeTemporaryDirectory(temporaryRoot);
    }
  });

  test("keeps the executable fixture audit and tamper harness synchronized", () => {
    // actions/checkout may materialize text as CRLF on Windows. The executable
    // contract is the source content, not the checkout's platform EOL policy.
    expect(
      normalizeCheckoutLineEndings(
        readFileSync(resolve(fixtureRoot, "scripts/audit-dependencies.ts"), "utf8"),
      ),
    ).toBe(normalizeCheckoutLineEndings(dependencyAuditScriptContent(true, false, true)));
    const harness = readFileSync(resolve(fixtureRoot, "check-image-size-patch.mjs"), "utf8");
    for (const scenario of [
      "Missing patch",
      "Tampered patch",
      "Fresh Bun 1.4 generated mobile lock v2",
      "Unsupported future lock version",
      "CRLF-normalized patch",
      "Missing install",
      "Tampered install",
      "Aliased install with an unpatched copy",
      "Nested install below image-size with an unpatched copy",
      "Multiple installs with an unpatched copy",
      "Duplicate lock binding",
      "Comment-decoy lock binding",
      "Multiline lock resolution with a one-line decoy",
      "Escaped workspace symlink",
      "Escaped patch directory symlink",
    ]) {
      expect(harness).toContain(scenario);
    }
    const attributes = readFileSync(resolve(root, ".gitattributes"), "utf8");
    expect(attributes).toContain("*.patch text eol=lf");
    expect(attributes).toContain("*.sh text eol=lf");
  });

  test("keeps fresh no-install guidance and executable callers on the verified bootstrap", async () => {
    for (const relativePath of [
      "README.md",
      "CONTRIBUTING.md",
      "AGENTS.md",
      "skills/ghostinit-use/SKILL.md",
      "skills/ghostinit-use/references/cloudflare.md",
      "skills/ghostinit-use/references/workflows.md",
      "skills/ghostinit-dev/references/framework.md",
      "skills/ghostinit-dev/references/testing.md",
    ]) {
      expect(readFileSync(resolve(root, relativePath), "utf8"), relativePath).toContain(
        "bun run install:bootstrap",
      );
    }
    const policy = dependencySecurityPolicy(true);
    expect(policy.expectedBunVersion).toBe(runtime.bun);
    expect(policy.minimumReleaseAgeSeconds).toBe(supplyChain.minimumReleaseAgeSeconds);
    expect(policy.auditScriptContent).toBe(dependencyAuditScriptContent(true));
    let observed!: DependencySecurityRunOptions;
    let complete!: () => void;
    const finished = new Promise<void>((resolveDone) => {
      complete = resolveDone;
    });
    runInNewContext(dependencySecurityLauncherContent(policy), {
      process: {
        argv: ["bun", "security-dependencies.cjs", "install", "--bootstrap"],
        cwd: () => "/fixture",
        exitCode: 0,
      },
      console: { log: () => complete() },
      require: (specifier: string) => {
        expect(specifier).toBe("./lib/dependency-security-integrity.cjs");
        return {
          loadDependencySecurityRuntime: () => {
            return {
              runDependencySecurity: async (input: DependencySecurityRunOptions) => {
                observed = input;
                return {
                  status: "clean",
                  dryRun: false,
                  applied: false,
                  installedVerified: true,
                  changes: [],
                  remaining: [],
                  verifiedPatchAdvisories: [],
                };
              },
            };
          },
        };
      },
    });
    await finished;
    expect(observed).toEqual({
      cwd: "/fixture",
      mode: "install",
      dryRun: false,
      bootstrap: true,
      verifyProject: false,
      policy,
    });
    expect(readFileSync(resolve(root, "scripts/test-generated.ts"), "utf8")).toContain(
      'await run(BUN_EXECUTABLE, ["run", "install:bootstrap"], directory)',
    );
    for (const skill of ["ghostinit-dev", "ghostinit-use"]) {
      const sourceRoot = resolve(root, "skills", skill);
      const mirrorRoot = resolve(root, ".claude/skills", skill);
      const pending = [""];
      while (pending.length > 0) {
        const directory = pending.pop();
        if (directory === undefined) throw new Error("skill mirror traversal underflow");
        for (const entry of readdirSync(resolve(sourceRoot, directory), { withFileTypes: true })) {
          const relativePath = join(directory, entry.name);
          if (entry.isDirectory()) pending.push(relativePath);
          else if (entry.isFile()) {
            expect(
              readFileSync(resolve(mirrorRoot, relativePath)),
              `${skill}/${relativePath}`,
            ).toEqual(readFileSync(resolve(sourceRoot, relativePath)));
          }
        }
      }
    }
  });
});
