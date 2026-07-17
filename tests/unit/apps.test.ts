import { describe, it, expect } from "bun:test";
import { apiFiles } from "../../src/templates/apps/api";

describe("apps/api template files", () => {
  it("mounts oRPC at /api/[...path] without duplicating the router prefix", () => {
    const files = apiFiles();
    const route =
      files.find((f) => f.path === "apps/web/src/app/api/[...path]/route.ts")?.content ?? "";
    expect(route).toContain("const rpcHandler = new RPCHandler(appRouter)");
    expect(route).toContain("const openapiHandler = new OpenAPIHandler(appRouter)");
    expect(route).toContain("const matchOptions = { context }");
    expect(route).not.toContain('prefix: "/api"');
  });

  it("keeps explicit /api/health and /api/openapi routes", () => {
    const files = apiFiles();
    expect(files.some((f) => f.path === "apps/web/src/app/api/health/route.ts")).toBe(true);
    expect(files.some((f) => f.path === "apps/web/src/app/api/openapi/route.ts")).toBe(true);
    expect(files.some((f) => f.path === "apps/web/src/app/api/auth/[...all]/route.ts")).toBe(true);
  });
});
