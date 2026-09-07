import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function eveFacadePolicyFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  return file(
    `${base}/policy.ts`,
    `export const MAX_EVE_JSON_BYTES = 25 * 1024 * 1024;

export type EveFacadeRouteKind =
  | "info"
  | "create"
  | "follow"
  | "cancel"
  | "compact"
  | "clear"
  | "reset"
  | "stream";

export type EveFacadeRoute = {
  readonly kind: EveFacadeRouteKind;
  readonly method: "GET" | "POST";
  readonly sessionId: string | null;
  readonly upstreamPath: string;
  readonly search: string;
};

export type EveRouteDecision =
  | { readonly ok: true; readonly route: EveFacadeRoute }
  | { readonly ok: false; readonly status: 404 | 405 };

const FACADE_PREFIX = "/api/agent";
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CONTROLS = ["cancel", "compact", "clear", "reset"] as const;

function isControl(value: string): value is (typeof CONTROLS)[number] {
  return CONTROLS.some((control) => control === value);
}

function validStreamSearch(searchParams: URLSearchParams): boolean {
  const counts = new Map<string, number>();
  for (const [key, value] of searchParams) {
    if (key !== "startIndex" && key !== "includeTailIndex") return false;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if ((counts.get(key) ?? 0) > 1) return false;
    if (key === "startIndex") {
      if (!/^-?[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value))) return false;
    }
    if (key === "includeTailIndex" && value !== "1" && value !== "true") return false;
  }
  return true;
}

function decisionForMethod(
  actual: string,
  expected: "GET" | "POST",
  route: Omit<EveFacadeRoute, "method">,
): EveRouteDecision {
  return actual === expected
    ? { ok: true, route: { ...route, method: expected } }
    : { ok: false, status: 405 };
}

export function classifyEveFacadeRequest(request: Request): EveRouteDecision {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(FACADE_PREFIX + "/")) return { ok: false, status: 404 };
  const upstreamPath = url.pathname.slice(FACADE_PREFIX.length);
  const segments = upstreamPath.split("/").filter(Boolean);
  if (segments[0] !== "eve" || segments[1] !== "v1") return { ok: false, status: 404 };

  if (segments.length === 3 && segments[2] === "info") {
    if (upstreamPath !== "/eve/v1/info") return { ok: false, status: 404 };
    if (url.search.length > 0) return { ok: false, status: 404 };
    return decisionForMethod(request.method, "GET", {
      kind: "info",
      search: "",
      sessionId: null,
      upstreamPath,
    });
  }
  if (segments.length === 3 && segments[2] === "session") {
    if (upstreamPath !== "/eve/v1/session") return { ok: false, status: 404 };
    if (url.search.length > 0) return { ok: false, status: 404 };
    return decisionForMethod(request.method, "POST", {
      kind: "create",
      search: "",
      sessionId: null,
      upstreamPath,
    });
  }
  if (segments.length < 4 || segments[2] !== "session") return { ok: false, status: 404 };
  const sessionId = segments[3] ?? "";
  if (!SESSION_ID_PATTERN.test(sessionId) || sessionId.includes("%")) {
    return { ok: false, status: 404 };
  }
  if (segments.length === 4) {
    if (upstreamPath !== "/eve/v1/session/" + sessionId) return { ok: false, status: 404 };
    if (url.search.length > 0) return { ok: false, status: 404 };
    return decisionForMethod(request.method, "POST", {
      kind: "follow",
      search: "",
      sessionId,
      upstreamPath,
    });
  }
  if (segments.length !== 5) return { ok: false, status: 404 };
  const operation = segments[4] ?? "";
  if (upstreamPath !== "/eve/v1/session/" + sessionId + "/" + operation) {
    return { ok: false, status: 404 };
  }
  if (operation === "stream") {
    if (!validStreamSearch(url.searchParams)) return { ok: false, status: 404 };
    return decisionForMethod(request.method, "GET", {
      kind: "stream",
      search: url.search,
      sessionId,
      upstreamPath,
    });
  }
  if (!isControl(operation) || url.search.length > 0) return { ok: false, status: 404 };
  return decisionForMethod(request.method, "POST", {
    kind: operation,
    search: "",
    sessionId,
    upstreamPath,
  });
}

function exactOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function configuredBrowserOrigin(): string | null {
  const value = process.env.BETTER_AUTH_URL?.trim();
  return value ? exactOrigin(value) : null;
}

export function hasTrustedBrowserOrigin(request: Request, expectedOrigin: string): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (request.method === "POST") {
    return origin !== null && origin !== "null" && exactOrigin(origin) === expectedOrigin;
  }
  if (origin !== null) return origin !== "null" && exactOrigin(origin) === expectedOrigin;
  if (referer !== null) return exactOrigin(referer) === expectedOrigin;
  return fetchSite === "same-origin";
}
`,
  );
}
