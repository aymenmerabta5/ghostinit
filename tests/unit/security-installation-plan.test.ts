import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recompileInstalledSecurityPlan } from "../../src/commands/create/security-plan.js";
import { canonicalizeGenerationPlan } from "../../src/generation/plan-formatter.js";
import { ConflictError } from "../../src/lib/errors.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { serializeDesiredProjectConfig } from "../../src/lib/project-config.js";
import {
  installationDesired,
  installationPlan,
  installationSecurityResolution,
  stageInstallationSecurity,
} from "../helpers/security-installation-fixture.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const base = installationPlan();

async function fixture(priorFloor = false) {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-security-plan-"));
  roots.push(root);
  const before = priorFloor
    ? await installationPlan(installationDesired(installationSecurityResolution()))
    : await base;
  const resolution = installationSecurityResolution(priorFloor ? 2 : 1);
  const tx = new FsTransaction(root);
  const candidate = await stageInstallationSecurity(tx, before.plan, before.desired, resolution);
  await tx.commit();
  return { root, before, resolution, ...candidate };
}

async function replaceJson(
  root: string,
  path: string,
  transform: (value: Record<string, unknown>) => object,
) {
  const before = readFileSync(join(root, path), "utf8");
  const tx = new FsTransaction(root);
  await tx.writeIfUnchanged(
    path,
    `${JSON.stringify(transform(JSON.parse(before)), null, 2)}\n`,
    before,
  );
  await tx.commit();
}

describe("security-maintained installation plans", () => {
  test("uses the installer read adapter for an unchanged in-memory candidate", async () => {
    const before = await base;
    const root = mkdtempSync(join(tmpdir(), "ghostinit-security-plan-adapter-"));
    roots.push(root);
    const reads: string[] = [];
    const read = (async (path: unknown) => {
      reads.push(String(path));
      if (String(path) !== join(root, "ghostinit.config.json"))
        throw new Error("Unexpected candidate read");
      return serializeDesiredProjectConfig(before.desired);
    }) as NonNullable<Parameters<typeof recompileInstalledSecurityPlan>[5]>;
    const result = await recompileInstalledSecurityPlan(
      root,
      before.desired,
      before.resolved,
      before.plan,
      canonicalizeGenerationPlan,
      read,
    );
    expect(result.plan).toBe(before.plan);
    expect(reads).toEqual([join(root, "ghostinit.config.json")]);
  });

  test("compiles the evidenced compatible dependency into a distinct immutable plan", async () => {
    const { root, before, resolution } = await fixture();
    const result = await recompileInstalledSecurityPlan(
      root,
      before.desired,
      before.resolved,
      before.plan,
      canonicalizeGenerationPlan,
    );
    expect(result.plan.planHash).not.toBe(before.plan.planHash);
    expect(result.plan.projectConfigHash).toBe(result.resolved.configHash);
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.resolved)).toBe(true);
    expect(result.plan.files.length).toBe(before.plan.files.length);
    expect(result.plan.secrets).toEqual(before.plan.secrets);
    const manifests = result.plan.files.filter(
      ({ physicalPath }) => physicalPath === "package.json",
    );
    expect(JSON.parse(manifests[0].content).dependencies.react).toBe(resolution.version);
    expect(result.desired.dependencySecurity?.resolutions).toEqual([resolution]);
  });

  test("retains an identical plan when there was no dependency-security change", async () => {
    const { root, before } = await fixture();
    const tx = new FsTransaction(root);
    await tx.write("ghostinit.config.json", serializeDesiredProjectConfig(before.desired));
    await tx.commit();
    let formatted = false;
    const result = await recompileInstalledSecurityPlan(
      root,
      before.desired,
      before.resolved,
      before.plan,
      async () => {
        formatted = true;
        throw new Error("must not recompile");
      },
    );
    expect(formatted).toBe(false);
    expect(result.plan).toBe(before.plan);
  });

  test("rejects changed project choices outside security maintenance", async () => {
    const { root, before } = await fixture();
    await replaceJson(root, "ghostinit.config.json", (value) => ({
      ...value,
      name: "different-project",
    }));
    await expect(
      recompileInstalledSecurityPlan(
        root,
        before.desired,
        before.resolved,
        before.plan,
        canonicalizeGenerationPlan,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  for (const change of ["remove", "lower"] as const) {
    test(`rejects a ${change === "remove" ? "removed" : "lowered"} existing security floor`, async () => {
      const { root, before } = await fixture(true);
      await replaceJson(root, "ghostinit.config.json", (value) => ({
        ...value,
        dependencySecurity: {
          schemaVersion: 1,
          resolutions: change === "remove" ? [] : [installationSecurityResolution(0)],
        },
      }));
      await expect(
        recompileInstalledSecurityPlan(
          root,
          before.desired,
          before.resolved,
          before.plan,
          canonicalizeGenerationPlan,
        ),
      ).rejects.toThrow(/removed or lowered/);
    });
  }

  for (const issue of ["lock", "integrity", "missing-release", "duplicate-release"] as const) {
    test(`rejects ${issue} evidence mismatch`, async () => {
      const { root, before } = await fixture();
      await replaceJson(root, "dependency-lock-evidence.json", (value) => {
        const releases = value.releases as Record<string, unknown>[];
        if (issue === "lock") return { ...value, lockSha256: "0".repeat(64) };
        if (issue === "integrity")
          return {
            ...value,
            releases: [{ ...releases[0], integrity: `sha512-${"B".repeat(85)}A==` }],
          };
        return {
          ...value,
          releases: issue === "missing-release" ? [] : [...releases, ...releases],
        };
      });
      await expect(
        recompileInstalledSecurityPlan(
          root,
          before.desired,
          before.resolved,
          before.plan,
          canonicalizeGenerationPlan,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  }

  test("rejects a recorded release that does not match its planned original declaration", async () => {
    const { root, before, resolution } = await fixture();
    await replaceJson(root, "ghostinit.config.json", (value) => ({
      ...value,
      dependencySecurity: {
        schemaVersion: 1,
        resolutions: [{ ...resolution, originalSpec: `^${resolution.originalSpec}` }],
      },
    }));
    await expect(
      recompileInstalledSecurityPlan(
        root,
        before.desired,
        before.resolved,
        before.plan,
        canonicalizeGenerationPlan,
      ),
    ).rejects.toThrow(/planned dependency/);
  });

  for (const kind of ["file-scope", "secret-scope", "unrelated-content"] as const) {
    test(`rejects formatter ${kind} tampering in the second plan`, async () => {
      const { root, before } = await fixture();
      await expect(
        recompileInstalledSecurityPlan(
          root,
          before.desired,
          before.resolved,
          before.plan,
          async (plan) => {
            if (kind === "file-scope") return { ...plan, files: plan.files.slice(1) };
            if (kind === "secret-scope")
              return {
                ...plan,
                secrets: [
                  ...plan.secrets,
                  {
                    kind: "generate-self-issued",
                    reference: "injected.secret",
                    environmentKey: "INJECTED_SECRET",
                    bytes: 32,
                    encoding: "hex",
                    destinations: [],
                  },
                ],
              };
            return {
              ...plan,
              files: plan.files.map((file) =>
                file.physicalPath === ".gitignore"
                  ? { ...file, content: `${file.content}\ninjected-unrelated-output\n` }
                  : file,
              ),
            };
          },
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  }
});
