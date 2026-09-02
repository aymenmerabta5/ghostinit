import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runtime, supplyChain } from "../../packages/versions/src/index.js";
import { lockAgePreflight } from "../../scripts/check-lock-release-age.js";

const repositoryRoot = resolve(import.meta.dir, "../..");
const auditedAt = "2026-01-08T00:00:00.000Z";
const cutoffAt = "2026-01-01T00:00:00.000Z";
const publishedAt = "2025-12-31T23:59:59.999Z";

function registryLock(
  registry = "",
  integrity = "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
): string {
  return JSON.stringify(
    {
      lockfileVersion: 2,
      configVersion: 1,
      workspaces: {},
      packages: {
        package: ["package@1.0.0", registry, {}, integrity],
      },
    },
    null,
    2,
  );
}

function evidence(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      auditedAt,
      asOf: "2026-01-08",
      registry: "https://registry.npmjs.org",
      bun: runtime.bun,
      supplyChain: {
        minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
        cutoffAt,
        releaseAgeExceptions: [],
      },
      summary: { auditedLockfiles: 2, lockedPackageVersions: 1 },
      lockedReleases: [{ package: "package", version: "1.0.0", publishedAt }],
      ...overrides,
    },
    null,
    2,
  );
}

function temporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-lock-age-"));
  const fixture = join(root, "tests", "fixtures", "compatibility", "fixture");
  const evidenceRoot = join(root, "evidence", "compatibility");
  mkdirSync(fixture, { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(join(root, "bun.lock"), registryLock());
  writeFileSync(join(fixture, "package.json"), "{}");
  writeFileSync(join(fixture, "bun.lock"), registryLock());
  writeFileSync(join(evidenceRoot, "dependency-versions.json"), evidence());
  return root;
}

function expectFailure(mutate: (root: string) => void, message: string): void {
  const root = temporaryRepository();
  try {
    mutate(root);
    expect(lockAgePreflight(root, Date.parse(auditedAt)).failures.join("\n")).toContain(message);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("dependency-free preinstall lock-age gate", () => {
  test("accepts the exact reviewed lock closure at the inclusive cutoff", () => {
    const root = temporaryRepository();
    try {
      expect(lockAgePreflight(root, Date.parse(auditedAt))).toEqual({
        failures: [],
        cutoffAt,
        auditedLockfiles: 2,
        lockedPackageVersions: 1,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails closed for absent, malformed, untrusted, weak, stale, and young inputs", () => {
    expectFailure((root) => rmSync(join(root, "bun.lock")), "required Bun text lock is missing");
    expectFailure((root) => writeFileSync(join(root, "bun.lock"), "{"), "invalid Bun text lock");
    expectFailure(
      (root) =>
        writeFileSync(join(root, "bun.lock"), registryLock("https://example.invalid/package.tgz")),
      "public-registry tuple",
    );
    expectFailure(
      (root) => writeFileSync(join(root, "bun.lock"), registryLock("", "sha256-YQ==")),
      "sha512 integrity",
    );
    expectFailure(
      (root) =>
        writeFileSync(
          join(root, "evidence", "compatibility", "dependency-versions.json"),
          evidence({
            summary: { auditedLockfiles: 2, lockedPackageVersions: 0 },
            lockedReleases: [],
          }),
        ),
      "missing locked release",
    );
    expectFailure(
      (root) =>
        writeFileSync(
          join(root, "evidence", "compatibility", "dependency-versions.json"),
          evidence({
            lockedReleases: [
              {
                package: "package",
                version: "1.0.0",
                publishedAt: "2026-01-01T00:00:00.001Z",
              },
            ],
          }),
        ),
      "after release-age cutoff",
    );
  });

  test("has no installed dependency and precedes every workflow install", () => {
    for (const relative of ["scripts/check-lock-release-age.ts", "scripts/lock-age-policy.ts"]) {
      const source = readFileSync(resolve(repositoryRoot, relative), "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      expect(
        imports.every((specifier) => specifier.startsWith("node:") || specifier.startsWith(".")),
        relative,
      ).toBe(true);
    }

    let installs = 0;
    for (const relative of [".github/workflows/ci.yml", ".github/workflows/e2e.yml"]) {
      const lines = readFileSync(resolve(repositoryRoot, relative), "utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index]?.includes("bun install --frozen-lockfile")) continue;
        installs += 1;
        expect(lines.slice(Math.max(0, index - 4), index).join("\n"), relative).toContain(
          "run: bun run check:lock-age",
        );
      }
    }
    expect(installs).toBe(8);

    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["check:lock-age"]).toBe("bun run scripts/check-lock-release-age.ts");
    expect(manifest.scripts["test:ci"].startsWith("bun run check:lock-age &&")).toBe(true);
    expect(manifest.scripts["test:ci"]).toContain("bun run check:versions");
  });
});
