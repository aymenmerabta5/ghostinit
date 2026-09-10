import { describe, expect, test } from "bun:test";
import { featureFlagHooksContent } from "../../src/templates/analytics/flag-hooks.js";

interface Flags {
  [key: string]: string | boolean;
}
interface Client {
  onFeatureFlags(callback: (keys: string[], flags: Flags) => void): () => void;
}
interface Store<T> {
  getSnapshot(): T;
  getServerSnapshot(): T;
  subscribe(changed: () => void): () => void;
}
const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
  featureFlagHooksContent("null").replaceAll("export ", ""),
);
const createStore = new Function(`${code}\nreturn createFlagStore;`)() as <T>(
  client: Client | null,
  read: (flags?: Flags) => T,
  initial: T,
) => Store<T>;

describe("generated analytics external flag snapshots", () => {
  test("hydrates with a stable empty snapshot and observes SDK changes without render-time reads", () => {
    let callback: ((keys: string[], flags: Flags) => void) | undefined;
    let removed = false;
    let reads = 0;
    let changes = 0;
    let current: string | boolean = "control";
    const client: Client = {
      onFeatureFlags(next) {
        callback = next;
        return () => {
          removed = true;
        };
      },
    };
    const store = createStore<string | boolean | undefined>(
      client,
      (flags) => {
        reads += 1;
        return flags?.experiment ?? current;
      },
      undefined,
    );
    expect(store.getServerSnapshot()).toBeUndefined();
    expect(store.getSnapshot()).toBeUndefined();
    expect(reads).toBe(0);
    const unsubscribe = store.subscribe(() => {
      changes += 1;
    });
    expect(store.getSnapshot()).toBe("control");
    current = "variant";
    callback?.(["experiment"], { experiment: current });
    expect(store.getSnapshot()).toBe("variant");
    expect(store.getSnapshot()).toBe("variant");
    expect(reads).toBe(2);
    expect(changes).toBe(2);
    unsubscribe();
    callback?.(["experiment"], { experiment: false });
    expect(store.getSnapshot()).toBe("variant");
    expect(removed).toBe(true);
  });

  test("object payload snapshots remain referentially stable between SDK events", () => {
    let callback: (() => void) | undefined;
    const client: Client = {
      onFeatureFlags(next) {
        callback = () => next([], {});
        return () => undefined;
      },
    };
    let revision = 1;
    const store = createStore<{ revision: number } | undefined>(
      client,
      () => ({ revision }),
      undefined,
    );
    store.subscribe(() => undefined);
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    revision = 2;
    callback?.();
    expect(store.getSnapshot()).toEqual({ revision: 2 });
    expect(store.getSnapshot()).not.toBe(initial);
  });

  test("client/key changes cannot receive obsolete subscribed values", () => {
    const callbacks: Array<(keys: string[], flags: Flags) => void> = [];
    const client: Client = {
      onFeatureFlags(callback) {
        callbacks.push(callback);
        return () => undefined;
      },
    };
    const oldStore = createStore(client, (flags) => flags?.old, undefined);
    const stop = oldStore.subscribe(() => undefined);
    stop();
    const nextStore = createStore(client, (flags) => flags?.next, undefined);
    nextStore.subscribe(() => undefined);
    callbacks[0]?.(["old"], { old: "late" });
    expect(oldStore.getSnapshot()).toBeUndefined();
    expect(nextStore.getSnapshot()).toBeUndefined();
    callbacks[1]?.(["next"], { next: true });
    expect(nextStore.getSnapshot()).toBe(true);
  });
});
