import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { expect } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { canonicalizeGenerationPlan } from "../../src/generation/plan-formatter.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

export const UNICODE_SAMPLE = "• Français العربية 🚀 e\u0301";

export async function verifyCliUnicode(
  executable: string,
  cli: string,
  temporaryRoot: string,
  label: string,
): Promise<void> {
  const parent = join(temporaryRoot, `${label} ${UNICODE_SAMPLE}`);
  mkdirSync(parent, { recursive: true });
  const result = spawnSync(
    executable,
    [
      cli,
      "create",
      "unicode-probe",
      "--cwd",
      parent,
      "--mode",
      "single",
      "--preset",
      "saas",
      "--runtime",
      "bun",
      "--database",
      "postgres",
      "--billing",
      "stripe",
      "--with-i18n",
      "--yes",
      "--no-install",
      "--quiet",
      "--json",
    ],
    { cwd: parent, encoding: "utf8", shell: false, windowsHide: true, timeout: 60_000 },
  );
  expect(result.error, label).toBeUndefined();
  expect(result.status, `${label}: ${result.stdout}\n${result.stderr}`).toBe(0);
  const projectRoot = join(parent, "unicode-probe");
  expect(JSON.parse(result.stdout)).toMatchObject({
    success: true,
    exitCode: 0,
    data: { projectRoot },
  });
  const resolution = resolveCreateConfig({
    name: "unicode-probe",
    runtime: "bun",
    mode: "single",
    framework: "nextjs",
    preset: "saas",
    database: "postgres",
    databaseWasExplicit: true,
    billing: ["stripe"],
    features: ["i18n"],
    apps: ["web"],
    cache: "none",
    deploy: "none",
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const expected = await canonicalizeGenerationPlan(
    buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    }),
  );
  for (const locale of ["en", "fr", "ar"]) {
    const path = `src/messages/${locale}.json`;
    const file = expected.files.find(({ physicalPath }) => physicalPath === path);
    if (!file) throw new Error(`Missing expected locale ${locale}`);
    const actual = readFileSync(join(projectRoot, path));
    expect(createHash("sha256").update(actual).digest("hex"), `${label}: ${path} UTF-8 bytes`).toBe(
      createHash("sha256").update(file.content, "utf8").digest("hex"),
    );
  }
}

export function removeUnicodeTestDirectory(path: string): void {
  const target = resolve(path);
  const descendant = relative(resolve(tmpdir()), target);
  if (
    !descendant ||
    descendant === ".." ||
    descendant.startsWith(`..${sep}`) ||
    isAbsolute(descendant)
  ) {
    throw new Error(
      `Refusing to remove a Unicode fixture outside the temporary directory: ${target}`,
    );
  }
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
