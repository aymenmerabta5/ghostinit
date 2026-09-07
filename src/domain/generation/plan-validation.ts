export const GENERATION_PLAN_ERROR_CODES = [
  "invalid-project-config-hash",
  "invalid-plan-path",
  "duplicate-physical-path",
  "invalid-file-owner",
  "invalid-file-lifecycle",
  "invalid-provenance",
  "missing-capability-operation-evidence",
  "missing-client-surface-artifact",
  "duplicate-secret-reference",
  "duplicate-secret-destination",
  "invalid-secret-operation",
  "secret-value-forbidden",
] as const;

export type GenerationPlanErrorCode = (typeof GENERATION_PLAN_ERROR_CODES)[number];

export class GenerationPlanError extends Error {
  readonly code: GenerationPlanErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(
    code: GenerationPlanErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "GenerationPlanError";
    this.code = code;
    this.details = details;
  }
}

export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function requireHash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new GenerationPlanError(
      "invalid-project-config-hash",
      "projectConfigHash must be a lowercase SHA-256 digest",
      { projectConfigHash: value },
    );
  }
}

export function requirePlanPath(value: string, label: string): string {
  const segments = value.split("/");
  const invalid =
    value.length === 0 ||
    value !== value.trim() ||
    value !== value.normalize("NFC") ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[a-zA-Z]:/.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..");
  if (invalid) {
    throw new GenerationPlanError(
      "invalid-plan-path",
      `${label} must be a canonical relative path`,
      { [label]: value },
    );
  }
  return value;
}

export function collisionKey(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

export function requireIdentifier(value: string, label: string): string {
  if (!/^[a-z0-9][a-z0-9./:_-]*$/.test(value)) {
    throw new GenerationPlanError(
      "invalid-provenance",
      `${label} must be a nonempty namespaced identifier`,
      { [label]: value },
    );
  }
  return value;
}

export function normalizeIdentifiers(values: readonly string[], label: string): string[] {
  return [...new Set(values.map((value) => requireIdentifier(value, label)))].sort(compareText);
}
