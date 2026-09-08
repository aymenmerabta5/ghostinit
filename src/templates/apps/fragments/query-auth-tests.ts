import { file, type TemplateFile } from "../../shared.js";

export function queryAuthRegressionFile(
  root = "apps/web",
  queryImport = "../src/lib/query-client",
): TemplateFile {
  return file(
    `${root ? `${root}/` : ""}tests/query-auth.test.ts`,
    `import { describe, expect, test } from "bun:test";
import { dehydrate, hydrate, QueryObserver } from "@tanstack/react-query";
import {
  authScopedQueryKey,
  createQueryAuthSessionResolver,
  currentQueryAuthGeneration,
  currentQueryAuthScope,
  makeQueryClient,
  observeQueryAuthIdentity,
  queryAuthIdentityFromSession,
  queryAuthScopeFromCurrentRequest,
  queryInitialDataForScope,
  requestQueryAuthScopeRefresh,
  subscribeQueryAuthScopeRefresh,
  subscribeQueryAuthGeneration,
  transitionQueryAuthScope,
  type QueryAuthScope,
} from "${queryImport}";

const accountA: QueryAuthScope = { userId: "user-a", sessionId: "session-a", tenantId: "tenant-a", teamId: "team-a" };
const accountB: QueryAuthScope = { userId: "user-b", sessionId: "session-b", tenantId: "tenant-b", teamId: null };
const sessionsKey = ["identity", "sessions"] as const;

interface TestSession { queryScope: QueryAuthScope | null; marker: string; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flushRequests(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe("authenticated query ownership", () => {
  test("auth subscriptions ignore ordinary query construction and publish each generation once", () => {
    const client = makeQueryClient();
    const generations: number[] = [];
    const unsubscribe = subscribeQueryAuthGeneration(client, () => { generations.push(currentQueryAuthGeneration(client)); });
    client.getQueryCache().build(client, { queryKey: ["messaging", "conversations"] });
    client.setQueryData(["notifications"], []);
    expect(generations).toEqual([]);
    transitionQueryAuthScope(client, accountA);
    expect(generations).toHaveLength(1);
    transitionQueryAuthScope(client, { ...accountA });
    client.getQueryCache().build(client, { queryKey: ["messaging", "messages", "thread"] });
    expect(generations).toHaveLength(1);
    requestQueryAuthScopeRefresh(client);
    expect(generations).toHaveLength(2);
    expect(generations[1]!).toBeGreaterThan(generations[0]!);
    unsubscribe();
    transitionQueryAuthScope(client, accountB);
    expect(generations).toHaveLength(2);
    client.clear();
  });

  test("application scope uses the authenticated DTO and keeps provider identity separate", () => {
    const identity = queryAuthIdentityFromSession({
      user: { id: "provider-user", activeOrganizationId: "ignored-provider-organization" },
      session: { id: "provider-session", activeTeamId: "ignored-provider-team" },
    });
    expect(identity).toEqual({ userId: "provider-user", sessionId: "provider-session" });
    const current = {
      user: { id: "convex-domain-user", banned: false },
      sessionId: "provider-session",
      activeOrganizationId: "application-organization",
      activeTeamId: "application-team",
    };
    expect(queryAuthScopeFromCurrentRequest(identity, current)).toEqual({
      userId: "provider-user", sessionId: "provider-session",
      tenantId: "application-organization", teamId: "application-team",
    });
    expect(() => queryAuthScopeFromCurrentRequest(identity, { ...current, sessionId: "another-session" })).toThrow();
    expect(() => queryAuthScopeFromCurrentRequest(identity, { ...current, activeOrganizationId: undefined })).toThrow();
    expect(queryAuthScopeFromCurrentRequest(identity, { ...current, user: null })).toBeNull();
    expect(queryAuthScopeFromCurrentRequest(identity, { ...current, user: { ...current.user, banned: true } })).toBeNull();
  });

  test("provider observation preserves matching canonical tenant scope and refresh invalidates synchronously", () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    const before = currentQueryAuthGeneration(client);
    observeQueryAuthIdentity(client, { userId: accountA.userId, sessionId: accountA.sessionId });
    expect(currentQueryAuthScope(client)).toEqual(accountA);
    expect(currentQueryAuthGeneration(client)).toBe(before);
    client.setQueryData(["private"], "old-tenant");
    let notices = 0;
    const unsubscribe = subscribeQueryAuthScopeRefresh(client, () => {
      notices += 1;
      expect(currentQueryAuthGeneration(client)).toBeGreaterThan(before);
      expect(client.getQueryData(["private"])).toBeUndefined();
    });
    requestQueryAuthScopeRefresh(client);
    expect(currentQueryAuthScope(client)).toBeNull();
    expect(notices).toBe(1);
    unsubscribe();
    requestQueryAuthScopeRefresh(client);
    expect(notices).toBe(1);
    client.clear();
  });

  test("a canonical response for the previous provider session cannot commit", async () => {
    const client = makeQueryClient();
    let identity = { userId: accountA.userId, sessionId: accountA.sessionId };
    observeQueryAuthIdentity(client, identity);
    const old = deferred<unknown>();
    let reads = 0;
    const committed: string[] = [];
    const resolveAuth = createQueryAuthSessionResolver(async () => {
      const expectedIdentity = identity;
      const current = ++reads === 1 ? await old.promise : {
        user: { id: "domain-user-b" }, sessionId: accountB.sessionId,
        activeOrganizationId: accountB.tenantId, activeTeamId: accountB.teamId,
      };
      return { queryScope: queryAuthScopeFromCurrentRequest(expectedIdentity, current) };
    }, (_queryClient, session) => { committed.push(session.queryScope?.userId ?? "anonymous"); });
    const pending = resolveAuth(client);
    await flushRequests();
    identity = { userId: accountB.userId, sessionId: accountB.sessionId };
    observeQueryAuthIdentity(client, identity);
    old.resolve({ user: { id: "domain-user-a" }, sessionId: accountA.sessionId,
      activeOrganizationId: accountA.tenantId, activeTeamId: accountA.teamId });
    expect((await pending).queryScope).toEqual(accountB);
    expect(committed).toEqual([accountB.userId]);
    expect(reads).toBe(2);
    client.clear();
  });

  test("keeps one owner's cache and removes it on user, session, tenant and team changes", () => {
    for (const next of [accountB, { ...accountA, sessionId: "new-session" }, { ...accountA, tenantId: "new-tenant" }, { ...accountA, teamId: "new-team" }, null]) {
      const client = makeQueryClient();
      transitionQueryAuthScope(client, accountA);
      const key = authScopedQueryKey(accountA, sessionsKey);
      client.setQueryData(key, ["a-session"]);
      transitionQueryAuthScope(client, { ...accountA });
      expect(client.getQueryData<string[]>(key)).toEqual(["a-session"]);
      transitionQueryAuthScope(client, next);
      expect(client.getQueryData(key)).toBeUndefined();
      expect(currentQueryAuthScope(client)).toEqual(next);
      client.clear();
    }
  });

  test("new account data wins over the previous account and stale server props", () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    client.setQueryData(sessionsKey, ["a-session"]);
    transitionQueryAuthScope(client, accountB);
    const stale = queryInitialDataForScope(accountB, accountA, ["a-session"]);
    expect(stale).toBeUndefined();
    expect(queryInitialDataForScope(null, accountA, ["a-session"])).toBeUndefined();
    const initialData = queryInitialDataForScope(accountB, accountB, ["b-session"]);
    const observer = new QueryObserver(client, {
      queryKey: authScopedQueryKey(accountB, sessionsKey),
      queryFn: async () => ["b-session"],
      initialData,
    });
    expect(observer.getCurrentResult().data).toEqual(["b-session"]);
    expect(observer.getCurrentResult().isStale).toBe(false);
    client.clear();
  });

  test("a late response from the old account cannot repopulate the new cache", async () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    const key = authScopedQueryKey(accountA, sessionsKey);
    let resolveOld: (value: string[]) => void = () => undefined;
    let oldSignal: AbortSignal | undefined;
    const pending = client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => {
        oldSignal = signal;
        return new Promise<string[]>((resolve) => { resolveOld = resolve; });
      },
    }).catch(() => undefined);
    transitionQueryAuthScope(client, accountB);
    expect(oldSignal?.aborted).toBe(true);
    resolveOld(["a-session"]);
    await pending;
    await Promise.resolve();
    expect(client.getQueryData(key)).toBeUndefined();
    expect(currentQueryAuthScope(client)).toEqual(accountB);
    client.clear();
  });

  test("hydration retains matching initial data and isolates separate server requests", () => {
    const server = makeQueryClient();
    const otherRequest = makeQueryClient();
    transitionQueryAuthScope(server, accountA);
    const key = authScopedQueryKey(accountA, sessionsKey);
    server.setQueryData(key, ["a-session"]);
    expect(otherRequest.getQueryData(key)).toBeUndefined();
    const browser = makeQueryClient();
    hydrate(browser, dehydrate(server));
    transitionQueryAuthScope(browser, accountA);
    expect(browser.getQueryData<string[]>(key)).toEqual(["a-session"]);
    transitionQueryAuthScope(browser, accountB);
    expect(browser.getQueryData(key)).toBeUndefined();
    server.clear(); otherRequest.clear(); browser.clear();
  });

  test("same-generation route preloads share one authenticated read and commit", async () => {
    const client = makeQueryClient();
    const read = deferred<TestSession>();
    let reads = 0;
    let commits = 0;
    const resolveAuth = createQueryAuthSessionResolver(() => { reads += 1; return read.promise; }, () => { commits += 1; });
    const pending = [resolveAuth(client), resolveAuth(client), resolveAuth(client)];
    await flushRequests();
    expect(reads).toBe(1);
    read.resolve({ queryScope: accountA, marker: "accepted" });
    const results = await Promise.all(pending);
    expect(results.map((result) => result.protectedSession.marker)).toEqual(["accepted", "accepted", "accepted"]);
    expect(commits).toBe(1);
    client.clear();
  });

  for (const transition of ["account", "aba", "logout"] as const) {
    test("obsolete route authentication cannot rewind cache ownership: " + transition, async () => {
      const client = makeQueryClient();
      transitionQueryAuthScope(client, accountA);
      const before = currentQueryAuthGeneration(client);
      const old = deferred<TestSession>();
      const nextScope = transition === "logout" ? null : transition === "aba" ? accountA : accountB;
      let reads = 0;
      const committed: string[] = [];
      const resolveAuth = createQueryAuthSessionResolver(
        () => ++reads === 1 ? old.promise : Promise.resolve({ queryScope: nextScope, marker: "fresh" }),
        (_queryClient, session) => { committed.push(session.marker); },
      );
      const pending = resolveAuth(client);
      await flushRequests();
      transitionQueryAuthScope(client, transition === "logout" ? null : accountB);
      if (transition === "aba") transitionQueryAuthScope(client, accountA);
      client.setQueryData(["new-owner-data"], "preserved");
      expect(currentQueryAuthGeneration(client)).toBeGreaterThan(before);
      old.resolve({ queryScope: accountA, marker: "obsolete" });
      const result = await pending;
      expect(result.protectedSession.marker).toBe("fresh");
      expect(currentQueryAuthScope(client)).toEqual(nextScope);
      expect(client.getQueryData<string>(["new-owner-data"])).toBe("preserved");
      expect(committed).toEqual(["fresh"]);
      expect(reads).toBe(2);
      client.clear();
    });
  }

  test("an old request cleanup cannot remove a new owner's in-flight request", async () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    const old = deferred<TestSession>();
    const fresh = deferred<TestSession>();
    let reads = 0;
    const committed: string[] = [];
    const resolveAuth = createQueryAuthSessionResolver(
      () => ++reads === 1 ? old.promise : fresh.promise,
      (_queryClient, session) => { committed.push(session.marker); },
    );
    const first = resolveAuth(client);
    await flushRequests();
    transitionQueryAuthScope(client, accountB);
    const second = resolveAuth(client);
    await flushRequests();
    old.resolve({ queryScope: accountA, marker: "obsolete" });
    await flushRequests();
    const third = resolveAuth(client);
    await flushRequests();
    expect(reads).toBe(2);
    fresh.resolve({ queryScope: accountB, marker: "fresh" });
    const results = await Promise.all([first, second, third]);
    expect(results.every((result) => result.protectedSession.marker === "fresh")).toBe(true);
    expect(committed).toEqual(["fresh"]);
    client.clear();
  });

  test("obsolete auth errors retry under the current owner instead of redirecting", async () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    const old = deferred<TestSession>();
    let reads = 0;
    const resolveAuth = createQueryAuthSessionResolver(
      () => ++reads === 1 ? old.promise : Promise.resolve({ queryScope: accountB, marker: "fresh" }),
      () => undefined,
    );
    const pending = resolveAuth(client);
    await flushRequests();
    transitionQueryAuthScope(client, accountB);
    old.reject(new Error("old-session-rejected"));
    expect((await pending).queryScope).toEqual(accountB);
    client.clear();
  });

  test("repeated auth churn is bounded and never commits an obsolete session", async () => {
    const client = makeQueryClient();
    transitionQueryAuthScope(client, accountA);
    let reads = 0;
    let commits = 0;
    const resolveAuth = createQueryAuthSessionResolver(async () => {
      reads += 1;
      const oldScope = currentQueryAuthScope(client);
      transitionQueryAuthScope(client, oldScope?.userId === accountA.userId ? accountB : accountA);
      return { queryScope: oldScope, marker: "obsolete" };
    }, () => { commits += 1; });
    await expect(resolveAuth(client)).rejects.toMatchObject({ name: "AbortError" });
    expect(reads).toBe(3);
    expect(commits).toBe(0);
    expect(currentQueryAuthScope(client)).toEqual(accountB);
    client.clear();
  });
});
`,
  );
}
