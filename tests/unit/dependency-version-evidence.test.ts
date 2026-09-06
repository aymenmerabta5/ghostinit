import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import * as versions from "../../packages/versions/src/index.js";
import {
  compareStableVersions,
  lockedRegistryPinsFromText,
  registryReleaseFacts,
  registryVersionFromSpec,
  releaseAgeWindow,
  releaseSnapshotFailures,
} from "../../scripts/check-versions.js";

const root = resolve(import.meta.dir, "../..");
const evidence = JSON.parse(
  readFileSync(resolve(root, "evidence/compatibility/dependency-versions.json"), "utf8"),
) as {
  schemaVersion: number;
  auditedAt: string;
  supplyChain: {
    minimumReleaseAgeSeconds: number;
    cutoffAt: string;
    releaseAgeExceptions: unknown[];
  };
  summary: Record<string, number>;
  holds: Array<{ package: string; pinned: string; scopes: string[] }>;
  omissions: Array<{
    package: string;
    registryLatestPublishedAt: string;
    eligibleLatestPublishedAt: string;
  }>;
  nonNpm: Array<{ scope: string; value: string; reason: string }>;
  pins: Array<{
    scope: string;
    group: string;
    key: string;
    package: string;
    source: "catalog" | "host";
    pinned: string;
    pinnedPublishedAt: string;
    registryLatest: string;
    registryLatestPublishedAt: string;
    eligibleLatest: string;
    eligibleLatestPublishedAt: string;
    status: "latest" | "compatibility-hold";
  }>;
};
const schema = JSON.parse(
  readFileSync(resolve(root, "evidence/compatibility/dependency-versions.schema.json"), "utf8"),
);
const host = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines: { node: string };
  overrides: Record<string, string>;
};

function currentScopes(): Map<
  string,
  {
    group: string;
    key: string;
    package: string;
    source: "catalog" | "host";
    pinned: string;
  }
> {
  const scopes = new Map<
    string,
    {
      group: string;
      key: string;
      package: string;
      source: "catalog" | "host";
      pinned: string;
    }
  >();
  const nonNpm = new Map(evidence.nonNpm.map((entry) => [entry.scope, entry.value]));
  for (const [group, value] of Object.entries(versions as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || group === "catalog" || group === "supplyChain")
      continue;
    for (const [key, spec] of Object.entries(value as Record<string, unknown>)) {
      const scope = `${group}.${key}`;
      if (nonNpm.get(scope) === spec) continue;
      const pinned = registryVersionFromSpec(spec, false);
      expect(pinned, scope).not.toBeNull();
      scopes.set(`${group}.${key}`, {
        group,
        key,
        package: key === "typescriptNext" ? "typescript" : key,
        source: "catalog",
        pinned: pinned!,
      });
    }
  }
  for (const section of ["dependencies", "devDependencies", "overrides"] as const) {
    for (const [pkg, spec] of Object.entries(host[section])) {
      const pinned = registryVersionFromSpec(spec, false);
      expect(pinned, `host.${section}.${pkg}`).not.toBeNull();
      scopes.set(`host.${section}.${pkg}`, {
        group: `host.${section}`,
        key: pkg,
        package: pkg,
        source: "host",
        pinned: pinned!,
      });
    }
  }
  return scopes;
}

