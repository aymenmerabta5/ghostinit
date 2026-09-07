import { describe, expect, test } from "bun:test";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { auth as authVersions } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import {
  serverAuthSingle,
  serverAuthTanstackSingle,
} from "../../src/templates/modes/single/server/auth.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

function capturedOptions(source: string): BetterAuthOptions {
  let options: BetterAuthOptions | undefined;
  const plugin = () => ({ id: "fixture-plugin" });
  generatedFormHarness(source, [], {
    betterAuth(value: BetterAuthOptions) {
      options = value;
      return {};
    },
    drizzleAdapter: () => undefined,
    transactionalAccountDeletion: plugin,
    APIError,
    createAuthMiddleware,
    db: {},
    schema: {},
    nextCookies: plugin,
    tanstackStartCookies: plugin,
    admin: plugin,
    passkey: plugin,
    organization: plugin,
    twoFactor: plugin,
    magicLink: plugin,
    env: {
      APP_NAME: "Deletion fixture",
      BETTER_AUTH_SECRET: "account-deletion-fixture-secret-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  });
  if (!options) throw new Error("Generated auth did not initialize its provider");
  return options;
}

async function signedIn(policy: BetterAuthOptions) {
  const store: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [] };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "account-deletion-fixture-secret-32-characters",
    database: memoryAdapter(store),
    user: policy.user,
    session: policy.session,
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
  });
  const password = "Correct-Fixture-Password-42";
  const response = await auth.api.signUpEmail({
    body: { name: "Deletion fixture", email: "delete@example.test", password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("better-auth.session_token="))
    ?.split(";")[0];
  if (!cookie) throw new Error("Fixture authentication did not create a session cookie");
  return { auth, store, password, headers: new Headers({ cookie }) };
}

describe("single generated account-deletion policy", () => {
  for (const [framework, render] of [
    ["Next", serverAuthSingle],
    ["TanStack", serverAuthTanstackSingle],
  ] as const) {
    for (const emailPassword of [true, false]) {
      test(`${framework} enables deletion without weakening persisted-session freshness (email=${emailPassword})`, () => {
        const policy = capturedOptions(render(emailPassword));
        expect(policy.user?.deleteUser?.enabled).toBe(true);
        expect(policy.session?.freshAge).toBe(300);
        expect(policy.session?.cookieCache?.enabled).toBe(false);
      });
    }

    test(`${framework} rejects an incorrect password and deletes with the current password`, async () => {
      const { auth, store, password, headers } = await signedIn(capturedOptions(render(true)));
      const rejected = await auth.api.deleteUser({
        headers,
        body: { password: "Wrong-Fixture-Password-42" },
        asResponse: true,
      });
      expect(rejected.status).toBe(400);
      expect((await rejected.json()).code).toBe("INVALID_PASSWORD");
      expect(store.user).toHaveLength(1);
      const deleted = await auth.api.deleteUser({ headers, body: { password }, asResponse: true });
      expect(deleted.status).toBe(200);
      expect(store.user).toHaveLength(0);
      expect(store.session).toHaveLength(0);
      expect(store.account).toHaveLength(0);
      expect((await auth.api.getSession({ headers })) === null).toBe(true);
    });

    test(`${framework} still requires recent authentication when deletion has no password`, async () => {
      const { auth, store, headers } = await signedIn(capturedOptions(render(false)));
      const session = store.session[0];
      if (!session) throw new Error("Fixture session is absent");
      session.createdAt = new Date(Date.now() - 10 * 60_000);
      const stale = await auth.api.deleteUser({ headers, body: {}, asResponse: true });
      expect(stale.status).toBe(400);
      expect((await stale.json()).code).toBe("SESSION_EXPIRED");
      expect(store.user).toHaveLength(1);
      session.createdAt = new Date();
      const recent = await auth.api.deleteUser({ headers, body: {}, asResponse: true });
      expect(recent.status).toBe(200);
      expect(store.user).toHaveLength(0);
    });
  }
});

test("transactional deletion is emitted with an explicit core dependency for PostgreSQL auth", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const api of [false, true]) {
          const resolved = resolveCreateConfig({
            name: "account-deletion-policy",
            mode,
            framework,
            database,
            runtime: "bun",
            databaseWasExplicit: true,
            apps: ["web"],
            preset: "custom",
            cache: "none",
            deploy: "none",
            billing: [],
            features: [],
            withAuth: true,
            withApi: api,
          });
          if (!resolved.ok) throw new Error(resolved.message);
          const plan = buildProjectGenerationPlan(resolved.resolvedConfig, {
            desiredConfig: resolved.desiredConfig,
          });
          const root = mode === "single" ? "src/server/auth" : "packages/auth/src";
          const manifestPath = mode === "single" ? "package.json" : "packages/auth/package.json";
          const manifest = JSON.parse(
            plan.files.find((file) => file.physicalPath === manifestPath)!.content,
          );
          const helper = plan.files.find(
            (file) => file.physicalPath === `${root}/account-deletion.ts`,
          );
          const label = `${mode}/${framework}/${database}/api=${api}`;
          expect(Boolean(helper), label).toBe(database === "postgres");
          expect(manifest.dependencies["@better-auth/core"], label).toBe(
            database === "postgres" ? authVersions["@better-auth/core"] : undefined,
          );
        }
      }
    }
  }
});
