/**
 * Verify every pinned dependency in packages/versions/src/index.ts actually
 * exists on the npm registry.
 *
 * This is a release/CI check rather than a unit test because it needs network
 * access. It exists because four pins had been invented and did not resolve
 * (posthog-js 1.233.2, posthog-node 4.20.1, @clack/prompts 0.8.3, and a `biome`
 * entry that pointed at an unrelated package), so `bun install` failed in every
 * generated project while the host build stayed green.
 *
 * Usage: bun run check:versions
 */

import * as v from "../packages/versions/src/index.js";
import { generateProjectFiles } from "../src/templates/default.js";
import type { ProjectConfig } from "../src/lib/config.js";

interface BadPin {
  group: string;
  pkg: string;
  version: string;
  highestSameMajor?: string;
  latest?: string;
}

/**
 * Keys that are local aliases rather than npm package names.
 * e.g. `typescriptLegacy` pins a second version of the `typescript` package.
 */
const KEY_ALIASES: Record<string, string> = {
  typescriptLegacy: "typescript",
};

async function fetchVersions(pkg: string): Promise<string[] | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { versions?: Record<string, unknown> };
    return Object.keys(body.versions ?? {});
  } catch {
    return null;
  }
}

/**
 * Dependency pins as they appear in the GENERATED package.json files.
 *
 * The SSOT check alone is not enough: a template can reuse one SSOT constant for
 * a different package name. That is how `nitropack: ^3.0.0` shipped — the SSOT
 * key is `nitro` (3.0.0 exists), but nitropack tops out at 2.13.4, so every
 * TanStack project failed to install.
 */
function generatedPins(): Array<[string, string, string]> {
  const base: ProjectConfig = {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve", "i18n"],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  } as ProjectConfig;

  const corners: ProjectConfig[] = [
    base,
    { ...base, framework: "tanstack-start" } as ProjectConfig,
    { ...base, database: "convex" } as ProjectConfig,
    { ...base, mode: "single" } as ProjectConfig,
    { ...base, mode: "single", framework: "tanstack-start" } as ProjectConfig,
    {
      ...base,
      billing: [],
      features: [],
      eve: false,
      database: "convex",
      deploy: "cloudflare",
    } as ProjectConfig,
    {
      ...base,
      billing: [],
      features: [],
      eve: false,
      database: "convex",
      framework: "tanstack-start",
      deploy: "cloudflare",
    } as ProjectConfig,
  ];

  const seen = new Map<string, [string, string, string]>();
  for (const config of corners) {
    for (const f of generateProjectFiles(config, { dryRun: false })) {
      if (!f.path.endsWith("package.json")) continue;
      let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        pkg = JSON.parse(f.content);
      } catch {
        continue;
      }
      for (const deps of [pkg.dependencies, pkg.devDependencies]) {
        for (const [name, range] of Object.entries(deps ?? {})) {
          if (typeof range !== "string") continue;
          if (range.startsWith("workspace:")) continue;
          const version = range.replace(/^[\^~]/, "");
          if (!/^\d/.test(version)) continue;
          const key = `${name}@${version}`;
          if (!seen.has(key)) seen.set(key, [`generated:${f.path}`, name, version]);
        }
      }
    }
  }
  return [...seen.values()];
}

async function main(): Promise<void> {
  const pins: Array<[string, string, string]> = [];
  for (const [group, value] of Object.entries(v as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    for (const [pkg, version] of Object.entries(value as Record<string, unknown>)) {
      // Skip workspace protocols and non-version strings.
      if (typeof version !== "string" || !/^\d/.test(version)) continue;
      pins.push([group, pkg, version]);
    }
  }

  // Also check what the generated projects actually ask npm for.
  const genPins = generatedPins();
  const seenKeys = new Set(pins.map(([, p, ver]) => `${p}@${ver}`));
  for (const entry of genPins) {
    const key = `${entry[1]}@${entry[2]}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      pins.push(entry);
    }
  }

  console.log(`Checking ${pins.length} pinned versions against the npm registry...`);
  const bad: BadPin[] = [];
  const unreachable: string[] = [];

  for (const [group, key, version] of pins) {
    const pkg = KEY_ALIASES[key] ?? key;
    const versions = await fetchVersions(pkg);
    if (!versions) {
      unreachable.push(pkg);
      continue;
    }
    if (versions.includes(version)) continue;
    const stable = versions.filter((x) => !x.includes("-"));
    const sameMajor = stable.filter((x) => x.split(".")[0] === version.split(".")[0]);
    bad.push({
      group,
      pkg,
      version,
      highestSameMajor: sameMajor.at(-1),
      latest: stable.at(-1),
    });
  }

  for (const b of bad) {
    console.error(
      `INVALID ${b.group}.${b.pkg}@${b.version} — highest same-major: ${b.highestSameMajor ?? "none"}, latest: ${b.latest ?? "unknown"}`,
    );
  }
  if (unreachable.length > 0) {
    console.warn(`Could not reach the registry for: ${unreachable.join(", ")}`);
  }

  if (bad.length > 0) {
    console.error(`\n${bad.length} invalid pin(s). Generated projects will fail to install.`);
    process.exit(1);
  }
  console.log(`All ${pins.length - unreachable.length} resolvable pins are valid.`);
}

await main();
