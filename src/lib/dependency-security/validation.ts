import { ValidationError } from "../errors.js";

export const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export const ADVISORY_ID =
  /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/;
export const SHA512 = /^sha512-[A-Za-z0-9+/]{85}[AQgw]==$/;

export function invalid(message: string): never {
  throw new ValidationError(`Dependency security: ${message}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function record(
  value: unknown,
  label: string,
  keys?: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${label} must be an object`);
  if (
    keys &&
    (Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key)))
  ) {
    invalid(`${label} has missing or unsupported fields`);
  }
  return value;
}

/** JSON.parse checks grammar; this token walk additionally rejects duplicate keys. */
export function parseJson(source: string, label: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    invalid(`${label} is malformed JSON`);
  }
  const tokens = source.match(/"(?:[^"\\]|\\.)*"|[{}[\]:,]|[^\s{}[\]:,]+/g) ?? [];
  let cursor = 0;
  const visit = (depth: number): void => {
    if (depth > 64) invalid(`${label} exceeds the nesting limit`);
    const token = tokens[cursor++];
    if (token === "{") {
      const keys = new Set<string>();
      while (tokens[cursor] !== "}") {
        const key = JSON.parse(tokens[cursor++]) as string;
        if (keys.has(key)) invalid(`${label} contains a duplicate object key`);
        keys.add(key);
        cursor += 1;
        visit(depth + 1);
        if (tokens[cursor] === ",") cursor += 1;
      }
      cursor += 1;
    } else if (token === "[") {
      while (tokens[cursor] !== "]") {
        visit(depth + 1);
        if (tokens[cursor] === ",") cursor += 1;
      }
      cursor += 1;
    }
  };
  visit(0);
  return parsed;
}

export function packageName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 214 ||
    !PACKAGE_NAME.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    invalid("invalid package name");
  }
  return value;
}

export function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 50_000) invalid(`${label} must be a bounded array`);
  return value;
}

export function utcTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))
    invalid(`${label} must be a UTC timestamp`);
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")
  )
    invalid(`${label} is not a valid timestamp`);
  return new Date(time).toISOString();
}
