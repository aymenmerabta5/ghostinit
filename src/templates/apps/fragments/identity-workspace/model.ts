export type IdentityWorkspaceMode = "monorepo" | "single";

export function identityWorkspaceSourceRoot(mode: IdentityWorkspaceMode): string {
  return mode === "monorepo" ? "apps/web/src" : "src";
}

export function identityWorkspaceFeatureRoot(mode: IdentityWorkspaceMode): string {
  return `${identityWorkspaceSourceRoot(mode)}/features/identity-workspace`;
}

export function mobileSourceRoot(mode: IdentityWorkspaceMode): string {
  return mode === "monorepo" ? "apps/mobile" : "";
}

export function mobilePath(mode: IdentityWorkspaceMode, path: string): string {
  const root = mobileSourceRoot(mode);
  return root ? `${root}/${path}` : path;
}

export function desktopSourceRoot(mode: IdentityWorkspaceMode): string {
  return mode === "monorepo" ? "apps/desktop/src/renderer" : "src/renderer";
}

export function desktopPath(mode: IdentityWorkspaceMode, path: string): string {
  return `${desktopSourceRoot(mode)}/${path}`;
}
