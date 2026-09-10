import { describe, expect, test } from "bun:test";
import { createAuthClient } from "better-auth/client";
import { z } from "zod";
import { identityClientAdapterContent } from "../../src/templates/apps/fragments/auth/client-adapter.js";
import { identityModelContent } from "../../src/templates/apps/fragments/auth/client-validation.js";
import { settingsFeatureHarness, settingsSource } from "../helpers/settings-feature-harness.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

describe("account deletion identity-client boundary", () => {
  test("the installed public client refreshes its session only after successful deletion", async () => {
    const privateMessage = "private adapter detail: delete from identity_user";
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    let failure: string | undefined = "ACCOUNT_DELETION_RESTRICTED";
    let session: object | null = {
      user: { id: "deletion-user", name: "Deletion user", email: "delete@example.test" },
      session: {
        id: "deletion-session",
        userId: "deletion-user",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    };
    const client = createAuthClient({
      baseURL: "http://identity.test/api/auth",
      sessionOptions: { refetchOnWindowFocus: false },
      fetchOptions: {
        retry: 0,
        customFetchImpl: async (input, init) => {
          const request = new Request(input, init);
          const path = new URL(request.url).pathname;
          const body = request.method === "POST" ? await request.json() : undefined;
          requests.push({ path, method: request.method, body });
          if (path === "/api/auth/get-session") return Response.json(session);
          if (path !== "/api/auth/delete-user")
            throw new Error(`Unexpected identity route ${path}`);
          if (failure)
            return Response.json({ code: failure, message: privateMessage }, { status: 409 });
          session = null;
          return Response.json({ success: true, message: "User deleted" });
        },
      },
    });
    const adapter = generatedFormHarness(
      identityModelContent() + "\n" + identityClientAdapterContent(),
      ["identityClient"],
      {
        authClient: client,
        z,
      },
    ).module.identityClient as unknown as {
      deleteAccount(input?: { password: string }): Promise<{ error?: { code?: string } | null }>;
    };
    const states: unknown[] = [];
    const unsubscribe = client.useSession.subscribe((state) => states.push(state.data));
    try {
      await client.useSession.get().refetch();
      expect(client.useSession.get().data?.user.id).toBe("deletion-user");
      const reads = () => requests.filter(({ path }) => path === "/api/auth/get-session").length;
      const initialReads = reads();
      for (const code of ["ACCOUNT_DELETION_RESTRICTED", "INVALID_PASSWORD", "SESSION_NOT_FRESH"]) {
        failure = code;
        expect((await adapter.deleteAccount({ password: "fixture-password" })).error?.code).toBe(
          code,
        );
        await Bun.sleep(25);
        expect(reads()).toBe(initialReads);
        expect(client.useSession.get().data?.user.id).toBe("deletion-user");
      }

      failure = undefined;
      expect((await adapter.deleteAccount({ password: "fixture-password" })).error).toBeNull();
      const deadline = Date.now() + 1000;
      while (client.useSession.get().data && Date.now() < deadline) await Bun.sleep(10);
      expect(client.useSession.get().data).toBeNull();
      expect(client.useSession.get().isPending).toBe(false);
      expect(reads()).toBe(initialReads + 1);
      expect(states.at(-1)).toBeNull();
      expect(requests.filter(({ path }) => path === "/api/auth/delete-user")).toEqual(
        Array.from({ length: 4 }, () => ({
          path: "/api/auth/delete-user",
          method: "POST",
          body: { password: "fixture-password" },
        })),
      );
    } finally {
      unsubscribe();
    }
  });

  test("the TanStack adapter preserves typed refusals and discards provider details", async () => {
    const source =
      identityModelContent() +
      "\n" +
      settingsSource(
        "single",
        "tanstack",
        "account-deletion/model.ts",
        "account-deletion/mutations.ts",
        "account-deletion/use-account-deletion.ts",
      );
    let failure: string | Error | undefined;
    const passwords: string[] = [];
    const events: string[] = [];
    const harness = settingsFeatureHarness(source, ["useAccountDeletion"], {
      useNavigate: () => () => {
        events.push("redirect");
      },
      transitionQueryAuthScope: () => {
        events.push("retire");
      },
      createRequiredPasswordSchema: () => ({}),
      identityClient: {
        deleteAccount: async ({ password }: { password: string }) => {
          passwords.push(password);
          if (failure instanceof Error) throw failure;
          return { error: failure ? { code: failure, message: "private provider detail" } : null };
        },
      },
    });
    const render = () => harness.render("useAccountDeletion") as { error: string | null };
    render();
    const form = harness.forms[0]!;
    form.values.password = "fixture-password";
    for (const [code, message] of [
      ["ACCOUNT_DELETION_RESTRICTED", "danger.retainedRecordError"],
      ["SESSION_EXPIRED", "danger.reauthenticate"],
      ["SESSION_NOT_FRESH", "danger.reauthenticate"],
      ["INVALID_PASSWORD", "danger.invalidPassword"],
    ]) {
      failure = code;
      await form.handleSubmit();
      expect(render().error).toBe(message);
      expect(render().error).not.toContain("private provider detail");
      expect(form.values.password).toBe("fixture-password");
      expect(events).toEqual([]);
    }
    failure = new Error("private provider detail");
    await form.handleSubmit();
    expect(render().error).toBe("danger.genericError");
    expect(events).toEqual([]);
    failure = undefined;
    await form.handleSubmit();
    expect(render().error).toBeNull();
    expect(events).toEqual(["retire", "redirect"]);
    expect(passwords).toEqual(Array.from({ length: 6 }, () => "fixture-password"));
  });
});
