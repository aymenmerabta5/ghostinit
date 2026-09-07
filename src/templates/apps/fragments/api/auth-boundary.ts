/**
 * Generated auth routes keep Better Auth plugins for schema and safe read APIs,
 * but the public catch-all must never expose parallel admin or organization
 * mutation surfaces. Those writes belong to typed oRPC identity services, where
 * actor, fresh-session, permission, audit, and last-owner invariants are enforced.
 */
export function authRouteBoundaryCode(trustedCloudflareRuntime = false): string {
  return `const TRUSTED_CLOUDFLARE_RUNTIME = ${trustedCloudflareRuntime};
// Match OpenNext's protected error-response policy for auth boundary rejections.
const AUTH_REJECTION_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

function normalizedAuthPath(request: Request): string | null {
  try {
    let pathname = new URL(request.url).pathname;
    for (let index = 0; index < 4; index += 1) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
    if (pathname.includes("%")) return null;
    pathname = pathname.split(String.fromCharCode(92)).join("/");
    return "/" + pathname.split("/").filter(Boolean).join("/").toLowerCase();
  } catch {
    return null;
  }
}

const SAFE_DIRECT_ORGANIZATION_READ_PATHS = new Set([
  "/api/auth/organization/check-slug",
  "/api/auth/organization/get-active-member",
  "/api/auth/organization/get-active-member-role",
  "/api/auth/organization/get-full-organization",
  "/api/auth/organization/get-invitation",
  "/api/auth/organization/get-role",
  "/api/auth/organization/has-permission",
  "/api/auth/organization/list",
  "/api/auth/organization/list-invitations",
  "/api/auth/organization/list-members",
  "/api/auth/organization/list-roles",
  "/api/auth/organization/list-team-members",
  "/api/auth/organization/list-teams",
  "/api/auth/organization/list-user-invitations",
  "/api/auth/organization/list-user-teams",
]);

function rejectDirectPrivilegedAuthRequest(request: Request): Response | null {
  const pathname = normalizedAuthPath(request);
  const isAdmin =
    pathname === null ||
    pathname === "/api/auth/admin" ||
    pathname.startsWith("/api/auth/admin/");
  const isOrganization =
    pathname === null ||
    pathname === "/api/auth/organization" ||
    pathname.startsWith("/api/auth/organization/");
  if (!isAdmin && !isOrganization) return null;
  if (pathname !== null && isOrganization && SAFE_DIRECT_ORGANIZATION_READ_PATHS.has(pathname)) {
    return null;
  }
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": AUTH_REJECTION_CACHE_CONTROL },
  });
}

type PreparedAuthRequest =
  | { readonly request: Request; readonly rejection: null }
  | { readonly request: null; readonly rejection: Response };

function isValidAuthIpv4Address(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\\d{1,3}$/.test(part) &&
        (part === "0" || !part.startsWith("0")) &&
        Number(part) >= 0 &&
        Number(part) <= 255,
    )
  );
}

function isValidAuthIpLiteral(value: string): boolean {
  if (!value || value !== value.trim() || value.includes(",")) return false;
  if (isValidAuthIpv4Address(value)) return true;
  if (!value.includes(":") || /[^0-9a-fA-F:.]/.test(value)) return false;
  try {
    return new URL(\`http://[\${value}]/\`).hostname.length > 2;
  } catch {
    return false;
  }
}

function localCloudflareAuthClientIp(request: Request): string | null {
  try {
    const url = new URL(request.url);
    if (url.protocol !== "http:") return null;
    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      (hostname.startsWith("127.") && isValidAuthIpv4Address(hostname))
    ) {
      return "127.0.0.1";
    }
  } catch {}
  return null;
}

function prepareAuthRequestForRuntime(request: Request): PreparedAuthRequest {
  // OpenNext converts the incoming Worker Request into a plain Next Request and
  // does not preserve request.cf. Trust therefore comes only from this generated
  // deploy-target constant, never from client headers or ad-hoc request fields.
  if (!TRUSTED_CLOUDFLARE_RUNTIME) return { request, rejection: null };

  // Framework dev and local Wrangler preview do not always add Cloudflare edge
  // headers. A strict HTTP loopback URL gets a fixed loopback identity; every
  // non-loopback deployment must provide Cloudflare's single client-IP header.
  const clientIp =
    localCloudflareAuthClientIp(request) ?? request.headers.get("cf-connecting-ip");
  if (!clientIp || !isValidAuthIpLiteral(clientIp)) {
    return {
      request: null,
      rejection: new Response("Invalid Cloudflare client address", {
        status: 400,
        headers: { "Cache-Control": AUTH_REJECTION_CACHE_CONTROL },
      }),
    };
  }

  // @convex-dev/better-auth forwards X-Forwarded-For to Convex unchanged. Never
  // let a client-supplied chain become the database-backed rate-limit identity.
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-for", clientIp);
  return { request: new Request(request, { headers }), rejection: null };
}`;
}
