/** Only selected application audiences can attest that a project token is public. */
export function selectedPosthogPublicKeys(
  framework: "nextjs" | "tanstack-start",
  apps: readonly string[],
): string[] {
  return [
    ...new Set([
      ...(apps.includes("web")
        ? [framework === "nextjs" ? "NEXT_PUBLIC_POSTHOG_KEY" : "VITE_POSTHOG_KEY"]
        : []),
      ...(apps.includes("mobile") ? ["EXPO_PUBLIC_POSTHOG_KEY"] : []),
      ...(apps.includes("desktop") ? ["VITE_POSTHOG_KEY"] : []),
    ]),
  ];
}

/**
 * Intentionally self-contained: the Worker emitter embeds this function's JS
 * source, while the independent release runner uses the same narrow policy.
 * Personal (phx_), project-secret (phs_), and unknown tokens remain private.
 */
export function isPublicPosthogProjectToken(
  key: string,
  value: string | undefined,
  selectedPublicKeys: readonly string[],
  declaredKeys: ReadonlySet<string>,
  entries: readonly (readonly [string, string | undefined])[],
): boolean {
  return (
    key === "POSTHOG_API_KEY" &&
    typeof value === "string" &&
    value.trim() === value &&
    /^phc_[A-Za-z0-9]{16,200}$/.test(value) &&
    entries.some(
      ([publicKey, publicValue]) =>
        selectedPublicKeys.includes(publicKey) &&
        declaredKeys.has(publicKey) &&
        publicValue === value,
    )
  );
}
