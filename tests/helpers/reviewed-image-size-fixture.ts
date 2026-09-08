import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { supplyChain } from "../../packages/versions/src/index.js";
import {
  IMAGE_SIZE_PATCH_CONTENT,
  IMAGE_SIZE_PATCH_KEY,
  IMAGE_SIZE_PATCH_PATH,
} from "../../src/templates/tooling/dependency-audit.js";

export const reviewedImageSizeFixtureRoot = resolve(
  import.meta.dir,
  "../fixtures/dependency-audit/image-size-1.2.1",
);

interface ReviewedRelease {
  readonly package: string;
  readonly version: string;
  readonly integrity: string;
  readonly publishedAt: string;
  readonly auditedAt: string;
}

export function createReviewedImageSizeAuditFixture(root: string): string {
  const release = JSON.parse(
    readFileSync(resolve(reviewedImageSizeFixtureRoot, "provenance.json"), "utf8"),
  ) as ReviewedRelease;
  const patchedDependencies = { [IMAGE_SIZE_PATCH_KEY]: IMAGE_SIZE_PATCH_PATH };
  const lockSource = `${JSON.stringify({
    lockfileVersion: 2,
    workspaces: {},
    patchedDependencies,
    packages: { "image-size": [IMAGE_SIZE_PATCH_KEY, "", {}, release.integrity] },
  })}\n`;
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({
      private: true,
      dependencies: { "image-size": release.version },
      patchedDependencies,
    })}\n`,
  );
  writeFileSync(resolve(root, "bun.lock"), lockSource);
  writeFileSync(
    resolve(root, "bunfig.toml"),
    [
      "[install]",
      'registry = "https://registry.npmjs.org/"',
      `minimumReleaseAge = ${supplyChain.minimumReleaseAgeSeconds}`,
      "minimumReleaseAgeExcludes = []",
      "[install.lockfile]",
      'path = "bun.lock"',
      "",
    ].join("\n"),
  );
  writeFileSync(
    resolve(root, "dependency-lock-evidence.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      registry: "https://registry.npmjs.org",
      minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
      auditedAt: release.auditedAt,
      lockSha256: createHash("sha256").update(lockSource).digest("hex"),
      releases: [
        {
          package: release.package,
          version: release.version,
          publishedAt: release.publishedAt,
          integrity: release.integrity,
        },
      ],
    })}\n`,
  );
  mkdirSync(resolve(root, "patches"));
  writeFileSync(resolve(root, IMAGE_SIZE_PATCH_PATH), IMAGE_SIZE_PATCH_CONTENT);

  const installedRoot = resolve(root, "node_modules/image-size");
  mkdirSync(resolve(installedRoot, "dist/types"), { recursive: true });
  for (const path of ["package.json", "dist/types/icns.js", "dist/types/utils.js"]) {
    const fixtureName = `${path.slice(path.lastIndexOf("/") + 1)}.fixture`;
    copyFileSync(resolve(reviewedImageSizeFixtureRoot, fixtureName), resolve(installedRoot, path));
  }
  return installedRoot;
}
