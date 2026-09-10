/** React subscribes to SDK snapshots; no second React-owned copy of remote flags. */
export function featureFlagHooksContent(clientExpression: string): string {
  return `const EMPTY_FLAGS: Record<string, string | boolean> = Object.freeze({});

function createFlagStore<T>(client: PostHogInterface | null, read: (variants?: Record<string, string | boolean>) => T, initial: T) {
  let snapshot = initial;
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(changed: () => void) {
      if (!client) return () => undefined;
      let active = true;
      const refresh = (variants?: Record<string, string | boolean>) => {
        if (!active) return;
        try {
          const next = read(variants);
          if (!Object.is(snapshot, next)) { snapshot = next; changed(); }
        } catch { /* A disabled SDK keeps the last observable snapshot. */ }
      };
      refresh();
      let unsubscribe: (() => void) | undefined;
      try { unsubscribe = client.onFeatureFlags((_keys, variants) => refresh(variants)); } catch { /* Optional analytics stays inert when unavailable. */ }
      return () => { active = false; try { unsubscribe?.(); } catch { /* SDK cleanup must not disrupt unmount. */ } };
    },
  };
}

export function useFeatureFlag(key: FeatureFlagKey): string | boolean | undefined {
  const client = ${clientExpression};
  const store = useMemo(() => createFlagStore(client, (variants) => variants ? variants[key] : client?.getFeatureFlag(key), undefined), [client, key]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  const flag = useFeatureFlag(key);
  return typeof flag === "boolean" ? flag : flag !== undefined;
}

export function useFeatureFlagPayload(key: FeatureFlagKey): JsonType | undefined {
  const client = ${clientExpression};
  const store = useMemo(() => createFlagStore(client, () => client?.getFeatureFlagPayload(key), undefined), [client, key]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

export function useActiveFeatureFlags(): Record<string, string | boolean> {
  const client = ${clientExpression};
  const store = useMemo(() => createFlagStore(client, (variants) => variants ?? EMPTY_FLAGS, EMPTY_FLAGS), [client]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
`;
}
