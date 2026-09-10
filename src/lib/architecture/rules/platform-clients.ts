/** Single Expo root routes are clients; the supported app/api transport stays server-owned. */
export function isSingleExpoClientFile(file: string, dependencies: ReadonlySet<string>): boolean {
  const path = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return (
    (dependencies.has("expo") || dependencies.has("react-native")) &&
    path.startsWith("app/") &&
    !path.startsWith("app/api/")
  );
}
