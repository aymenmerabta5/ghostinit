/** Deliberately bounded stable npm ranges accepted for automatic maintenance. */
export const SECURITY_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface SecurityVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function securityVersion(value: string): SecurityVersion | null {
  const match = SECURITY_VERSION_PATTERN.exec(value);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch };
}

export function compareSecurityVersions(left: string, right: string): number {
  const a = securityVersion(left);
  const b = securityVersion(right);
  if (!a || !b) throw new Error("Security version comparison requires stable exact versions");
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function securityRangeBase(spec: string): string | null {
  const value = spec.replace(/^[~^]/, "");
  return securityVersion(value) ? value : null;
}

/** Exact pins may advance within their caret-compatible release family. */
export function isCompatibleSecurityVersion(spec: string, selected: string): boolean {
  const base = securityRangeBase(spec);
  if (base === null) return false;
  const a = securityVersion(base);
  const b = securityVersion(selected);
  if (!a || !b || compareSecurityVersions(selected, base) < 0) return false;
  if (spec.startsWith("~")) return a.major === b.major && a.minor === b.minor;
  if (a.major !== 0) return a.major === b.major;
  if (a.minor !== 0) return b.major === 0 && a.minor === b.minor;
  return b.major === 0 && b.minor === 0 && a.patch === b.patch;
}
