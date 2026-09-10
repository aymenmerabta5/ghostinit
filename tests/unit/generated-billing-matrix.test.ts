import { describe, expect, test } from "bun:test";
import { CORNERS, CONVEX_WORKER_RUNTIME_PROBES } from "../../scripts/test-generated.js";
import { parseCreateSpecific, parseRawArgs } from "../../src/cli/args.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";

const GLOBAL_PROVIDERS = ["paddle", "stripe", "polar"] as const;
const EXPANDED_WORKLOADS = [
  "next-convex",
  "tanstack",
  "maximal-multi-app",
  "cloudflare-next-monorepo",
  "cloudflare-tanstack-monorepo",
] as const;

type Corner = (typeof CORNERS)[number];

function billing(corner: Corner): string[] {
  const index = corner.args.indexOf("--billing");
  return index < 0 || corner.args[index + 1] === "none" ? [] : corner.args[index + 1]!.split(",");
}

function withoutBilling(corner: Corner): string[] {
  const index = corner.args.indexOf("--billing");
  return corner.args.filter((_, position) => position !== index && position !== index + 1);
}

function variant(workload: string, provider: (typeof GLOBAL_PROVIDERS)[number]): Corner {
  const id = provider === "paddle" ? workload : `${workload}-${provider}`;
  const corner = CORNERS.find((entry) => entry.id === id);
  if (!corner) throw new Error(`Missing provider coverage: ${id}`);
  return corner;
}

describe("installed generation matrix billing selections", () => {
  test("every executable corner parses and resolves through the production CLI policy", () => {
    expect(new Set(CORNERS.map(({ id }) => id)).size).toBe(CORNERS.length);
    for (const corner of CORNERS) {
      const parsed = parseRawArgs([
        process.execPath,
        "./dist/cli.js",
        "create",
        "matrix-check",
        "--yes",
        "--runtime",
        "bun",
        ...corner.args,
      ]);
      const options = parseCreateSpecific(parsed.values, parsed.command);
      const runtime = parsed.values.runtime;
      if (runtime !== "bun" && runtime !== "node") throw new Error(`${corner.id}: invalid runtime`);
      const resolution = resolveCreateConfig({
        ...options,
        name: "matrix-check",
        runtime,
        databaseWasExplicit: Boolean(parsed.values.database),
      });
      expect(resolution.ok, corner.id).toBe(true);
      expect(
        billing(corner).filter((provider) =>
          (GLOBAL_PROVIDERS as readonly string[]).includes(provider),
        ).length,
        corner.id,
      ).toBeLessThanOrEqual(1);
    }
  });

  test.each(EXPANDED_WORKLOADS)(
    "%s preserves each provider and its complete workload",
    (workload) => {
      const baseline = variant(workload, "paddle");
      const independent = workload === "tanstack" ? ["manual"] : ["chargily", "manual"];
      const providers = new Set<string>();
      for (const provider of GLOBAL_PROVIDERS) {
        const corner = variant(workload, provider);
        expect(billing(corner), corner.id).toEqual([provider, ...independent]);
        for (const selected of billing(corner)) providers.add(selected);
        expect(withoutBilling(corner), corner.id).toEqual(withoutBilling(baseline));
        expect(corner.nativePackageRoots, corner.id).toEqual(baseline.nativePackageRoots);
        expect(corner.note, corner.id).toEqual(baseline.note);
        if (baseline.worker) {
          const {
            runtimeProbes: _baselineProbes,
            smokePaths: _baselinePaths,
            ...expected
          } = baseline.worker;
          const { runtimeProbes: _probes, smokePaths: _paths, ...actual } = corner.worker!;
          expect(actual, corner.id).toEqual(expected);
        }
      }
      expect([...providers].sort()).toEqual([...independent, ...GLOBAL_PROVIDERS].sort());
    },
  );

  test("Worker variants preserve every exact security probe and only probe selected webhooks", () => {
    expect(CORNERS.filter(({ worker }) => worker).length).toBe(8);
    for (const workload of ["cloudflare-next-monorepo", "cloudflare-tanstack-monorepo"]) {
      const probeUnion = new Map<string, (typeof CONVEX_WORKER_RUNTIME_PROBES)[number]>();
      for (const provider of GLOBAL_PROVIDERS) {
        const corner = variant(workload, provider);
        const expected = CONVEX_WORKER_RUNTIME_PROBES.filter(
          (probe) =>
            !probe.path.startsWith("/api/webhooks/") ||
            probe.path.endsWith("/chargily") ||
            probe.path.endsWith(`/${provider}`),
        );
        expect(corner.worker!.runtimeProbes, corner.id).toEqual(expected);
        for (const probe of expected) probeUnion.set(probe.path, probe);
        const basePaths = variant(workload, "paddle").worker!.smokePaths!;
        expect(corner.worker!.smokePaths, corner.id).toEqual(
          basePaths.filter((path) => path !== "/billing/paddle-checkout" || provider === "paddle"),
        );
      }
      expect([...probeUnion.values()].sort((a, b) => a.path.localeCompare(b.path))).toEqual(
        [...CONVEX_WORKER_RUNTIME_PROBES].sort((a, b) => a.path.localeCompare(b.path)),
      );
    }
  });

  test("manual-only corners cover both modes and both framework/database profiles", () => {
    const manual = CORNERS.filter(({ id }) => id.startsWith("manual-"));
    expect(manual).toHaveLength(4);
    expect(manual.map(({ id }) => id).sort()).toEqual([
      "manual-next-monorepo",
      "manual-next-single",
      "manual-tanstack-monorepo",
      "manual-tanstack-single",
    ]);
    for (const corner of manual) expect(billing(corner), corner.id).toEqual(["manual"]);
  });
});
