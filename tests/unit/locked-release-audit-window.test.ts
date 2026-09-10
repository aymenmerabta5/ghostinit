import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import { exactLockedReleaseAuditWindow } from "../../scripts/dependency-audit-window.js";
import { lockAgePreflight } from "../../scripts/check-lock-release-age.js";
import { FsTransaction } from "../../src/lib/fs.js";

const baseline = "2026-09-01T00:00:00.000Z";
const auditedAt = "2026-09-09T00:00:00.000Z";
const cutoffAt = "2026-09-02T00:00:00.000Z";
const now = Date.parse(auditedAt);
const integrity = "sha512-" + Buffer.alloc(64).toString("base64");
const differentIntegrity = "sha512-" + Buffer.alloc(64, 1).toString("base64");
const current = { package: "fixture", version: "1.0.1", integrity };
const release = { ...current, publishedAt: "2026-08-26T00:00:00.000Z" };
const auditWindow = { scope: "locked-release" as const, ...release, auditedAt, cutoffAt };
const recorded = { ...release, auditWindow };
const verify = (value: unknown = recorded, auditBaseline = baseline) =>
  exactLockedReleaseAuditWindow(current, value, auditBaseline, 604800, now);

describe("exact locked-release audit windows", () => {
  test("retains the full policy and binds one reviewed tuple", () => {
    expect(verify()).toEqual({
      auditedAtMilliseconds: now,
      cutoffMilliseconds: Date.parse(cutoffAt),
      cutoffAt,
    });
    expect(verify().auditedAtMilliseconds - verify().cutoffMilliseconds).toBe(604800000);
    expect(
      verify({
        ...recorded,
        publishedAt: cutoffAt,
        auditWindow: { ...auditWindow, publishedAt: cutoffAt },
      }).cutoffAt,
    ).toBe(cutoffAt);
  });

  test("absent windows use the unchanged baseline cutoff", () => {
    const before = "2026-08-25T00:00:00.000Z";
    expect(verify({ ...release, publishedAt: before }).cutoffAt).toBe(before);
    expect(() => verify(release)).toThrow("after release-age cutoff");
  });

  for (const field of ["package", "version", "integrity"] as const) {
    test(`rejects a different actual lock ${field}`, () => {
      expect(() =>
        exactLockedReleaseAuditWindow(
          { ...current, [field]: field === "integrity" ? differentIntegrity : "other" },
          recorded,
          baseline,
          604800,
          now,
        ),
      ).toThrow("exact lock tuple");
    });
  }

  for (const field of ["scope", "package", "version", "publishedAt", "integrity"] as const) {
    test(`rejects an audit window bound to a different ${field}`, () => {
      const value = field === "integrity" ? differentIntegrity : "other";
      expect(() =>
        verify({ ...recorded, auditWindow: { ...auditWindow, [field]: value } }),
      ).toThrow("exact release and integrity");
    });
  }

  for (const value of [
    null,
    undefined,
    false,
    0,
    [],
    "window",
    {},
    { ...auditWindow, extra: true },
  ]) {
    test(`rejects a present malformed window ${JSON.stringify(value)}`, () => {
      expect(() => verify({ ...recorded, auditWindow: value })).toThrow("malformed");
    });
  }

  for (const field of Object.keys(auditWindow)) {
    test(`rejects missing and non-string audit ${field}`, () => {
      const missing: Record<string, unknown> = { ...auditWindow };
      delete missing[field];
      expect(() => verify({ ...recorded, auditWindow: missing })).toThrow("malformed");
      expect(() => verify({ ...recorded, auditWindow: { ...auditWindow, [field]: 1 } })).toThrow(
        "malformed",
      );
    });
  }

  test("rejects unknown fields and malformed outer release facts", () => {
    expect(() => verify({ ...recorded, extra: true })).toThrow("malformed");
    expect(() => verify({ ...recorded, version: 1 })).toThrow("malformed");
    expect(() => verify({ ...recorded, integrity: "sha256-YQ==" })).toThrow("malformed");
  });

  test("rejects invalid, stale, and future audit times including an invalid baseline", () => {
    expect(() => verify(recorded, "invalid")).toThrow("valid timestamp");
    expect(() => verify(recorded, "2026-09-10T00:00:00.000Z")).toThrow("future");
    expect(() =>
      verify({ ...recorded, auditWindow: { ...auditWindow, auditedAt: baseline } }),
    ).toThrow("newer");
    for (const value of ["invalid", "2026-09-10T00:00:00.000Z"]) {
      expect(() =>
        verify({ ...recorded, auditWindow: { ...auditWindow, auditedAt: value } }),
      ).toThrow();
    }
  });

  test("rejects shortened policy, changed cutoffs, and young publications", () => {
    expect(() => exactLockedReleaseAuditWindow(current, recorded, baseline, 604799, now)).toThrow(
      "604800",
    );
    expect(() =>
      verify({ ...recorded, auditWindow: { ...auditWindow, cutoffAt: auditedAt } }),
    ).toThrow("full release-age policy");
    for (const value of ["invalid", "2026-09-02T00:00:00.001Z"]) {
      expect(() =>
        verify({
          ...recorded,
          publishedAt: value,
          auditWindow: { ...auditWindow, publishedAt: value },
        }),
      ).toThrow();
    }
  });

  test("the schema accepts only complete, exactly scoped window objects", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(import.meta.dir, "../../evidence/compatibility/dependency-versions.schema.json"),
        "utf8",
      ),
    );
    const ajv = new Ajv2020({ strict: true, validateFormats: false });
    const validate = ajv.compile({
      ...schema.properties.lockedReleases.items,
      $defs: schema.$defs,
    });
    expect(validate(recorded)).toBe(true);
    expect(validate(release)).toBe(true);
    for (const value of [
      null,
      { ...auditWindow, scope: "catalog" },
      { ...auditWindow, extra: true },
      { ...auditWindow, auditedAt: 1 },
      { ...auditWindow, integrity: undefined },
    ]) {
      expect(validate({ ...recorded, auditWindow: value })).toBe(false);
    }
  });
});

