export interface IdentityWorkspaceWebI18n {
  readonly importLine: string;
  readonly hookLine: string;
  child(key: string): string;
  value(key: string): string;
}

/** Compose typed workspace copy while keeping the disabled runtime English-only. */
export function identityWorkspaceWebI18n(enabled: boolean): IdentityWorkspaceWebI18n {
  const modeComment = enabled
    ? "// Workspace copy follows the active runtime locale."
    : "// Workspace copy resolves from the English-only fallback catalog.";
  return {
    importLine: `${modeComment}\nimport { useSurfaceTranslations } from "@/lib/translations";`,
    hookLine: '  const t = useSurfaceTranslations("workspace");',
    child: (key) => `{t(${JSON.stringify(key)})}`,
    value: (key) => `t(${JSON.stringify(key)})`,
  };
}
