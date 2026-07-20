import { describe, it, expect } from "bun:test";
import { getLayerFromFilePath } from "../../src/lib/architecture/rules/layered.ts";

describe("layered architecture mobile - RNR+Uniwind shared theming", () => {
  it("apps/mobile app/_layout.tsx is framework entry (exempt, null)", () => {
    const layer = getLayerFromFilePath("apps/mobile/app/_layout.tsx");
    // _layout.tsx is framework entry point per isFrameworkEntryPoint, so null (exempt)
    expect(layer).toBeNull();
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
