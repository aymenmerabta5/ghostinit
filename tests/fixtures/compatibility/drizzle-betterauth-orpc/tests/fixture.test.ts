import { describe, it, expect } from "bun:test";
import { auth } from "../src/auth.js";
import { appRouter, client } from "../src/orpc.js";
import { db, users } from "../src/index.js";
import {
  clientAdminPlugin,
  compiledAdminRoles,
  roles,
  serverAdminPlugin,
} from "../src/access-contract.js";
import { singleClientAdmin, singleRoleNames, singleServerAdmin } from "../src/access-default-contract.js";
import { monorepoConvexOptions, singleConvexOptions } from "../src/convex-access-contract.js";
import { verifyOrpcRuntimeCompatibility } from "../src/runtime-check.js";

describe("compatibility fixture", () => {
  it("exports better-auth instance", () => {
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
  });

  it("exports drizzle db", () => {
    expect(db).toBeDefined();
    expect(users).toBeDefined();
  });

  it("exports oRPC router and typed client", () => {
    expect(appRouter).toBeDefined();
    expect(client).toBeDefined();
  });

  it("executes the oRPC fetch and OpenAPI compatibility contract", async () => {
    await expect(verifyOrpcRuntimeCompatibility()).resolves.toBeUndefined();
  });

  it("constructs customized and default Better Auth admin access plugins", () => {
    expect(Object.keys(roles)).toEqual(["admin", "superAdmin", "user", "viewer"]);
    expect(compiledAdminRoles).toEqual(["admin", "superAdmin"]);
    expect(serverAdminPlugin).toBeDefined();
    expect(clientAdminPlugin).toBeDefined();
    expect(singleServerAdmin).toBeDefined();
    expect(singleClientAdmin).toBeDefined();
    expect(singleRoleNames).toEqual(["admin", "user"]);
    expect(monorepoConvexOptions.plugins).toHaveLength(1);
    expect(singleConvexOptions.plugins).toHaveLength(1);
  });
});
