const DOTENV_LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

export const MAX_DOTENV_FILE_BYTES = 1024 * 1024;
export const CLOUDFLARE_ENVIRONMENT_LOCK_FILE = ".dev.vars.ghostinit-build-lock";
export const CLOUDFLARE_HIDDEN_ENVIRONMENT_FILE = ".dev.vars.ghostinit-build-hidden";

export interface DotenvField {
  key: string;
  value: string;
}

export function isDotenvDocumentationFileName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === ".env.example" ||
    normalized === ".env.template" ||
    /^\.env\.(?:[^.]+\.)+(?:example|template)$/.test(normalized)
  );
}

/**
 * Return whether a directory entry can be loaded as a runtime dotenv file.
 * Documentation-only example/template variants are deliberately excluded.
 */
export function isRuntimeDotenvFileName(name: string): boolean {
  const normalized = name.toLowerCase();
  if (!/^\.env(?:$|\.)/.test(normalized)) return false;
  return !isDotenvDocumentationFileName(normalized);
}

/** Parse dotenv fields with the same quote and newline semantics used at runtime. */
export function parseDotenvAssignments(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  const normalized = content.replace(/\r\n?/g, "\n");
  DOTENV_LINE.lastIndex = 0;
  for (const match of normalized.matchAll(DOTENV_LINE)) {
    const key = match[1];
    if (!key) continue;
    let value = (match[2] ?? "").trim();
    const quote = value[0];
    value = value.replace(/^(['"`])([\s\S]*)\1$/m, "$2");
    if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    fields.set(key, value);
  }
  return fields;
}

export function parseDotenvLine(line: string): DotenvField | undefined {
  const first = parseDotenvAssignments(line).entries().next();
  if (first.done) return undefined;
  return { key: first.value[0], value: first.value[1] };
}

export function canonicalDotenvFields(content: string): string {
  return JSON.stringify(
    [...parseDotenvAssignments(content)].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function dotenvFieldsEqual(left: string, right: string): boolean {
  return canonicalDotenvFields(left) === canonicalDotenvFields(right);
}
