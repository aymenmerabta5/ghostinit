import { describe, it, expect } from "bun:test";
import { apiFiles } from "../../src/templates/apps/api";

describe("apps/api template files", () => {
  it("mounts oRPC at /api/rpc/[...path] without colliding with explicit REST routes", () => {
    const files = apiFiles();
    const route =
      files.find((f) => f.path === "apps/web/src/app/api/rpc/[...path]/route.ts")?.content ?? "";
    expect(route).toContain("const rpcHandler = new RPCHandler(appRouter,");
    expect(route).toContain("new BodyLimitPlugin");
    expect(route).toContain('rpcHandler.handle(request, { prefix: "/api/rpc", context })');
    expect(route).not.toContain("OpenAPIHandler");
    expect(route).not.toContain("as unknown as");
    expect(route).not.toContain('prefix: "/api/api"');
  });

  it("mounts OpenAPI operations at /api/* and keeps explicit schema and health routes", () => {
    const files = apiFiles();
    const operations =
      files.find((file) => file.path === "apps/web/src/app/api/[...path]/route.ts")?.content ?? "";
    expect(operations).toContain("const openApiHandler = new OpenAPIHandler(appRouter,");
    expect(operations).toContain("openApiHandler.handle(request, { context })");
    expect(operations).not.toContain('prefix: "/api/rpc"');
    expect(files.some((f) => f.path === "apps/web/src/app/api/health/route.ts")).toBe(true);
    expect(files.some((f) => f.path === "apps/web/src/app/api/openapi/route.ts")).toBe(true);
    expect(files.some((f) => f.path === "apps/web/src/app/api/auth/[...all]/route.ts")).toBe(true);
  });
});
