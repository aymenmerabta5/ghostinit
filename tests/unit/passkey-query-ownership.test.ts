import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { settingsFeatureHarness, settingsSource } from "../helpers/settings-feature-harness.js";
import { z } from "zod";
import { isIdentityRecentAuthenticationError } from "../../src/templates/apps/fragments/auth/client-validation.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";

type Owner = { userId: string; sessionId: string };
type QueryOptions = {
  queryKey: unknown[];
  enabled: boolean;
  queryFn(context: { signal: AbortSignal }): Promise<unknown>;
};

function queries() {
  const requests: AbortSignal[] = [];
  const pending = deferred<{ data: unknown[]; error: null }>();
  const { module } = generatedFormHarness(
    settingsSource("single", "next", "settings/queries.ts"),
    ["passkeyListQueryOptions"],
    {
      authScopedQueryKey: (owner: Owner, key: unknown[]) => [owner.userId, owner.sessionId, ...key],
      identityPasskeyClient: {
        list: ({ signal }: { signal: AbortSignal }) => {
          requests.push(signal);
          return pending.promise;
        },
      },
    },
  );
  return {
    requests,
    pending,
    options: module.passkeyListQueryOptions as unknown as (
      owner: Owner | null,
      isCurrent: () => boolean,
    ) => QueryOptions,
  };
}

