import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { runWithTransaction } from "@better-auth/core/context";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { admin } from "better-auth/plugins/admin";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzle } from "drizzle-orm/pglite";
import * as pgCore from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import {
  identityDataModelBlueprint,
  renderPostgresIdentitySchema,
} from "../../src/domain/data-model/index.js";
import {
  serverAuthSingle,
  serverAuthTanstackSingle,
} from "../../src/templates/modes/single/server/auth.js";
import { authPackage } from "../../src/templates/auth.js";
import { accessFiles } from "../../src/templates/access.js";
import { transactionalAccountDeletionContent } from "../../src/templates/auth-deletion.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

function generatedSchema(): Record<string, pgCore.PgTable> {
  const source = renderPostgresIdentitySchema(identityDataModelBlueprint);
  const builders = [
    "bigint",
    "boolean",
    "index",
    "integer",
    "jsonb",
    "pgTable",
    "text",
    "timestamp",
    "uniqueIndex",
    "uuid",
    "varchar",
  ] as const;
  const names = identityDataModelBlueprint.entities
    .filter((entity) => entity.storage.kind === "table")
    .map((entity) => entity.storage.postgresExport);
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
  return new Function(...builders, `${executable}\nreturn {${names.join(",")}};`)(
    ...builders.map((name) => pgCore[name]),
  ) as Record<string, pgCore.PgTable>;
}

function generatedAuth(
  database: ReturnType<typeof drizzle>,
  schema: Record<string, pgCore.PgTable>,
  source: string,
) {
  let result: ReturnType<typeof betterAuth> | undefined;
  const access = generatedFormHarness(accessFiles("monorepo")[0]!.content, ["ac", "roles"], {
    createAccessControl,
    defaultStatements,
  }).module;
  const deletion = generatedFormHarness(
    transactionalAccountDeletionContent(),
    ["transactionalAccountDeletion"],
    { APIError, createAuthMiddleware, runWithTransaction },
  );
  generatedFormHarness(source, [], {
    betterAuth(options: BetterAuthOptions) {
      result = betterAuth({ ...options, logger: { disabled: true } });
      return result;
    },
    drizzleAdapter,
    transactionalAccountDeletion: deletion.module.transactionalAccountDeletion,
    db: database,
    schema,
    ...schema,
    ac: access.ac,
    roles: access.roles,
    admin,
    organization,
    twoFactor,
    passkey,
    magicLink,
    nextCookies: () => ({ id: "fixture-next-response-store" }),
    tanstackStartCookies: () => ({ id: "fixture-tanstack-response-store" }),
    sendEmail: async () => undefined,
    resolveEmailLocale: () => "en",
    transactionalEmailSubject: () => "Fixture verification",
    VerifyEmail: () => null,
    ResetPasswordEmail: () => null,
    MagicLinkEmail: () => null,
    env: {
      APP_NAME: "Deletion retention fixture",
      BETTER_AUTH_SECRET: "retained-account-deletion-fixture-secret-32",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  });
  if (!result) throw new Error("Generated auth did not initialize");
  return result;
}

const password = "Current-Retention-Fixture-Password-42";

async function signedIn(auth: ReturnType<typeof betterAuth>, database: PGlite, email: string) {
  const signup = await auth.api.signUpEmail({
    body: { name: "Deletion fixture", email, password },
    asResponse: true,
  });
  expect(signup.status).toBe(200);
  await database.query("update users set email_verified = true where email = $1", [email]);
  const signin = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(signin.status).toBe(200);
  const cookie = signin.headers
    .getSetCookie()
    .find((value) => value.startsWith("better-auth.session_token="))
    ?.split(";")[0];
  if (!cookie) throw new Error("Fixture authentication did not create a cookie");
  const headers = new Headers({ cookie });
  const session = await auth.api.getSession({ headers });
  if (!session?.user.id) throw new Error("Fixture authenticated user is absent");
  return { headers, userId: session.user.id };
}

async function deleteAccount(
  auth: ReturnType<typeof betterAuth>,
  headers: Headers,
  transport: "api" | "http",
) {
  if (transport === "api")
    return auth.api.deleteUser({ headers, body: { password }, asResponse: true });
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  requestHeaders.set("Origin", "http://localhost:3000");
  return auth.handler(
    new Request("http://localhost:3000/api/auth/delete-user", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ password }),
    }),
  );
}

function counts(value: Awaited<ReturnType<typeof snapshot>>) {
  return Object.fromEntries(Object.entries(value).map(([key, state]) => [key, state.count]));
}

