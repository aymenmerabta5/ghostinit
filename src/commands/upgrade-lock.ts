import { canonicalJson } from "../domain/project/canonical.js";
import { ConflictError } from "../lib/errors.js";
import { FsTransaction } from "../lib/fs.js";
import type { ReconcilePlan } from "../lib/reconcile.js";

const DEPENDENCY_FIELDS = [
  "name",
  "version",
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "overrides",
  "resolutions",
  "workspaces",
  "catalog",
  "catalogs",
  "patchedDependencies",
  "trustedDependencies",
  "packageManager",
  "engines",
  "os",
  "cpu",
] as const;

function manifestPath(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

function installPolicyPath(path: string): boolean {
  return path === "bunfig.toml" || path.startsWith("patches/");
}

function dependencyProjection(content: string, path: string): string {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new ConflictError("Upgrade dependency metadata is not valid JSON", { path });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConflictError("Upgrade dependency metadata must be an object", { path });
  }
  const manifest = value as Record<string, unknown>;
  return canonicalJson(
    Object.fromEntries(
      DEPENDENCY_FIELDS.filter((key) => Object.hasOwn(manifest, key)).map((key) => [
        key,
        manifest[key],
      ]),
    ),
  );
}

/** Reconcile only when the accepted source upgrade changes package-manager inputs. */
export async function upgradeRequiresLockReconciliation(
  root: string,
  plan: Pick<ReconcilePlan, "creates" | "moves" | "rewrites" | "deletions">,
): Promise<boolean> {
  for (const change of [...plan.creates, ...plan.moves, ...plan.deletions]) {
    if (
      [change.path, ...(change.fromPath ? [change.fromPath] : [])].some(
        (path) => manifestPath(path) || installPolicyPath(path),
      )
    )
      return true;
  }
  const reader = new FsTransaction(root);
  for (const change of plan.rewrites) {
    if (installPolicyPath(change.path)) return true;
    if (!manifestPath(change.path)) continue;
    const previous = await reader.readText(change.path);
    if (previous === undefined || change.content === undefined) {
      throw new ConflictError("Upgrade dependency metadata changed during planning", {
        path: change.path,
      });
    }
    if (
      dependencyProjection(previous, change.path) !==
      dependencyProjection(change.content, change.path)
    )
      return true;
  }
  return false;
}
