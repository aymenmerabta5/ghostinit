import { describe, expect, test } from "bun:test";
import { deferred } from "../helpers/generated-form-harness.js";
import { desktopThemeHarness, type ClientSettings } from "../helpers/desktop-theme-harness.js";

describe("generated desktop theme initialization and persistence", () => {
  test("does not overwrite a stored dark preference with the initial light render", async () => {
    const initial = deferred<ClientSettings>();
    const saved = { theme: "dark", locale: "ar", sidebar: "compact" };
    let reads = 0;
    const ui = desktopThemeHarness({
      getSettings: () => (++reads === 1 ? initial.promise : Promise.resolve(saved)),
      local: {
        "ghostinit-theme-v1": JSON.stringify({ v: 1, theme: "dark" }),
        "ghostinit-theme": "dark",
      },
    });
    try {
      expect(ui.render().theme).toBe("light");
      await ui.flush();
      expect(ui.localWrites).toEqual([]);
      expect(ui.bridgeWrites).toEqual([]);
      expect(ui.storage.get("ghostinit-theme")).toBe("dark");
      initial.resolve(saved);
      await ui.flush();
      expect(ui.value().theme).toBe("dark");
      expect(ui.classes.has("dark")).toBe(true);
      expect(ui.classes.has("light")).toBe(false);
      expect(ui.style.colorScheme).toBe("dark");
      expect(ui.bridgeWrites).toEqual([saved]);
      expect(
        ui.localWrites.every(([, value]) => value === "dark" || JSON.parse(value).theme === "dark"),
      ).toBe(true);
    } finally {
      ui.unmount();
    }
  });

  for (const scenario of [
    {
      name: "bridge wins",
      saved: { theme: "dark" },
      local: { "ghostinit-theme-v1": '{"v":1,"theme":"light"}' },
      expected: "dark",
    },
    {
      name: "versioned local",
      saved: undefined,
      local: { "ghostinit-theme-v1": '{"v":1,"theme":"dark"}', "ghostinit-theme": "light" },
      expected: "dark",
    },
    {
      name: "legacy after invalid versioned value",
      saved: { theme: "invalid" },
      local: { "ghostinit-theme-v1": '{"v":1,"theme":"invalid"}', "ghostinit-theme": "dark" },
      expected: "dark",
    },
    {
      name: "legacy after malformed JSON",
      saved: undefined,
      local: { "ghostinit-theme-v1": "broken", "ghostinit-theme": "dark" },
      expected: "dark",
    },
    { name: "system dark", saved: undefined, local: {}, systemDark: true, expected: "dark" },
    {
      name: "blocked storage uses system",
      saved: undefined,
      local: {},
      systemDark: true,
      storageUnavailable: true,
      expected: "dark",
    },
    { name: "light default", saved: undefined, local: {}, expected: "light" },
    {
      name: "unavailable system uses light",
      saved: undefined,
      local: {},
      systemUnavailable: true,
      expected: "light",
    },
  ] as const) {
    test(`restores ${scenario.name}`, async () => {
      const ui = desktopThemeHarness({ ...scenario, getSettings: async () => scenario.saved });
      try {
        ui.render();
        await ui.flush();
        expect(ui.value().theme).toBe(scenario.expected);
        expect(ui.bridgeWrites.at(-1)?.theme).toBe(scenario.expected);
      } finally {
        ui.unmount();
      }
    });
  }

  test("an unavailable bridge preserves local fallback without overwriting unknown settings", async () => {
    const ui = desktopThemeHarness({
      getSettings: async () => {
        throw new Error("Bridge unavailable");
      },
      local: { "ghostinit-theme": "dark" },
    });
    try {
      ui.render();
      await ui.flush();
      expect(ui.value().theme).toBe("dark");
      expect(ui.bridgeWrites).toEqual([]);
      expect(ui.storage.get("ghostinit-theme")).toBe("dark");
    } finally {
      ui.unmount();
    }
  });

  test("a user choice made before settings arrive wins over the late stored value", async () => {
    const initial = deferred<ClientSettings>();
    let reads = 0;
    const saved = { theme: "light", locale: "fr" };
    const ui = desktopThemeHarness({
      getSettings: () => (++reads === 1 ? initial.promise : Promise.resolve(saved)),
    });
    try {
      ui.render().toggle();
      await ui.flush();
      expect(ui.value().theme).toBe("dark");
      expect(ui.localWrites).toEqual([]);
      initial.resolve(saved);
      await ui.flush();
      expect(ui.value().theme).toBe("dark");
      expect(ui.bridgeWrites).toEqual([{ ...saved, theme: "dark" }]);
    } finally {
      ui.unmount();
    }
  });

  test("late persistence reads cannot write an obsolete theme", async () => {
    const staleRead = deferred<ClientSettings>();
    let reads = 0;
    const ui = desktopThemeHarness({
      getSettings: () => (++reads === 3 ? staleRead.promise : Promise.resolve({ locale: "ar" })),
    });
    try {
      ui.render();
      await ui.flush();
      ui.value().setTheme("dark");
      await ui.flush();
      ui.value().setTheme("light");
      await ui.flush();
      staleRead.resolve({ theme: "dark", locale: "ar" });
      await ui.flush();
      expect(ui.bridgeWrites.map((value) => value.theme)).toEqual(["light", "light"]);
      expect(ui.storage.get("ghostinit-theme")).toBe("light");
    } finally {
      ui.unmount();
    }
  });

  test("bridge writes settle in selection order even when an older write is slow", async () => {
    const writingDark = deferred<void>();
    const settled: unknown[] = [];
    const ui = desktopThemeHarness({
      getSettings: async () => ({ locale: "fr" }),
      setSettings: async (value) => {
        if (value.theme === "dark") await writingDark.promise;
        settled.push(value.theme);
      },
    });
    try {
      ui.render();
      await ui.flush();
      ui.value().setTheme("dark");
      await ui.flush();
      ui.value().setTheme("light");
      await ui.flush();
      expect(ui.bridgeWrites.map((value) => value.theme)).toEqual(["light", "dark"]);
      writingDark.resolve();
      await ui.flush();
      expect(settled).toEqual(["light", "dark", "light"]);
      expect(ui.bridgeWrites.every((value) => value.locale === "fr")).toBe(true);
    } finally {
      ui.unmount();
    }
  });

  test("an unmounted provider cannot admit delayed settings or initiate a late write", async () => {
    const initial = deferred<ClientSettings>();
    const ui = desktopThemeHarness({ getSettings: () => initial.promise });
    ui.render();
    ui.unmount();
    initial.resolve({ theme: "dark" });
    await ui.flush();
    expect(ui.updatesAfterUnmount()).toBe(0);
    expect(ui.localWrites).toEqual([]);
    expect(ui.bridgeWrites).toEqual([]);
  });

  test("retiring a pending persistence read prevents its later bridge write", async () => {
    const pending = deferred<ClientSettings>();
    let reads = 0;
    const ui = desktopThemeHarness({
      getSettings: () => (++reads === 1 ? Promise.resolve({ theme: "dark" }) : pending.promise),
    });
    ui.render();
    await ui.flush();
    expect(ui.value().theme).toBe("dark");
    expect(ui.bridgeWrites).toEqual([]);
    const writesBeforeUnmount = ui.localWrites.length;
    ui.unmount();
    pending.resolve({ theme: "light", locale: "ar" });
    await ui.flush();
    expect(ui.bridgeWrites).toEqual([]);
    expect(ui.localWrites).toHaveLength(writesBeforeUnmount);
    expect(ui.updatesAfterUnmount()).toBe(0);
  });
});
