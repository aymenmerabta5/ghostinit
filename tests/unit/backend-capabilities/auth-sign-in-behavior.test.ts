import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { parseSync } from "oxc-parser";
import { projectConfigSchema } from "../../../src/lib/config.js";
import { generateProjectFiles } from "../../../src/templates/default.js";

const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });

function generatedObject(source: string, property: string): unknown {
  const expressions: string[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const key = node.key as { name?: string } | undefined;
    const expression = node.value as { type?: string; start: number; end: number } | undefined;
    if (key?.name === property && expression?.type === "ObjectExpression") {
      expressions.push(source.slice(expression.start, expression.end));
    }
    for (const child of Object.values(node)) visit(child);
  }
  const parsed = parseSync("generated-auth.ts", source);
  expect(parsed.errors).toEqual([]);
  visit(parsed.program);
  expect(expressions.length, `one generated ${property} policy must be present`).toBe(1);
  return new Function(
    transpiler.transformSync(`const policy = ${expressions[0]};`) + "\nreturn policy;",
  )();
}

describe("generated backend authentication operation", () => {
  test("signs in verified credentials and rejects unverified, incorrect, and revoked sessions", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const label = `${mode}/${framework}/${database}`;
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: "auth-operation-evidence",
              runtime: "bun",
              mode,
              framework,
              database,
              preset: "saas",
              apps: ["web"],
              billing: [],
              features: [],
            }),
            { dryRun: true },
          );
          const path =
            database === "convex"
              ? "convex/auth.ts"
              : mode === "monorepo"
                ? "packages/auth/src/server.ts"
                : "src/server/auth/index.ts";
          const source = files.find((file) => file.path === path)?.content;
          if (!source) throw new Error(`Missing generated auth: ${path}`);
          const credentials = generatedObject(source, "emailAndPassword") as NonNullable<
            BetterAuthOptions["emailAndPassword"]
          >;
          const sqlite = new Database(":memory:");
          const origin = "https://auth.fixture.test";
          // Exercise the generated credential policy through the real pinned
          // Better Auth router and persistence. Database-specific adapter wiring
          // is covered separately; this fixture owns only in-memory SQLite.
          const auth = betterAuth({
            database: sqlite,
            baseURL: origin,
            secret: "operation-evidence-auth-secret-at-least-32-characters",
            trustedOrigins: [origin],
            emailAndPassword: credentials,
            logger: { disabled: true },
          });
          try {
            await (await auth.$context).runMigrations();
            const request = (route: string, body?: unknown, cookie?: string) =>
              auth.handler(
                new Request(`${origin}/api/auth/${route}`, {
                  method: body === undefined ? "GET" : "POST",
                  headers: {
                    origin,
                    "content-type": "application/json",
                    ...(cookie ? { cookie } : {}),
                  },
                  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                }),
              );
            const input = { email: "actor@example.test", password: "correct-horse-battery" };
            const signUp = await request("sign-up/email", { ...input, name: "Actor" });
            expect(signUp.status, label).toBe(200);
            expect(
              signUp.headers.get("set-cookie"),
              `${label}: signup must not sign in`,
            ).toBeNull();
            const unverified = await request("sign-in/email", input);
            expect(unverified.status, label).toBe(403);
            expect(unverified.headers.get("set-cookie"), label).toBeNull();

            sqlite
              .query('UPDATE "user" SET "emailVerified" = 1 WHERE "email" = ?')
              .run(input.email);
            const incorrect = await request("sign-in/email", {
              ...input,
              password: "wrong-password",
            });
            expect(incorrect.status, label).toBe(401);
            expect(incorrect.headers.get("set-cookie"), label).toBeNull();
            const signedIn = await request("sign-in/email", input);
            expect(signedIn.status, label).toBe(200);
            const cookies = signedIn.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
            const cookie = cookies.join("; ");
            expect(cookie, `${label}: persisted session cookie`).toContain("session_token=");
            const session = await request("get-session", undefined, cookie);
            expect(session.status, label).toBe(200);
            expect(await session.json(), label).toMatchObject({
              user: { email: input.email, emailVerified: true },
            });
            const signedOut = await request("sign-out", {}, cookie);
            expect(signedOut.status, label).toBe(200);
            const revoked = await request("get-session?disableCookieCache=true", undefined, cookie);
            expect(
              await revoked.json(),
              `${label}: revoked session must not authenticate`,
            ).toBeNull();
          } finally {
            sqlite.close();
          }
        }
      }
    }
  });
});
