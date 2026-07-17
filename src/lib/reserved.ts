/**
 * Reserved/malformed names for GhostInit artefacts.
 *
 * These names collide with generated monorepo workspace packages, generated
 * infrastructure, or common filesystem patterns. They are rejected by all
 * `add` subcommands and by the project name validator.
 */

// Workspace package names that already exist in generated projects.
const WORKSPACE_PACKAGES = new Set([
  "api",
  "auth",
  "config",
  "contracts",
  "database",
  "kernel",
  "modules",
  "observability",
  "testing",
  "typescript-config",
  "ui",
  "web",
  "workflows",
]);

// Names reserved by generated infrastructure.
const GENERATED_NAMES = new Set([
  "identity",
  "health",
  "me",
  "openapi",
  "contract",
  "router",
  "context",
  "index",
]);

// Literal JavaScript/TypeScript reserved words plus ambient globals to avoid.
const LANGUAGE_RESERVED = new Set([
  "abstract",
  "any",
  "as",
  "asserts",
  "async",
  "await",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constructor",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "is",
  "keyof",
  "let",
  "module",
  "namespace",
  "never",
  "new",
  "null",
  "number",
  "object",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "set",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unique",
  "unknown",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export const INVALID_NAME_RE = /[^a-z0-9-]/;
export const VALID_NAME_RE = /^[a-z][a-z0-9-]*$/;

export function isReservedName(name: string): boolean {
  if (!name) return true;
  return WORKSPACE_PACKAGES.has(name) || GENERATED_NAMES.has(name) || LANGUAGE_RESERVED.has(name);
}

export function validateArtifactName(
  name: string,
  context: string,
): { valid: true } | { valid: false; reason: string } {
  if (!name) {
    return { valid: false, reason: `${context}: name is required` };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return {
      valid: false,
      reason: `${context}: "${name}" must not start or end with a hyphen`,
    };
  }
  if (name.includes("--")) {
    return {
      valid: false,
      reason: `${context}: "${name}" must not contain consecutive hyphens`,
    };
  }
  if (INVALID_NAME_RE.test(name)) {
    return {
      valid: false,
      reason: `${context}: "${name}" may only contain lowercase letters, numbers, and hyphens`,
    };
  }
  if (!VALID_NAME_RE.test(name)) {
    return {
      valid: false,
      reason: `${context}: "${name}" must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens`,
    };
  }
  if (isReservedName(name)) {
    return {
      valid: false,
      reason: `${context}: "${name}" is a reserved name`,
    };
  }
  return { valid: true };
}
