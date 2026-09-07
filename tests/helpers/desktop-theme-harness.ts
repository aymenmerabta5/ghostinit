import { desktopThemeProviderContent } from "../../src/templates/apps/desktop/ui/theme.js";

export interface ThemeState {
  theme: "light" | "dark";
  setTheme(value: "light" | "dark"): void;
  toggle(): void;
}

export type ClientSettings = Record<string, unknown> | undefined;
interface Effect {
  dependencies: readonly unknown[] | undefined;
  run: () => void | (() => void);
  cleanup?: () => void;
}

export function desktopThemeHarness(options: {
  getSettings: () => Promise<ClientSettings>;
  setSettings?: (value: Record<string, unknown>) => Promise<void>;
  local?: Record<string, string>;
  systemDark?: boolean;
  storageUnavailable?: boolean;
  systemUnavailable?: boolean;
}) {
  const slots: unknown[] = [];
  const effects = new Map<number, Effect>();
  const pendingEffects = new Set<number>();
  const classes = new Set(["light"]);
  const storage = new Map(Object.entries(options.local ?? {}));
  const localWrites: Array<[string, string]> = [];
  const bridgeWrites: Record<string, unknown>[] = [];
  const style = { colorScheme: "light" };
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let updatesAfterUnmount = 0;
  let value: ThemeState;
  const changed = (before: readonly unknown[] | undefined, after: readonly unknown[] | undefined) =>
    !before ||
    !after ||
    before.length !== after.length ||
    after.some((item, index) => !Object.is(item, before[index]));
  const React = {
    createContext: () => ({ Provider: "theme-context" }),
    createElement: (_type: unknown, props: { value: ThemeState }) => ({ props }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (update: unknown) => {
          if (!mounted) {
            updatesAfterUnmount++;
            return;
          }
          const next = typeof update === "function" ? update(slots[index]) : update;
          if (!Object.is(next, slots[index])) {
            slots[index] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useCallback(callback: unknown) {
      cursor++;
      return callback;
    },
    useEffect(run: Effect["run"], dependencies: readonly unknown[] | undefined) {
      const index = cursor++;
      const previous = effects.get(index);
      if (!previous || changed(previous.dependencies, dependencies)) {
        effects.set(index, { run, dependencies, cleanup: previous?.cleanup });
        pendingEffects.add(index);
      }
    },
  };
  const browser = {
    desktopBridge: {
      getClientSettings: options.getSettings,
      async setClientSettings(settings: Record<string, unknown>) {
        bridgeWrites.push(settings);
        await options.setSettings?.(settings);
      },
    },
    matchMedia: () => {
      if (options.systemUnavailable) throw new Error("System preference unavailable");
      return { matches: options.systemDark ?? false };
    },
  };
  const localStorage = {
    getItem(key: string) {
      if (options.storageUnavailable) throw new Error("Storage unavailable");
      return storage.get(key) ?? null;
    },
    setItem(key: string, item: string) {
      if (options.storageUnavailable) throw new Error("Storage unavailable");
      storage.set(key, item);
      localWrites.push([key, item]);
    },
  };
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, enabled: boolean) =>
          enabled ? classes.add(name) : classes.delete(name),
      },
      style,
    },
  };
  const source = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    desktopThemeProviderContent()
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export /gm, ""),
  );
  const provider = new Function(
    "React",
    "window",
    "localStorage",
    "document",
    `${source}\nreturn ThemeProvider;`,
  )(React, browser, localStorage, document) as (props: { children: null }) => {
    props: { value: ThemeState };
  };

  function render() {
    for (let attempt = 0; mounted && dirty; attempt++) {
      if (attempt > 20) throw new Error("Theme effects did not settle");
      dirty = false;
      cursor = 0;
      value = provider({ children: null }).props.value;
      const pending = [...pendingEffects];
      pendingEffects.clear();
      for (const index of pending) {
        const effect = effects.get(index)!;
        effect.cleanup?.();
        effect.cleanup = effect.run() || undefined;
      }
    }
    return value;
  }
  return {
    render,
    async flush() {
      for (let index = 0; index < 24; index++) {
        await Promise.resolve();
        render();
      }
    },
    value: () => value,
    storage,
    localWrites,
    bridgeWrites,
    classes,
    style,
    updatesAfterUnmount: () => updatesAfterUnmount,
    unmount() {
      mounted = false;
      for (const effect of effects.values()) effect.cleanup?.();
      pendingEffects.clear();
    },
  };
}