async function withRepository(
  row: unknown,
  check: (root: string) => void | Promise<void>,
  secondIntegrity = integrity,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-exact-lock-window-"));
  try {
    const transaction = new FsTransaction(root);
    const lock = (sri: string) =>
      JSON.stringify({
        lockfileVersion: 2,
        workspaces: {},
        packages: { fixture: ["fixture@1.0.1", "", {}, sri] },
      });
    await transaction.write("bun.lock", lock(integrity));
    await transaction.write("tests/fixtures/compatibility/fixture/package.json", "{}");
    await transaction.write("tests/fixtures/compatibility/fixture/bun.lock", lock(secondIntegrity));
    await transaction.write(
      "evidence/compatibility/dependency-versions.json",
      JSON.stringify({
        schemaVersion: 3,
        auditedAt: baseline,
        asOf: baseline.slice(0, 10),
        registry: "https://registry.npmjs.org",
        bun: runtime.bun,
        supplyChain: {
          minimumReleaseAgeSeconds: 604800,
          cutoffAt: "2026-08-25T00:00:00.000Z",
          releaseAgeExceptions: [],
        },
        summary: { auditedLockfiles: 2, lockedPackageVersions: 1 },
        lockedReleases: [row],
      }),
    );
    expect(transaction.getStagedFiles()).toHaveLength(4);
    await transaction.commit();
    await check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("dependency-free lock-window preflight", () => {
  test("accepts new exact lock facts while keeping the global cutoff unchanged", async () => {
    await withRepository(recorded, (root) => {
      expect(lockAgePreflight(root, now)).toEqual({
        failures: [],
        cutoffAt: "2026-08-25T00:00:00.000Z",
        auditedLockfiles: 2,
        lockedPackageVersions: 1,
      });
    });
  });

  for (const [index, row] of [
    release,
    { ...recorded, auditWindow: null },
    { ...recorded, auditWindow: { ...auditWindow, extra: true } },
    { ...recorded, auditWindow: { ...auditWindow, integrity: differentIntegrity } },
  ].entries()) {
    test(`fails closed for invalid row ${index}`, async () => {
      await withRepository(row, (root) => {
        expect(lockAgePreflight(root, now).failures.length).toBeGreaterThan(0);
      });
    });
  }

  test("binds the evidence to every lock tuple, including repeated releases", async () => {
    await withRepository(
      recorded,
      (root) => {
        expect(lockAgePreflight(root, now).failures.join("\n")).toContain(
          "locked integrity differs from reviewed evidence",
        );
      },
      differentIntegrity,
    );
  });

  test("the shared window validator imports only local source and built-ins", async () => {
    const source = await readFile(
      resolve(import.meta.dir, "../../scripts/dependency-audit-window.ts"),
      "utf8",
    );
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.every((value) => value?.startsWith(".") || value?.startsWith("node:"))).toBe(
      true,
    );
  });
});
