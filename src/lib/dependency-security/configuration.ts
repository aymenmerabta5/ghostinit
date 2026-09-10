import type { DependencySecurityPolicy } from "./runtime-types.js";
import { invalid, isRecord, packageName, record } from "./validation.js";

/** Accept the explicit public install profile; reject executable or private configuration. */
export function validateSecurityBunfig(source: string, policy: DependencySecurityPolicy): void {
  let section = "";
  const settings = new Map<string, string>();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[(install(?:\.lockfile|\.scopes)?)\]$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const assignment = /^([A-Za-z][A-Za-z0-9]*|"@[^"\\]*")\s*=\s*(.*?)\s*(?:\s+#.*)?$/.exec(line);
    if (!assignment || !section) invalid("bunfig.toml contains unsupported install configuration");
    const key = `${section}.${assignment[1]}`;
    if (settings.has(key)) invalid("bunfig.toml repeats an install setting");
    settings.set(key, assignment[2]);
    if (section === "install.scopes") {
      if (
        !/^"@[a-zA-Z0-9*._-]+"$/.test(assignment[1]) ||
        !/^\{\s*url\s*=\s*"https:\/\/registry\.npmjs\.org\/?"\s*\}$/.test(assignment[2])
      )
        invalid("Bun registry scopes must use the public npm registry without credentials");
    } else if (section === "install.lockfile") {
      if (assignment[1] !== "path" || assignment[2] !== '"bun.lock"')
        invalid("Bun must use the regular root bun.lock");
    } else {
      const allowed: Record<string, RegExp> = {
        registry: /^"https:\/\/registry\.npmjs\.org\/?"$/,
        hoist: /^(true|false)$/,
        linker: /^"(isolated|hoisted)"$/,
        frozenLockfile: /^(true|false)$/,
        minimumReleaseAge: /^\d+$/,
        minimumReleaseAgeExcludes: /^\[\s*\]$/,
      };
      if (!Object.hasOwn(allowed, assignment[1]) || !allowed[assignment[1]].test(assignment[2]))
        invalid("bunfig.toml contains unsupported install configuration");
    }
  }
  if (
    !settings.has("install.registry") ||
    Number(settings.get("install.minimumReleaseAge")) !== policy.minimumReleaseAgeSeconds ||
    !settings.has("install.minimumReleaseAgeExcludes") ||
    settings.get("install.lockfile.path") !== '"bun.lock"'
  )
    invalid("bunfig.toml does not enforce the public-registry, release-age, and root-lock policy");
}

export function validateManifestDependencies(manifest: Record<string, unknown>): void {
  const declarations: Record<string, unknown>[] = [];
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "overrides",
    "catalog",
  ]) {
    if (manifest[field] !== undefined)
      declarations.push(record(manifest[field], `${field} declarations`));
  }
  if (manifest.catalogs !== undefined)
    declarations.push(
      ...Object.values(record(manifest.catalogs, "catalogs")).map((value) =>
        record(value, "catalog"),
      ),
    );
  if (isRecord(manifest.workspaces)) {
    if (manifest.workspaces.catalog !== undefined)
      declarations.push(record(manifest.workspaces.catalog, "workspace catalog"));
    if (manifest.workspaces.catalogs !== undefined)
      declarations.push(
        ...Object.values(record(manifest.workspaces.catalogs, "workspace catalogs")).map((value) =>
          record(value, "workspace catalog"),
        ),
      );
  }
  for (const fields of declarations) {
    for (const [name, spec] of Object.entries(fields)) {
      packageName(name);
      if (
        typeof spec !== "string" ||
        spec.length > 512 ||
        /\s/.test(spec) ||
        [...spec].some((character) => character.charCodeAt(0) <= 31) ||
        !/^(?:[~^<>=*0-9]|workspace:|catalog:|npm:)/.test(spec) ||
        /(?:file:|link:|git:|https?:|ssh:|\\)/i.test(spec)
      )
        invalid(
          "dependency declarations must resolve through the public registry or declared workspaces/catalogs",
        );
    }
  }
}
