import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  dependencyAuditScriptContent,
  IMAGE_SIZE_PATCH_GITATTRIBUTES,
  IMAGE_SIZE_PATCH_CONTENT,
  IMAGE_SIZE_PATCH_KEY,
  IMAGE_SIZE_PATCH_PATH,
  IMAGE_SIZE_PATCH_SHA256,
} from "../../src/templates/tooling/dependency-audit.js";
import { generatedGitattributesContent } from "../../src/templates/gitignore.js";

const root = resolve(import.meta.dir, "../..");
const fixtureRoot = resolve(root, "tests/fixtures/compatibility/expo-uniwind-rnr");
const bunV2FixtureRoot = resolve(root, "tests/fixtures/compatibility/next-tailwind-biome");
const reviewedPatchDigest = "7805ea36efb396516b71b6965774b03c7df465bdda1489b937dc19d3bde8a7d8";
const reviewedInstalledDigests = [
  "ea073da10e66839d1f989dd62775312f85ba53e3d6b37476bce477f25da4e82f",
  "6786c3d52ea46fab31d0d7883c16041f15a1604356bd0f139c1b2adc261234c1",
] as const;
const reviewedAdvisories = ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"] as const;

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
  const base = resolve(tmpdir());
  const target = resolve(path);
  const descendant = relative(base, target);
  if (
    descendant.length === 0 ||
    descendant === ".." ||
    descendant.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(descendant)
  ) {
    throw new Error(`Refusing to remove unsafe TypeScript fixture path: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
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
  });

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
        expect(byPath.get("scripts/audit-dependencies.ts")).toBe(
          dependencyAuditScriptContent(mobile),
        );
        if (mode === "monorepo") {
          expect(byPath.get(".github/workflows/ci.yml")).toContain("bun run audit:dependencies");
        }
        if (mobile) {
          expect(manifest.patchedDependencies?.[IMAGE_SIZE_PATCH_KEY]).toBe(IMAGE_SIZE_PATCH_PATH);
          expect(byPath.get(IMAGE_SIZE_PATCH_PATH)).toBe(IMAGE_SIZE_PATCH_CONTENT);
          expect(byPath.get(".gitattributes")).toBe(IMAGE_SIZE_PATCH_GITATTRIBUTES);
        } else {
          expect(manifest.patchedDependencies?.[IMAGE_SIZE_PATCH_KEY]).toBeUndefined();
          expect(byPath.has(IMAGE_SIZE_PATCH_PATH)).toBe(false);
          expect(byPath.get(".gitattributes")).toBe(generatedGitattributesContent(false));
        }
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
    expect(audit).toContain("if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatch(root);");
    expect(audit).toContain("REVIEWED_ADVISORIES.get(id) === entry.url");
    expect(audit).toContain('rank === undefined || severity === "unknown"');
    expect(audit).toContain("result.status !== 0 && result.status !== 1");
    expect(audit).toContain('JSON.parse(String(result.stdout ?? ""))');
    expect(audit).toContain("if (blocking.status !== 0)");
    expect(audit).toContain("bun.lock does not bind the reviewed image-size patch");
    expect(audit).toContain("JSON.parse(normalizedJsonc(tokens))");
    expect(audit).toContain("assertNoDuplicateJsoncKeys(tokens)");
    expect(audit).toContain("resolution !== PATCH_KEY");
    expect(audit).not.toContain("lock.includes(lockPatchBinding)");
    expect(audit).toContain("workspaceRoots(root, manifest)");
    expect(audit).toContain('const nested = join(location.root, "node_modules")');
    expect(audit).toContain('installed.name === "image-size"');
    expect(audit).toContain("resolveContained(projectRoot, path, label)");
    expect(audit).toContain("lstatSync(path).isFile()");
    expect(audit).toContain("the installed image-size patch was not applied exactly");
    expect(audit.indexOf("verifyReviewedPatch(root)")).toBeLessThan(
      audit.indexOf('spawnSync(process.execPath, ["audit", "--json"]'),
    );
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
    ).toBe(normalizeCheckoutLineEndings(dependencyAuditScriptContent(true)));
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
});
