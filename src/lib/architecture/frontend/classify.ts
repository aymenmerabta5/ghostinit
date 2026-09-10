import { DEFAULT_FRONTEND_OWNERSHIP_POLICY } from "./policy.js";
import type { FrontendOwnershipPolicy, FrontendRole } from "./types.js";

export function normalizeFrontendPath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function isFrontendIdentityModelFile(file: string): boolean {
  return /^(?:apps\/[^/]+\/)?src\/(?:renderer\/)?lib\/auth-(?:model|validation)\.[cm]?[jt]s$/.test(
    normalizeFrontendPath(file),
  );
}

export function classifyFrontendFile(
  file: string,
  _source?: string,
  policy: FrontendOwnershipPolicy = DEFAULT_FRONTEND_OWNERSHIP_POLICY,
): FrontendRole {
  const path = normalizeFrontendPath(file);
  if (
    !/\.[cm]?[jt]sx?$/.test(path) ||
    /(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/.test(path)
  )
    return "other";
  if (path.startsWith("packages/ui/src/")) return "primitive";
  const app = path.replace(/^apps\/[^/]+\//, "");
  if (policy.infrastructure.includes(app)) return "infrastructure";
  if (isFrontendIdentityModelFile(path)) return "model";
  if (/^src\/(?:renderer\/)?(?:platform\/ui|components\/ui|components\/form-fields)\//.test(app))
    return "primitive";
  const feature = /^src\/(?:renderer\/)?features\/[^/]+\/(.+)$/.exec(app)?.[1];
  if (feature) {
    if (feature.startsWith("components/")) return "view";
    if (/^(?:queries|mutations)\.[cm]?[jt]s$/.test(feature)) return "adapter";
    if (/^use-[^/]+\.[cm]?[jt]s$/.test(feature)) return "workflow";
    if (!feature.includes("/") && /\.[jt]sx$/.test(feature)) return "composition";
    return "model";
  }
  if (/^(?:src\/)?app\/api\/|^src\/routes\/api(?:[/.]|$)/.test(app)) return "other";
  if (/^(?:(?:src\/)?app\/|src\/routes\/)/.test(app)) return "route";
  if (/^src\/(?:renderer\/)?components\//.test(app)) return "view";
  if (/^src\/(?:renderer\/)?(?:App|main|index)\.[jt]sx$/.test(app)) return "route";
  return "other";
}

export function isRemoteImport(specifier: string): boolean {
  const path = normalizeFrontendPath(specifier);
  return (
    /^(?:@tanstack\/react-query|@apollo\/client|@orpc\/|axios(?:\/|$)|better-auth(?:\/|$)|convex(?:\/|$)|graphql-request(?:\/|$)|got(?:\/|$)|ky(?:\/|$)|swr(?:\/|$)|undici(?:\/|$)|urql(?:\/|$))/.test(
      path,
    ) ||
    /(?:^|\/)lib\/(?:orpc|api-client|auth-client|query-client|realtime)(?:\.[cm]?[jt]sx?)?$/.test(
      path,
    ) ||
    path.includes("convex/_generated/api")
  );
}

export function isFormImport(specifier: string): boolean {
  return /^(?:@tanstack\/react-form|react-hook-form|formik|@formkit\/)(?:\/|$)?/.test(specifier);
}

export function importedFeatureRole(specifier: string, target?: string): FrontendRole {
  if (target) return classifyFrontendFile(target);
  const path = normalizeFrontendPath(specifier);
  if (/(?:^|\/)(?:queries|mutations)(?:\.[cm]?[jt]sx?)?$/.test(path)) return "adapter";
  if (/(?:^|\/)use-[^/]+(?:\.[cm]?[jt]s)?$/.test(path)) return "workflow";
  return "other";
}
