import { describe, it, expect } from "bun:test";
import { auth } from "../src/auth.js";
import { appRouter, client } from "../src/orpc.js";
import { db, users } from "../src/index.js";

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
});
