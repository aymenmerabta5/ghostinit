/**
 * Generated auth routes keep Better Auth plugins for schema and safe read APIs,
 * but the public catch-all must never expose parallel admin or organization
 * mutation surfaces. Those writes belong to typed oRPC identity services, where
 * actor, fresh-session, permission, audit, and last-owner invariants are enforced.
 */
export const authRouteBoundaryCode = `function normalizedAuthPath(request: Request): string | null {
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
    headers: { "Cache-Control": "private, no-store" },
  });
}`;
