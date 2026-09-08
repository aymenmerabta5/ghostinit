export interface ModulePath {
  name: string;
  relativePath: string;
}

export function moduleFromPath(path: string): ModulePath | null {
  const normalized = path.replace(/\\/g, "/");
  const match =
    /(?:^|\/)(?:packages\/modules\/src|src\/server\/modules)\/([a-z0-9-]+)(?:\/(.*))?$/.exec(
      normalized,
    );
  if (!match) return null;
  return { name: match[1]!, relativePath: match[2] ?? "" };
}

export function moduleFromImport(specifier: string): string | null {
  return (
    /^@(?:repo\/modules|\/server\/modules)\/([a-z0-9-]+)(?:\/|$)/.exec(
      specifier.replace(/\\/g, "/"),
    )?.[1] ?? null
  );
}
