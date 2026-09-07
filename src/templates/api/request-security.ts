/**
 * Framework-neutral CSRF boundary for generated oRPC HTTP ingress.
 *
 * The generated route calls this before session lookup or oRPC body parsing.
 * Keep the policy independent of Next.js, TanStack Start, and oRPC so every
 * HTTP adapter applies exactly the same decision.
 */
export function orpcRequestSecurityContent(): string {
  return `const UNSAFE_ORPC_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CONFIGURED_ORIGIN_ENV_KEYS = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_API_URL",
  "VITE_APP_URL",
  "VITE_API_URL",
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_API_URL",
  "DESKTOP_API_URL",
] as const;
const NATIVE_CSRF_CLIENTS = new Set(["expo", "desktop"]);
const BEARER_AUTHORIZATION = /^Bearer [A-Za-z0-9._~+/-]+=*$/i;

function configuredHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function requestHeaderOrigin(value: string | null): string | null {
  if (value === null || value.trim().toLowerCase() === "null") return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "" && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function trustedHttpOrigins(request: Request): ReadonlySet<string> {
  const origins = new Set<string>();
  const requestOrigin = configuredHttpOrigin(request.url);
  if (requestOrigin) origins.add(requestOrigin);
  for (const name of CONFIGURED_ORIGIN_ENV_KEYS) {
    const origin = configuredHttpOrigin(process.env[name]);
    if (origin) origins.add(origin);
  }
  return origins;
}

function forbiddenOrpcRequest(): Response {
  return Response.json(
    { error: "Forbidden" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function hasNativeCsrfSignal(request: Request): boolean {
  const value = request.headers.get("x-ghostinit-native-client");
  return value !== null && NATIVE_CSRF_CLIENTS.has(value);
}

/**
 * Reject unsafe browser requests before authentication or body deserialization.
 *
 * The native marker is a non-simple CSRF signal, never authentication. It is
 * accepted only for generated Expo/Electron cookie clients whose fetch stack
 * supplies no trustworthy browser Origin/Fetch-Metadata. The session cookie is
 * still independently authenticated by the application context.
 */
export function rejectUnsafeOrpcRequest(request: Request): Response | null {
  if (!UNSAFE_ORPC_METHODS.has(request.method.toUpperCase())) return null;

  const cookie = request.headers.get("cookie");
  const hasCookie = cookie !== null && cookie.trim().length > 0;
  const authorization = request.headers.get("authorization");
  const fetchSiteHeader = request.headers.get("sec-fetch-site");
  const fetchSite = fetchSiteHeader?.trim().toLowerCase() ?? null;
  const originHeader = request.headers.get("origin");
  const origin = requestHeaderOrigin(originHeader);
  const originIsMissingOrOpaque =
    originHeader === null || originHeader.trim().toLowerCase() === "null";

  // Only the supported Bearer grammar is eligible for a cookie-free native or
  // server client. Merely adding an Authorization header must never make a
  // victim session cookie bypass the browser boundary.
  if (authorization !== null && !BEARER_AUTHORIZATION.test(authorization)) {
    return forbiddenOrpcRequest();
  }

  if (hasCookie) {
    // Cookie mutations are same-origin only when browser metadata is present.
    // In particular, "same-site" is not equivalent to "same-origin": lax
    // cookies can be sent by a hostile sibling subdomain.
    if (fetchSiteHeader !== null && fetchSite !== "same-origin") {
      return forbiddenOrpcRequest();
    }

    if (origin !== null && trustedHttpOrigins(request).has(origin)) return null;

    // React Native and packaged Electron do not consistently expose a usable
    // Origin. Their generated clients attach this non-simple header. There is
    // deliberately no permissive CORS/OPTIONS handler, so a sibling website
    // cannot add the marker through a simple form submission.
    if (
      originIsMissingOrOpaque &&
      fetchSiteHeader === null &&
      hasNativeCsrfSignal(request)
    ) {
      return null;
    }

    return forbiddenOrpcRequest();
  }

  // A browser-originated unauthenticated/Bearer mutation still cannot come
  // from a foreign site. Requests with no browser metadata are left for the
  // procedure's ordinary authentication/authorization policy.
  if (fetchSiteHeader !== null && fetchSite !== "same-origin") {
    return forbiddenOrpcRequest();
  }
  if (originHeader !== null) {
    if (origin === null || !trustedHttpOrigins(request).has(origin)) {
      return forbiddenOrpcRequest();
    }
  }
  return null;
}
`;
}