describe("passkey query ownership", () => {
  test("canonical signout and mismatched sessions block a stale provider snapshot", async () => {
    const current = {
      data: { user: { id: "A" }, session: { id: "session-A" } },
      isPending: false,
      error: null,
    };
    const canonical = {
      hasCanonicalApi: true,
      scope: null as Owner | null,
      isPending: false,
      error: null,
    };
    const latestSignature = { current: "" };
    let generation = 0;
    let requests = 0;
    const harness = generatedFormHarness(
      settingsSource("single", "next", "settings/queries.ts"),
      ["usePasskeyListQuery"],
      {
        useQuery: (options: QueryOptions) => options,
        useQueryClient: () => ({}),
        useRef: () => latestSignature,
        useAuthOwnedEffect: () => () => () => true,
        useQueryAuthSession: () => canonical,
        identityClient: { useSession: () => current },
        identityPasskeyClient: {
          list: async () => {
            requests++;
            return { data: [], error: null };
          },
        },
        currentQueryAuthGeneration: () => generation,
        queryAuthIdentityFromSession: (value: typeof current.data) => ({
          userId: value.user.id,
          sessionId: value.session.id,
        }),
        queryAuthIdentitySignature: (owner: Owner | null) =>
          owner ? `${owner.userId}:${owner.sessionId}` : "anonymous",
        authScopedQueryKey: (owner: Owner, key: unknown[]) => [
          owner.userId,
          owner.sessionId,
          ...key,
        ],
      },
    );
    const render = () => harness.render("usePasskeyListQuery") as QueryOptions;
    const signal = new AbortController().signal;
    await expect(render().queryFn({ signal })).rejects.toMatchObject({ name: "AbortError" });
    canonical.scope = { userId: "B", sessionId: "session-B" };
    await expect(render().queryFn({ signal })).rejects.toMatchObject({ name: "AbortError" });
    canonical.scope = { userId: "A", sessionId: "session-A" };
    canonical.isPending = true;
    await expect(render().queryFn({ signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toBe(0);
    canonical.isPending = false;
    const previous = render();
    generation++;
    await expect(previous.queryFn({ signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toBe(0);
    await expect(render().queryFn({ signal })).resolves.toEqual([]);
    canonical.hasCanonicalApi = false;
    canonical.scope = null;
    await expect(render().queryFn({ signal })).resolves.toEqual([]);
    expect(requests).toBe(2);
  });

  test("anonymous, aborted, and stale manual requests do not call the provider", async () => {
    const { options, requests } = queries();
    const owner = { userId: "A", sessionId: "session-A" };
    const signal = new AbortController().signal;
    expect(options(null, () => true).enabled).toBe(false);
    await expect(options(null, () => true).queryFn({ signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(options(owner, () => false).queryFn({ signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      options(owner, () => true).queryFn({ signal: aborted.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requests).toEqual([]);
    expect(options(owner, () => true).queryKey).not.toEqual(
      options({ ...owner, sessionId: "session-B" }, () => true).queryKey,
    );
    expect(options(owner, () => true).queryKey).not.toEqual(
      options({ ...owner, userId: "B" }, () => true).queryKey,
    );
  });

  for (const retirement of ["owner", "abort"] as const) {
    test(`discards a late list after ${retirement} retirement`, async () => {
      const { options, requests, pending } = queries();
      let current = true;
      const controller = new AbortController();
      const result = options({ userId: "A", sessionId: "session-A" }, () => current).queryFn({
        signal: controller.signal,
      });
      expect(requests).toEqual([controller.signal]);
      if (retirement === "owner") current = false;
      else controller.abort();
      pending.resolve({ data: ["private-A"], error: null });
      await expect(result).rejects.toMatchObject({ name: "AbortError" });
    });
  }

  for (const access of ["next", "tanstack"] as const) {
    test(`${access} successful passkey mutation invalidates only the provider identity key`, async () => {
      const keys: unknown[] = [];
      const harness = settingsFeatureHarness(
        settingsSource("single", access, "settings/model.ts", "settings/mutations.ts"),
        ["usePasskeyMutation"],
        {
          identityPasskeyClient: {
            register: async () => ({ error: null }),
            rename: async () => ({ error: null }),
            delete: async () => ({ error: null }),
          },
          currentQueryAuthScope: () => ({
            userId: "A",
            sessionId: "session-A",
            tenantId: "workspace",
            teamId: "team",
          }),
          authScopedQueryKey: (scope: unknown, key: unknown[]) => {
            keys.push(scope);
            return [scope, ...key];
          },
        },
      );
      type Mutation = { run(input: unknown): Promise<{ status: string }> };
      for (const input of [
        { kind: "register", name: "Device" },
        { kind: "rename", id: "key", name: "Renamed" },
        { kind: "delete", id: "key" },
      ]) {
        expect((await (harness.render("usePasskeyMutation") as Mutation).run(input)).status).toBe(
          "success",
        );
      }
      expect(keys).toEqual(
        Array.from({ length: 3 }, () => ({
          userId: "A",
          sessionId: "session-A",
          tenantId: null,
          teamId: null,
        })),
      );
      expect(harness.invalidations).toHaveLength(3);
    });
    for (const operation of ["register", "rename", "remove"] as const) {
      test(`${access}/${operation} cannot refetch or publish after account retirement`, async () => {
        const pending = deferred<{ error: null }>();
        let refetches = 0;
        const toasts: string[] = [];
        const operationCall = () => pending.promise;
        const harness = settingsFeatureHarness(
          settingsSource(
            "single",
            access,
            "settings/model.ts",
            "settings/mutations.ts",
            "settings/use-passkey-management.ts",
          ),
          ["usePasskeyManagement", "usePasskeyEditor"],
          {
            z,
            isIdentityRecentAuthenticationError,
            toast: { success: (message: string) => toasts.push(message) },
            usePasskeyListQuery: () => ({
              data: [],
              refetch: () => {
                refetches++;
              },
            }),
            identityPasskeyClient: {
              register: operationCall,
              rename: operationCall,
              delete: operationCall,
            },
          },
        );
        const hook = operation === "register" ? "usePasskeyManagement" : "usePasskeyEditor";
        const props = {
          id: "passkey-A",
          name: "Existing name",
          deviceType: "singleDevice",
          backedUp: false,
          createdAt: "2026-01-01",
        };
        const state = harness.render(hook, props) as { remove(): Promise<void> };
        const form = harness.forms[0]!;
        const result = operation === "remove" ? state.remove() : form.handleSubmit();
        harness.changeOwner();
        pending.resolve({ error: null });
        await result;
        const next = harness.render(hook, props) as {
          error: string | null;
        };
        expect(refetches).toBe(0);
        expect(toasts).toEqual([]);
        expect(harness.invalidations).toEqual([]);
        expect(form.resets).toBe(0);
        expect(next.error).toBeNull();
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const api of [false, true]) {
        test(`${mode}/${framework}/api=${api} owns passkeys by provider identity`, () => {
          const resolved = resolveCreateConfig({
            name: "passkey-owner",
            mode,
            framework,
            database: "postgres",
            databaseWasExplicit: true,
            runtime: "bun",
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
          const root = mode === "single" ? "src" : "apps/web/src";
          const path = `${root}/features/settings/queries.ts`;
          const query = plan.files.find((file) => file.physicalPath === path)?.content;
          expect(
            plan.files.some(
              (file) => file.physicalPath === `${root}/hooks/use-auth-owned-effect.ts`,
            ),
          ).toBe(true);
          expect(
            plan.files.some(
              (file) => file.physicalPath === `${root}/components/query-auth-boundary.tsx`,
            ),
          ).toBe(true);
          expect(query).toContain("queryAuthIdentityFromSession(session.data)");
          expect(query).toContain("identityPasskeyClient.list({ signal })");
          expect(query).toContain("currentQueryAuthGeneration(queryClient) === generation");
          expect(query).not.toContain("identityPasskeyClient.useList");
        });
      }
    }
  }
});
