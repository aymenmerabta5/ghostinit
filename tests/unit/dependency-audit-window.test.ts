import { describe, expect, test } from "bun:test";
import { exactPinAuditWindow, type PinAuditWindow } from "../../scripts/dependency-audit-window.js";

const current = { scope: "cloudflare.sharp", package: "sharp", version: "0.35.4" };
const baseline = "2026-09-01T00:00:00.000Z";
const now = Date.parse("2026-09-09T00:00:00.000Z");
const publishedAt = "2026-08-26T09:42:27.903Z";
const audit: PinAuditWindow = {
  ...current,
  publishedAt,
  auditedAt: "2026-09-08T00:00:00.000Z",
  cutoffAt: "2026-09-01T00:00:00.000Z",
};
const verify = (auditWindow = audit) =>
  exactPinAuditWindow(
    current,
    { pinnedPublishedAt: publishedAt, auditWindow },
    baseline,
    604800,
    now,
  );

describe("incremental exact-pin dependency verification", () => {
  test("preserves the seven-day age policy at the new audit time", () => {
    const result = verify();
    expect(result.auditedAtMilliseconds - result.cutoffMilliseconds).toBe(604800000);
    expect(result.cutoffAt).toBe(audit.cutoffAt);
  });
  for (const field of ["scope", "package", "version", "publishedAt"] as const) {
    test(`rejects mismatched ${field}`, () => {
      expect(() => verify({ ...audit, [field]: "incorrect" })).toThrow("exact pin");
    });
  }
  test("rejects future and stale re-verification timestamps", () => {
    expect(() => verify({ ...audit, auditedAt: "2026-09-10T00:00:00.000Z" })).toThrow("future");
    expect(() => verify({ ...audit, auditedAt: baseline })).toThrow("newer");
  });
  test("rejects shortened or incorrect cutoffs", () => {
    expect(() => verify({ ...audit, cutoffAt: "2026-09-07T00:00:00.000Z" })).toThrow(
      "full release-age policy",
    );
    expect(() => verify({ ...audit, cutoffAt: "2026-08-31T00:00:00.000Z" })).toThrow(
      "full release-age policy",
    );
  });
  test("rejects a release younger than the full policy", () => {
    const young = "2026-09-02T00:00:00.000Z";
    expect(() =>
      exactPinAuditWindow(
        current,
        { pinnedPublishedAt: young, auditWindow: { ...audit, publishedAt: young } },
        baseline,
        604800,
        now,
      ),
    ).toThrow("minimum age");
  });
});
