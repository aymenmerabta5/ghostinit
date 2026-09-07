import { file, type TemplateFile } from "../../../shared.js";

export function nativeQueryRegressionFile(root = "apps/mobile"): TemplateFile {
  return file(
    `${root ? `${root}/` : ""}tests/native-query-auth.test.ts`,
    `import { expect, test } from "bun:test";
import { dehydrate } from "@tanstack/react-query";
import { persistQueryClient, type PersistedClient } from "@tanstack/query-persist-client-core";
import { cancellableQueryPersister, currentQueryAuthGeneration, invalidateQueryAuthScope, isNativeQueryRestoreComplete, makeNativeQueryClient, nativeQueryCacheScope, type NativeQueryRestore } from "../src/lib/query-client";

test("native cache ownership includes user, session, organization and team", () => {
  const owner = { userId: "user-a", sessionId: "session-a", tenantId: "organization-a", teamId: "team-a" };
  const scope = nativeQueryCacheScope(owner);
  for (const next of [
    { ...owner, userId: "user-b" },
    { ...owner, sessionId: "session-b" },
    { ...owner, tenantId: "organization-b" },
    { ...owner, teamId: "team-b" },
    null,
  ]) expect(nativeQueryCacheScope(next)).not.toBe(scope);
});

test("a cancelled persisted restore cannot hydrate a later owner's cache", async () => {
  const source = makeNativeQueryClient();
  source.setQueryData(["private"], ["account-a"]);
  const persisted: PersistedClient = { buster: "account-a", timestamp: Date.now(), clientState: dehydrate(source) };
  let finishRestore: (value: PersistedClient) => void = () => undefined;
  const persistence = cancellableQueryPersister({
    persistClient: async () => undefined,
    removeClient: async () => undefined,
    restoreClient: () => new Promise<PersistedClient>((resolve) => { finishRestore = resolve; }),
  });
  const accountA = makeNativeQueryClient();
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: accountA, persister: persistence.persister, buster: "account-a",
  });
  persistence.cancel();
  unsubscribe();
  accountA.clear();
  const accountB = makeNativeQueryClient();
  finishRestore(persisted);
  await restored;
  expect(persistence.isActive()).toBe(false);
  expect(accountA.getQueryData(["private"])).toBeUndefined();
  expect(accountB.getQueryData(["private"])).toBeUndefined();
  source.clear(); accountA.clear(); accountB.clear();
});

test("returning to the same owner gates a new QueryClient until its own restore completes", async () => {
  const first = makeNativeQueryClient();
  let restored: NativeQueryRestore | null = { queryClient: first, cacheScope: "account-a", generation: currentQueryAuthGeneration(first) };
  expect(isNativeQueryRestoreComplete(restored, first, "account-a")).toBe(true);
  const pendingClient = makeNativeQueryClient();
  expect(isNativeQueryRestoreComplete(restored, pendingClient, null)).toBe(false);
  const next = makeNativeQueryClient();
  let finishRestore!: (value: undefined) => void;
  const persistence = cancellableQueryPersister({
    persistClient: async () => undefined,
    removeClient: async () => undefined,
    restoreClient: () => new Promise<undefined>((resolve) => { finishRestore = resolve; }),
  });
  const [unsubscribe, restorePromise] = persistQueryClient({ queryClient: next, persister: persistence.persister, buster: "account-a" });
  expect(isNativeQueryRestoreComplete(restored, next, "account-a")).toBe(false);
  finishRestore(undefined);
  await restorePromise;
  if (persistence.isActive()) restored = { queryClient: next, cacheScope: "account-a", generation: currentQueryAuthGeneration(next) };
  expect(isNativeQueryRestoreComplete(restored, next, "account-a")).toBe(true);
  persistence.cancel(); unsubscribe(); first.clear(); pendingClient.clear(); next.clear();
});

test("invalidating a stable client's auth generation requires a fresh persisted restore", () => {
  const client = makeNativeQueryClient();
  const restored = { queryClient: client, cacheScope: "account-a", generation: currentQueryAuthGeneration(client) };
  expect(isNativeQueryRestoreComplete(restored, client, "account-a")).toBe(true);
  invalidateQueryAuthScope(client);
  expect(isNativeQueryRestoreComplete(restored, client, "account-a")).toBe(false);
  client.clear();
});
`,
  );
}
