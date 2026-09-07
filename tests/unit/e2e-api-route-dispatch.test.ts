import { describe, expect, test } from "bun:test";
import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { z } from "zod";
import { verifyNestedProductionApiRoutes } from "../integration/e2e-api-route-dispatch.js";

describe("production nested API dispatch evidence", () => {
  for (const missingRoute of [
    null,
    "/api/auth/admin/list-users",
    "/api/rpc/identity/sessions/revokeOthers",
    "/api/identity/sessions/revoke-others",
    "/api/rpc/identity/organizations/list",
    "/api/identity/organizations",
  ]) {
    test(
      missingRoute
        ? `rejects framework fallback responses for ${missingRoute}`
        : "accepts the boundary and protocol response contracts",
      async () => {
        const reached: string[] = [];
        const rpc = new RPCHandler({
          identity: {
            organizations: {
              list: os.input(z.object({})).handler(() => {
                throw new ORPCError("UNAUTHORIZED");
              }),
            },
          },
        });
        const server = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          async fetch(request) {
            const path = new URL(request.url).pathname;
            reached.push(path);
            expect(request.method).toBe(path === "/api/identity/organizations" ? "GET" : "POST");
            if (path === missingRoute) return new Response("Not found", { status: 404 });
            if (path.startsWith("/api/auth/")) {
              return new Response("Not found", {
                status: 404,
                headers: {
                  "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
                },
              });
            }
            if (path === "/api/rpc/identity/organizations/list") {
              const result = await rpc.handle(request, { prefix: "/api/rpc" });
              return result.response ?? new Response("Missing RPC fixture", { status: 404 });
            }
            if (path === "/api/identity/organizations") {
              return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
            }
            expect(request.headers.get("origin")).toBe("https://ghostinit-cross-origin.invalid");
            return Response.json(
              { error: "Forbidden" },
              {
                status: 403,
                headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
              },
            );
          },
        });
        try {
          if (missingRoute) {
            await expect(verifyNestedProductionApiRoutes(server.url.origin)).rejects.toThrow();
            expect(reached.at(-1)).toBe(missingRoute);
          } else {
            await verifyNestedProductionApiRoutes(server.url.origin);
            expect(reached).toEqual([
              "/api/auth/admin/list-users",
              "/api/rpc/identity/sessions/revokeOthers",
              "/api/identity/sessions/revoke-others",
              "/api/rpc/identity/organizations/list",
              "/api/identity/organizations",
            ]);
          }
        } finally {
          await server.stop(true);
        }
      },
    );
  }
});
