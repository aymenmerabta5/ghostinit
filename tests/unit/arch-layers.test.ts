import { describe, it, expect } from "bun:test";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layered.ts";

describe("layered architecture mobile - RNR+Uniwind shared theming", () => {
  it("apps/mobile app/_layout.tsx remains classified as UI", () => {
    const layer = getLayerFromFilePath("apps/mobile/app/_layout.tsx");
    expect(layer).toEqual({ level: 1, name: "UI" });
  });
  it("apps/mobile app/index.tsx is UI L1", () => {
    const layer = getLayerFromFilePath("apps/mobile/app/index.tsx");
    expect(layer?.level).toBe(1);
    expect(layer?.name).toBe("UI");
  });
  it("packages/ui theme.css is Supporting L6", () => {
    const layer = getLayerFromFilePath("packages/ui/src/theme.css");
    expect(layer?.level).toBe(6);
  });
  it("apps/web/src/components/ui/button.tsx is UI L1", () => {
    const layer = getLayerFromFilePath("apps/web/src/components/ui/button.tsx");
    expect(layer?.level).toBe(1);
  });
  it("apps/mobile/src/components/ui/button.tsx is UI L1", () => {
    const layer = getLayerFromFilePath("apps/mobile/src/components/ui/button.tsx");
    expect(layer?.level).toBe(1);
  });
  it("apps/mobile/global.css is mobile UI L1", () => {
    const layer = getLayerFromFilePath("apps/mobile/global.css");
    expect(layer?.level).toBe(1);
  });
});

describe("layered architecture desktop main-process transport", () => {
  it("classifies packaged endpoint config as Transport in both generated layouts", () => {
    expect(getLayerFromFilePath("apps/desktop/src/server/transport/runtime-config.ts")).toEqual({
      level: 2,
      name: "Transport",
    });
    expect(getLayerFromFilePath("src/server/transport/runtime-config.ts")).toEqual({
      level: 2,
      name: "Transport",
    });
  });
});

describe("layered architecture TanStack in-process transport", () => {
  it("classifies TanStack server-function references as Transport in both layouts", () => {
    expect(getLayerFromFilePath("apps/web/src/lib/server-functions.ts")).toEqual({
      level: 2,
      name: "Transport",
    });
    expect(getLayerFromFilePath("src/lib/server-functions.ts")).toEqual({
      level: 2,
      name: "Transport",
    });
  });
});
