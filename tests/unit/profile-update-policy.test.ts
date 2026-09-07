import { describe, expect, test } from "bun:test";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { z } from "zod";
import { identityClientAdapterContent } from "../../src/templates/apps/fragments/auth/client-adapter.js";
import { profileUpdateValidationContent } from "../../src/templates/auth-profile.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

async function fixture() {
  const store: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [] };
  const factory = generatedFormHarness(
    profileUpdateValidationContent(),
    ["profileUpdateValidation"],
    {
      APIError,
      createAuthMiddleware,
    },
  ).module.profileUpdateValidation;
  if (!factory) throw new Error("Missing generated profile validation plugin");
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "profile-validation-fixture-secret-32-characters",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
        note: { type: "string", required: false },
      },
    },
    plugins: [factory() as BetterAuthPlugin],
    logger: { disabled: true },
  });
  const response = await auth.api.signUpEmail({
    body: { name: "Original name", email: "profile@example.test", password: "Fixture-password-42" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("better-auth.session_token="))
    ?.split(";")[0];
  if (!cookie) throw new Error("Profile fixture session cookie missing");
  return {
    auth,
    store,
    headers: new Headers({
      cookie,
      origin: "http://localhost:3000",
      "content-type": "application/json",
    }),
  };
}

describe("public profile update server validation", () => {
  test("the installed identity client updates the observed session after a validated profile save", async () => {
    const { auth, headers } = await fixture();
    const client = createAuthClient({
      baseURL: "http://localhost:3000/api/auth",
      sessionOptions: { refetchOnWindowFocus: false },
      fetchOptions: {
        retry: 0,
        customFetchImpl: async (input, init) => {
          const request = new Request(input, init);
          for (const [name, value] of headers) request.headers.set(name, value);
          return auth.handler(request);
        },
      },
    });
    const adapter = generatedFormHarness(identityClientAdapterContent(), ["identityClient"], {
      authClient: client,
      z,
    }).module.identityClient as unknown as {
      updateProfile(input: { name: string }): Promise<{ error?: { code?: string } | null }>;
    };
    const names: Array<string | undefined> = [];
    const unsubscribe = client.useSession.subscribe((state) => names.push(state.data?.user.name));
    try {
      await client.useSession.get().refetch();
      expect(client.useSession.get().data?.user.name).toBe("Original name");
      expect((await adapter.updateProfile({ name: " " })).error?.code).toBe("INVALID_NAME");
      expect(client.useSession.get().data?.user.name).toBe("Original name");
      expect((await adapter.updateProfile({ name: " Updated name " })).error).toBeNull();
      const deadline = Date.now() + 1000;
      while (client.useSession.get().data?.user.name !== "Updated name" && Date.now() < deadline)
        await Bun.sleep(10);
      expect(client.useSession.get().data?.user.name).toBe("Updated name");
      expect(names.at(-1)).toBe("Updated name");
    } finally {
      unsubscribe();
    }
  });

  for (const transport of ["api", "http"] as const) {
    test(`${transport} preserves the trimmed 1–50 name contract and field admission`, async () => {
      const { auth, store, headers } = await fixture();
      const update = async (body: Record<string, unknown>): Promise<Response> => {
        if (transport === "http")
          return auth.handler(
            new Request("http://localhost:3000/api/auth/update-user", {
              method: "POST",
              headers,
              body: JSON.stringify(body),
            }),
          );
        try {
          return await Reflect.apply(auth.api.updateUser, auth.api, [
            { headers, body, asResponse: true },
          ]);
        } catch (error) {
          // Before-hook errors are thrown by the direct API even when asResponse is set.
          if (!isAPIError(error)) throw error;
          return Response.json(error.body, { status: error.statusCode });
        }
      };
      for (const name of ["", " ", "x".repeat(51), false, 42, null, {}, ["Valid name"]]) {
        const rejected = await update({ name });
        expect(rejected.status).toBe(400);
        expect((await rejected.json()).code).toBe("INVALID_NAME");
        expect(store.user[0]?.name).toBe("Original name");
        expect((await auth.api.getSession({ headers }))?.user.name).toBe("Original name");
      }
      for (const name of [" X ", ` ${"Y".repeat(50)} `, "  Updated name  "]) {
        expect((await update({ name })).status).toBe(200);
        expect(store.user[0]?.name).toBe(name.trim());
        expect((await auth.api.getSession({ headers }))?.user.name).toBe(name.trim());
      }
      expect(
        (await update({ image: "https://example.test/avatar.png", note: "retained field" })).status,
      ).toBe(200);
      expect(store.user[0]).toMatchObject({
        name: "Updated name",
        image: "https://example.test/avatar.png",
        note: "retained field",
        role: "user",
      });
      const forbidden = await update({ name: "Another name", role: "admin" });
      expect(forbidden.status).toBe(400);
      expect((await forbidden.json()).code).toBe("FIELD_NOT_ALLOWED");
      expect(store.user[0]).toMatchObject({ name: "Updated name", role: "user" });
      expect(
        (
          await auth.handler(
            new Request("http://localhost:3000/api/auth/update-user", {
              method: "POST",
              headers: { "content-type": "application/json", origin: "http://localhost:3000" },
              body: JSON.stringify({ name: "Unauthenticated" }),
            }),
          )
        ).status,
      ).toBe(401);
      expect(store.user[0]?.name).toBe("Updated name");
    });
  }
});
