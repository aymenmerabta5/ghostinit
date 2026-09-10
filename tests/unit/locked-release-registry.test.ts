import { describe, expect, test } from "bun:test";
import { lockedReleaseSnapshotFailures } from "../../scripts/check-versions.js";
import type { LockedReleaseEvidence } from "../../scripts/dependency-audit-window.js";

const baseline = "2026-09-01T00:00:00.000Z";
const auditedAt = "2026-09-09T00:00:00.000Z";
const now = Date.parse(auditedAt);
const integrity = "sha512-" + Buffer.alloc(64).toString("base64");
const otherIntegrity = "sha512-" + Buffer.alloc(64, 1).toString("base64");
const pin = {
  lockfile: "bun.lock",
  key: "fixture",
  package: "fixture",
  version: "1.0.1",
  integrity,
};
const publication = "2026-08-26T00:00:00.000Z";
const recorded: LockedReleaseEvidence = {
  package: pin.package,
  version: pin.version,
  publishedAt: publication,
  integrity,
  auditWindow: {
    scope: "locked-release",
    package: pin.package,
    version: pin.version,
    publishedAt: publication,
    integrity,
    auditedAt,
    cutoffAt: "2026-09-02T00:00:00.000Z",
  },
};
const registry = {
  deprecated: null,
  publishedAt: publication,
  publishedAtMilliseconds: Date.parse(publication),
  integrity,
};
const verify = (row = recorded, metadata = registry, current = pin) =>
  lockedReleaseSnapshotFailures(current, row, metadata, baseline, 604800, now);

describe("online locked-release evidence verification", () => {
  test("accepts matching npm publication and SRI with a valid exact window", () => {
    expect(verify()).toEqual([]);
  });

  test("a window never permits publication or SRI drift in primary registry facts", () => {
    expect(
      verify(recorded, { ...registry, publishedAt: "2026-08-25T00:00:00.000Z" }).join("\n"),
    ).toContain("publication or integrity evidence is missing or stale");
    expect(verify(recorded, { ...registry, integrity: otherIntegrity }).join("\n")).toContain(
      "publication or integrity evidence is missing or stale",
    );
    expect(verify(recorded, registry, { ...pin, integrity: otherIntegrity }).join("\n")).toContain(
      "publication or integrity evidence is missing or stale",
    );
  });

  test("matching registry data still fails when a new release has no window", () => {
    const withoutWindow = { ...recorded };
    delete withoutWindow.auditWindow;
    expect(verify(withoutWindow).join("\n")).toContain("after release-age cutoff");
  });

  test("rejects malformed windows and mismatches on any actual repeated lock tuple", () => {
    expect(
      verify({ ...recorded, auditWindow: null } as unknown as LockedReleaseEvidence).join("\n"),
    ).toContain("malformed");
    const repeated = { ...pin, lockfile: "tests/fixtures/compatibility/fixture/bun.lock" };
    expect(verify(recorded, registry, repeated)).toEqual([]);
    expect(verify(recorded, registry, { ...repeated, version: "1.0.2" }).join("\n")).toContain(
      "exact lock tuple",
    );
  });
});
