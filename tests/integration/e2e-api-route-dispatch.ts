import { expect } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

const AUTH_REJECTION_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

/** Exercise the installed framework router, before any database or vendor work. */
export async function verifyNestedProductionApiRoutes(origin: string): Promise<void> {
  const authPath = "/api/auth/admin/list-users";
  const auth = await fetch(new URL(authPath, origin), {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  try {
    expect(auth.status, `${authPath}: auth boundary status`).toBe(404);
    expect(auth.headers.get("cache-control"), `${authPath}: auth boundary cache policy`).toBe(
      AUTH_REJECTION_CACHE_CONTROL,
    );
    expect(await auth.text(), `${authPath}: auth boundary body`).toBe("Not found");
  } finally {
    if (!auth.bodyUsed) await auth.body?.cancel();
  }

  // Both adapters reject the foreign browser origin before resolving a procedure,
  // reading its body, authenticating a session, or contacting a database.
  for (const path of [
    "/api/rpc/identity/sessions/revokeOthers",
    "/api/identity/sessions/revoke-others",
  ]) {
    const response = await fetch(new URL(path, origin), {
      method: "POST",
      headers: { origin: "https://ghostinit-cross-origin.invalid" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    try {
      expect(response.status, `${path}: transport boundary status`).toBe(403);
      expect(response.headers.get("x-content-type-options"), `${path}: content policy`).toBe(
        "nosniff",
      );
      expect(
        response.headers
          .get("cache-control")
          ?.split(",")
          .map((part) => part.trim().toLowerCase()),
        `${path}: forbidden response must not be cached`,
      ).toContain("no-store");
      expect(await response.json(), `${path}: transport boundary body`).toEqual({
        error: "Forbidden",
      });
    } finally {
      if (!response.bodyUsed) await response.body?.cancel();
    }
  }

  // A generic OpenAPI catch-all can also return the CSRF rejection above. Real
  // anonymous reads prove each protocol reaches its own application operation.
  const client = createORPCClient<{
    identity: { organizations: { list(input: Record<string, never>): Promise<unknown> } };
  }>(
    new RPCLink({
      url: new URL("/api/rpc", origin).href,
      headers: { origin },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        }),
    }),
  );
  await expect(client.identity.organizations.list({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
    status: 401,
  });

  const openApi = await fetch(new URL("/api/identity/organizations", origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  try {
    expect(openApi.status, "OpenAPI anonymous identity operation status").toBe(401);
    expect(await openApi.json(), "OpenAPI anonymous identity operation error").toMatchObject({
      code: "UNAUTHORIZED",
    });
  } finally {
    if (!openApi.bodyUsed) await openApi.body?.cancel();
  }
}