async function snapshot(database: PGlite, userId: string) {
  const queries = {
    users: "select * from users where id = $1 order by id",
    accounts: "select * from accounts where user_id = $1 order by id",
    sessions: "select * from sessions where user_id = $1 order by id",
    audit: "select * from admin_audit_events where target_id = $1 order by id",
  };
  const result: Record<string, { count: number; digest: string }> = {};
  for (const [name, sql] of Object.entries(queries)) {
    const { rows } = await database.query(sql, [userId]);
    result[name] = {
      count: rows.length,
      digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  return result;
}

test("generated PostgreSQL auth preserves retained users and deletes eligible users through API and HTTP", async () => {
  const database = await PGlite.create();
  try {
    const schema = generatedSchema();
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema),
    );
    for (const statement of statements) await database.exec(statement);
    await database.query(
      "insert into users (id, name, email, email_verified, role) values ($1, $2, $3, true, 'admin')",
      ["fixture-audit-actor", "Audit actor", "audit-actor@example.test"],
    );
    for (const mode of ["single", "monorepo"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const source =
          mode === "single"
            ? (framework === "nextjs" ? serverAuthSingle : serverAuthTanstackSingle)(true)
            : authPackage(framework).find((file) => file.path === "packages/auth/src/server.ts")
                ?.content;
        if (!source) throw new Error("Generated auth source is absent");
        const auth = generatedAuth(drizzle(database, { schema }), schema, source);
        const originalAdapter = (await auth.$context).internalAdapter;
        const originalDeleteUser = originalAdapter.deleteUser;
        for (const transport of ["api", "http"] as const) {
          const label = `${mode}-${framework}-${transport}`;
          const email = `retained-${label}@example.test`;
          const retained = await signedIn(auth, database, email);
          await database.query(
            "insert into admin_audit_events (actor_id, target_id, action, metadata) values ($1, $2, $3, '{}'::jsonb)",
            ["fixture-audit-actor", retained.userId, "fixture-retained-record"],
          );
          const before = await snapshot(database, retained.userId);
          expect(counts(before), label).toEqual({ users: 1, accounts: 1, sessions: 1, audit: 1 });
          const refused = await deleteAccount(auth, retained.headers, transport);
          expect(refused.status, label).toBe(409);
          const failure = await refused.json();
          expect(failure.code, label).toBe("ACCOUNT_DELETION_RESTRICTED");
          expect(
            /constraint|delete from|admin_audit|params:/i.test(JSON.stringify(failure)),
            label,
          ).toBe(false);
          expect(
            refused.headers.getSetCookie().some((value) => /max-age=0/i.test(value)),
            label,
          ).toBe(false);
          expect(await snapshot(database, retained.userId), label).toEqual(before);
          expect(
            (await auth.api.getSession({ headers: retained.headers }))?.user.id === retained.userId,
            label,
          ).toBe(true);
          expect(
            (await auth.api.signInEmail({ body: { email, password }, asResponse: true })).status,
            label,
          ).toBe(200);

          const eligible = await signedIn(auth, database, `eligible-${label}@example.test`);
          const deleted = await deleteAccount(auth, eligible.headers, transport);
          expect(deleted.status, label).toBe(200);
          expect((await deleted.json()).success, label).toBe(true);
          expect(
            deleted.headers.getSetCookie().some((value) => /max-age=0/i.test(value)),
            label,
          ).toBe(true);
          expect(counts(await snapshot(database, eligible.userId)), label).toEqual({
            users: 0,
            accounts: 0,
            sessions: 0,
            audit: 0,
          });
          expect((await auth.api.getSession({ headers: eligible.headers })) === null, label).toBe(
            true,
          );
          expect((await auth.$context).internalAdapter === originalAdapter, label).toBe(true);
          expect(originalAdapter.deleteUser === originalDeleteUser, label).toBe(true);
        }
        if (mode === "single" && framework === "nextjs") {
          const retained = await signedIn(auth, database, "concurrent-retained@example.test");
          const eligible = await signedIn(auth, database, "concurrent-eligible@example.test");
          await database.query(
            "insert into admin_audit_events (actor_id, target_id, action, metadata) values ($1, $2, $3, '{}'::jsonb)",
            ["fixture-audit-actor", retained.userId, "fixture-concurrent-retained-record"],
          );
          const before = await snapshot(database, retained.userId);
          const [refused, deleted] = await Promise.all([
            deleteAccount(auth, retained.headers, "http"),
            deleteAccount(auth, eligible.headers, "api"),
          ]);
          expect([refused.status, deleted.status]).toEqual([409, 200]);
          expect(await snapshot(database, retained.userId)).toEqual(before);
          expect(counts(await snapshot(database, eligible.userId))).toEqual({
            users: 0,
            accounts: 0,
            sessions: 0,
            audit: 0,
          });
          expect(
            (await auth.api.getSession({ headers: retained.headers }))?.user.id === retained.userId,
          ).toBe(true);

          const token = crypto.randomUUID();
          await database.query(
            "insert into verifications (id, identifier, value, expires_at) values ($1, $2, $3, $4)",
            [
              crypto.randomUUID(),
              `delete-account-${token}`,
              retained.userId,
              new Date(Date.now() + 60_000),
            ],
          );
          const callback = await auth.handler(
            new Request(`http://localhost:3000/api/auth/delete-user/callback?token=${token}`, {
              headers: retained.headers,
            }),
          );
          expect(callback.status).toBe(409);
          expect((await callback.json()).code).toBe("ACCOUNT_DELETION_RESTRICTED");
          expect(await snapshot(database, retained.userId)).toEqual(before);
          expect((await auth.$context).internalAdapter === originalAdapter).toBe(true);
          expect(originalAdapter.deleteUser === originalDeleteUser).toBe(true);
        }
      }
    }
  } finally {
    await database.close();
  }
}, 60_000);