describe("dependency version audit evidence", () => {
  test("is schema-valid and covers every current catalog and host pin", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    expect(ajv.validate(schema, evidence), JSON.stringify(ajv.errors)).toBe(true);

    const current = currentScopes();
    const audited = new Map(evidence.pins.map((pin) => [pin.scope, pin]));
    expect([...audited.keys()].sort()).toEqual([...current.keys()].sort());
    for (const [scope, value] of current) {
      expect(audited.get(scope), scope).toMatchObject(value);
    }
    expect(evidence.summary.auditedScopes).toBe(current.size);
    expect(evidence.summary.missingPins).toBe(0);
    expect(evidence.summary.unreviewedPins).toBe(0);
  });

  test("requires an explicit hold for every non-eligible pin and never waives package age", () => {
    expect(evidence.schemaVersion).toBe(3);
    expect(evidence.supplyChain).toEqual({
      minimumReleaseAgeSeconds: versions.supplyChain.minimumReleaseAgeSeconds,
      cutoffAt: "2026-08-25T16:22:25.760Z",
      releaseAgeExceptions: [],
    });
    const cutoffMilliseconds = Date.parse(evidence.supplyChain.cutoffAt);
    const holds = new Map(
      evidence.holds.map((hold) => [`${hold.package}@${hold.pinned}`, new Set(hold.scopes)]),
    );
    for (const pin of evidence.pins) {
      expect(Number.isFinite(Date.parse(pin.pinnedPublishedAt)), pin.scope).toBe(true);
      expect(Date.parse(pin.pinnedPublishedAt), pin.scope).toBeLessThanOrEqual(cutoffMilliseconds);
      expect(Number.isFinite(Date.parse(pin.registryLatestPublishedAt)), pin.scope).toBe(true);
      expect(Number.isFinite(Date.parse(pin.eligibleLatestPublishedAt)), pin.scope).toBe(true);
      expect(Date.parse(pin.eligibleLatestPublishedAt), pin.scope).toBeLessThanOrEqual(
        cutoffMilliseconds,
      );
      if (pin.pinned === pin.eligibleLatest) {
        expect(pin.status, pin.scope).toBe("latest");
        continue;
      }
      expect(pin.status, pin.scope).toBe("compatibility-hold");
      expect(holds.get(`${pin.package}@${pin.pinned}`)?.has(pin.scope), pin.scope).toBe(true);
    }
    for (const omission of evidence.omissions) {
      expect(
        Number.isFinite(Date.parse(omission.registryLatestPublishedAt)),
        omission.package,
      ).toBe(true);
      expect(
        Number.isFinite(Date.parse(omission.eligibleLatestPublishedAt)),
        omission.package,
      ).toBe(true);
      expect(Date.parse(omission.eligibleLatestPublishedAt), omission.package).toBeLessThanOrEqual(
        cutoffMilliseconds,
      );
    }
    const heldScopes = evidence.pins
      .filter(({ status }) => status === "compatibility-hold")
      .map(({ scope }) => scope)
      .sort();
    expect(evidence.holds.flatMap(({ scopes }) => scopes).sort()).toEqual(heldScopes);
    expect(evidence.summary.latestScopes).toBe(
      evidence.pins.filter(({ status }) => status === "latest").length,
    );
    expect(evidence.summary.compatibilityHeldScopes).toBe(heldScopes.length);
    expect(evidence.summary.uniqueCompatibilityHolds).toBe(evidence.holds.length);
    expect(evidence.summary.uniquePackages).toBe(
      new Set(evidence.pins.map(({ package: name }) => name)).size,
    );
    expect(evidence.omissions.some(({ package: name }) => name === "@orpc/next")).toBe(true);
    expect(evidence.nonNpm).toEqual([
      expect.objectContaining({ scope: "postgresDocker.image", value: "postgres:18.6" }),
    ]);

    const fixtureRoot = resolve(root, "tests/fixtures/compatibility");
    const lockfiles = [
      resolve(root, "bun.lock"),
      ...readdirSync(fixtureRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(fixtureRoot, entry.name, "bun.lock")),
    ];
    const locked = new Set<string>();
    for (const lockfile of lockfiles) {
      const parsed = lockedRegistryPinsFromText(lockfile, readFileSync(lockfile, "utf8"));
      expect(parsed.failures, lockfile).toEqual([]);
      for (const pin of parsed.pins) locked.add(`${pin.package}@${pin.version}`);
    }
    expect(evidence.summary.auditedLockfiles).toBe(lockfiles.length);
    expect(evidence.summary.lockedPackageVersions).toBe(locked.size);
  });

  test("accepts only exact/caret/tilde SemVer and rejects floating or protocol specs", () => {
    for (const accepted of [
      "0.0.1",
      "1.2.3",
      "^1.2.3",
      "~1.2.3",
      "7.0.0-beta.1+build.4",
      "1.2.3-alpha-1.0+build-01.002",
    ]) {
      expect(registryVersionFromSpec(accepted, false), accepted).toBe(
        accepted.replace(/^[~^]/, ""),
      );
    }
    for (const rejected of [
      "latest",
      "next",
      "*",
      "1.x",
      "01.2.3",
      "1.2.3-01",
      "1.2.3\n",
      " 1.2.3",
      "1.2.3 ",
      "v1.2.3",
      "=1.2.3",
      "^^1.2.3",
      "1.2",
      "1.2.3.4",
      "1.2.3-alpha..1",
      "1.2.3+build..1",
      ">=1.2.3",
      "1.2.3 || 2.0.0",
      "https://example.invalid/pkg.tgz",
      "git+https://example.invalid/repo.git",
      "github:owner/repo",
      "file:../pkg",
      "link:../pkg",
      "npm:react@19.2.8",
      "workspace:*",
    ]) {
      expect(() => registryVersionFromSpec(rejected, false), rejected).toThrow(
        "unsupported dependency spec",
      );
    }
    expect(registryVersionFromSpec("workspace:*", true)).toBeNull();
    expect(() => registryVersionFromSpec("workspace:^", true)).toThrow(
      "unsupported dependency spec",
    );
  });

  test("selects the greatest stable release at the inclusive age cutoff", () => {
    const cutoffAt = "2026-01-08T00:00:00.000Z";
    const facts = registryReleaseFacts(
      "fixture",
      {
        "dist-tags": { latest: "2.0.0-beta.1" },
        versions: {
          "1.11.0": {},
          "1.9.9": {},
          "2.0.0-beta.1": {},
          "3.0.0": { deprecated: "withdrawn" },
          "1.10.0": {},
        },
        time: {
          "1.11.0": "2026-01-08T00:00:00.001Z",
          "1.9.9": "2025-12-31T00:00:00.000Z",
          "2.0.0-beta.1": "2026-01-02T00:00:00.000Z",
          "3.0.0": "2025-12-30T00:00:00.000Z",
          "1.10.0": cutoffAt,
        },
      },
      Date.parse(cutoffAt),
    );
    expect(facts).toEqual({
      registryLatest: "2.0.0-beta.1",
      registryLatestPublishedAt: "2026-01-02T00:00:00.000Z",
      eligibleLatest: "3.0.0",
      eligibleLatestPublishedAt: "2025-12-30T00:00:00.000Z",
    });
    expect(compareStableVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(() => compareStableVersions("2.0.0-beta.1", "1.10.0")).toThrow("requires stable SemVer");
  });

  test("allows only cutoff-irrelevant registry latest drift", () => {
    const timestamp = (publishedAt: string) => ({
      deprecated: null,
      publishedAt,
      publishedAtMilliseconds: Date.parse(publishedAt),
      integrity:
        "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    });
    const recorded = {
      registryLatest: "1.1.0",
      registryLatestPublishedAt: "2026-01-07T00:00:00.000Z",
      eligibleLatest: "1.0.0",
      eligibleLatestPublishedAt: "2025-12-31T00:00:00.000Z",
    };
    const observed = {
      registryLatest: "1.2.0",
      registryLatestPublishedAt: "2026-01-09T00:00:00.000Z",
      eligibleLatest: "1.0.0",
      eligibleLatestPublishedAt: "2025-12-31T00:00:00.000Z",
    };
    const versionsByPublication = new Map([
      ["1.0.0", timestamp("2025-12-31T00:00:00.000Z")],
      ["1.1.0", timestamp("2026-01-07T00:00:00.000Z")],
      ["1.2.0", timestamp("2026-01-09T00:00:00.000Z")],
    ]);
    const cutoff = Date.parse("2026-01-01T00:00:00.000Z");
    const auditedAt = Date.parse("2026-01-08T00:00:00.000Z");

    expect(
      releaseSnapshotFailures(
        "fixture",
        recorded,
        observed,
        versionsByPublication,
        cutoff,
        auditedAt,
      ),
    ).toEqual([]);

    const byCutoff = new Map(versionsByPublication);
    byCutoff.set("1.2.0", timestamp("2026-01-01T00:00:00.000Z"));
    expect(
      releaseSnapshotFailures("fixture", recorded, observed, byCutoff, cutoff, auditedAt).join(
        "\n",
      ),
    ).toContain("published by the audited cutoff");

    const mutated = new Map(versionsByPublication);
    mutated.set("1.1.0", timestamp("2026-01-06T00:00:00.000Z"));
    expect(
      releaseSnapshotFailures("fixture", recorded, observed, mutated, cutoff, auditedAt).join("\n"),
    ).toContain("publication timestamp changed");

    expect(
      releaseSnapshotFailures(
        "fixture",
        recorded,
        {
          ...observed,
          eligibleLatest: "1.0.1",
          eligibleLatestPublishedAt: "2025-12-31T12:00:00.000Z",
        },
        versionsByPublication,
        cutoff,
        auditedAt,
      ).join("\n"),
    ).toContain("eligible latest changed");

    expect(
      releaseSnapshotFailures(
        "fixture",
        recorded,
        {
          ...observed,
          eligibleLatestPublishedAt: "2025-12-30T23:59:59.999Z",
        },
        versionsByPublication,
        cutoff,
        auditedAt,
      ).join("\n"),
    ).toContain("eligible-latest publication timestamp changed");

    const missingSnapshot = new Map(versionsByPublication);
    missingSnapshot.delete("1.1.0");
    expect(
      releaseSnapshotFailures(
        "fixture",
        recorded,
        observed,
        missingSnapshot,
        cutoff,
        auditedAt,
      ).join("\n"),
    ).toContain("recorded registry latest 1.1.0 disappeared");
  });

  test("fails closed for missing publication times and future audit snapshots", () => {
    expect(() =>
      registryReleaseFacts(
        "fixture",
        {
          "dist-tags": { latest: "1.1.0" },
          versions: { "1.0.0": {}, "1.1.0": {} },
          time: { "1.0.0": "2025-01-01T00:00:00.000Z" },
        },
        Date.parse("2026-01-01T00:00:00.000Z"),
      ),
    ).toThrow("no valid registry publication timestamp");

    expect(
      releaseAgeWindow("2026-01-08T00:00:00.000Z", 604800, Date.parse("2026-01-08T00:00:00.000Z")),
    ).toEqual({
      auditedAtMilliseconds: Date.parse("2026-01-08T00:00:00.000Z"),
      cutoffMilliseconds: Date.parse("2026-01-01T00:00:00.000Z"),
      cutoffAt: "2026-01-01T00:00:00.000Z",
    });
    expect(() =>
      releaseAgeWindow("2026-01-08T00:00:00.001Z", 604800, Date.parse("2026-01-08T00:00:00.000Z")),
    ).toThrow("must not be in the future");
  });

  test("parses Bun JSONC locks and validates workspace identities", () => {
    const valid = lockedRegistryPinsFromText(
      "fixture.lock",
      [
        "{",
        '  "lockfileVersion": 1,',
        '  "workspaces": { "packages/local": { "name": "@repo/local" } },',
        '  "packages": {',
        '    "@scope/pkg": ["@scope/pkg@1.2.3", "", {}, "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="],',
        '    "@repo/local": ["@repo/local@workspace:packages/local"],',
        "  },",
        "}",
      ].join("\n"),
    );
    expect(valid.failures).toEqual([]);
    expect(valid.pins).toEqual([
      {
        lockfile: "fixture.lock",
        key: "@scope/pkg",
        package: "@scope/pkg",
        version: "1.2.3",
        integrity:
          "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
      },
    ]);

    const invalid = lockedRegistryPinsFromText(
      "fixture.lock",
      JSON.stringify({
        lockfileVersion: 2,
        workspaces: {},
        packages: {
          local: ["@repo/local@workspace:packages/missing"],
          remote: ["pkg@git+https://example.invalid/repo.git"],
          mirror: [
            "mirror@1.0.0",
            "https://example.invalid/mirror.tgz",
            {},
            "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
          ],
          weak: ["weak@1.0.0", "", {}, "sha256-YQ=="],
        },
      }),
    );
    expect(invalid.failures).toHaveLength(4);
    expect(invalid.failures.join("\n")).toContain("unresolved workspace package");
    expect(invalid.failures.join("\n")).toContain("unsupported package resolution");
    expect(invalid.failures.join("\n")).toContain("public-registry tuple with sha512 integrity");
  });

  test("locks host tooling to the Bun and Node LTS declaration lines", () => {
    expect(versions.supplyChain.minimumReleaseAgeSeconds).toBe(604800);
    expect(host.devDependencies.ajv).toBe("8.20.0");
    expect(host.devDependencies["@types/bun"]).toBe(versions.runtime.bun);
    expect(host.devDependencies["@types/node"]).toBe(versions.runtime["@types/node"]);
    expect(host.devDependencies.eve).toBe(versions.eve.eve);
    expect(host.overrides["@types/node"]).toBe(versions.runtime["@types/node"]);
    expect(host.engines.node).toBe(">=22.12.0");
    expect("typescriptLegacy" in versions.typescript).toBe(false);
    expect("@typescript/native-preview" in versions.typescript).toBe(false);
  });

  test("locks reviewed dependencies to their age-eligible registry versions", () => {
    expect({
      next: versions.nextStack.next,
      electron: versions.electron.electron,
      s3: versions.storage["@aws-sdk/client-s3"],
      shadcn: versions.ui.shadcn,
      lucide: versions.ui["lucide-react"],
      eve: versions.eve.eve,
      ai: versions.eve.ai,
      nitro: versions.tanstackStart.nitro,
      oxlint: versions.tooling.oxlint,
      oxfmt: versions.tooling.oxfmt,
    }).toEqual({
      next: "16.3.3",
      electron: "44.0.0",
      s3: "3.1117.0",
      shadcn: "4.19.0",
      lucide: "1.34.0",
      eve: "0.44.4",
      ai: "7.0.79",
      nitro: "3.0.260610-beta",
      oxlint: "1.80.0",
      oxfmt: "0.65.0",
    });

    const audited = new Map(evidence.pins.map((pin) => [pin.scope, pin]));
    for (const [scope, pinned] of [
      ["nextStack.next", "16.3.3"],
      ["electron.electron", "44.0.0"],
      ["storage.@aws-sdk/client-s3", "3.1117.0"],
      ["ui.shadcn", "4.19.0"],
      ["ui.lucide-react", "1.34.0"],
      ["eve.eve", "0.44.4"],
      ["eve.ai", "7.0.79"],
      ["tooling.oxlint", "1.80.0"],
      ["tooling.oxfmt", "0.65.0"],
      ["host.devDependencies.oxlint", "1.80.0"],
      ["host.dependencies.oxfmt", "0.65.0"],
    ] as const) {
      expect(audited.get(scope), scope).toMatchObject({
        pinned,
        eligibleLatest: pinned,
        status: "latest",
      });
    }
    expect(audited.get("runtime.node")).toMatchObject({
      pinned: "24.19.0",
      eligibleLatest: "26.7.0",
      status: "compatibility-hold",
    });
    expect(audited.get("orpc.@orpc/client")).toMatchObject({
      pinned: "1.15.0",
      eligibleLatest: "2.0.0",
      status: "compatibility-hold",
    });
    expect(audited.get("tanstackStart.nitro")).toMatchObject({
      pinned: "3.0.260610-beta",
      eligibleLatest: "3.0.0",
      status: "compatibility-hold",
    });
  });
});
