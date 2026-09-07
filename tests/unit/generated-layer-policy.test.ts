import { describe, expect, test } from "bun:test";
import {
  EXPECTED_LAYERS,
  generatedLayerViolations,
  invalidLayerDeclarations,
  invalidLayerUses,
} from "../helpers/generated-layer-contract.js";

const scale = Object.entries(EXPECTED_LAYERS)
  .map(([name, value]) => `--layer-${name}: ${value};`)
  .join("\n");

describe("generated named layer policy", () => {
  test("accepts only the six exact layer names and values", () => {
    expect(EXPECTED_LAYERS).toEqual({
      navigation: 20,
      overlay: 40,
      modal: 50,
      popover: 60,
      tooltip: 70,
      toast: 80,
    });
    expect(invalidLayerDeclarations(`:root { ${scale} }`)).toEqual([]);
    for (const name of Object.keys(EXPECTED_LAYERS)) {
      expect(invalidLayerUses(`className="z-[var(--layer-${name})]"`)).toEqual([]);
      expect(invalidLayerUses(`className="!z-[var(--layer-${name})]"`)).toEqual([]);
    }
  });

  test("rejects arbitrary numbers, names, calculations, fallbacks and inline overrides", () => {
    for (const value of [
      "z-20",
      "z-999",
      "-z-10",
      "z-auto",
      "z-[999]",
      "z-[var(--layer-unreviewed)]",
      "z-[var(--layer-modal,999)]",
      "z-[calc(var(--layer-modal)+1)]",
      "[z-index:999]",
      "style={{ zIndex: 999 }}",
    ])
      expect(invalidLayerUses(value).length, value).toBeGreaterThan(0);
  });

  test("rejects missing, reordered-value, duplicate and extra declarations", () => {
    for (const [name, value] of Object.entries(EXPECTED_LAYERS)) {
      expect(invalidLayerDeclarations(scale.replace(`--layer-${name}: ${value};`, ""))).toContain(
        `--layer-${name} must be declared once as ${value}`,
      );
      expect(
        invalidLayerDeclarations(
          scale.replace(`--layer-${name}: ${value};`, `--layer-${name}: ${value + 1};`),
        ),
      ).toContain(`--layer-${name} must be declared once as ${value}`);
      expect(invalidLayerDeclarations(`${scale}\n--layer-${name}: ${value};`)).toContain(
        `--layer-${name} must be declared once as ${value}`,
      );
    }
    expect(invalidLayerDeclarations(`${scale}\n--layer-unreviewed: 999;`)).toContain(
      "unknown layer --layer-unreviewed",
    );
    expect(invalidLayerDeclarations(`${scale}\n--layer-toString: 999;`)).toContain(
      "unknown layer --layer-toString",
    );
  });

  test("rejects a valid layer attached to the wrong surface or a missing popup layer", () => {
    const path = "src/components/ui/dialog.tsx";
    const correct =
      '<BaseDialog.Backdrop className="z-[var(--layer-overlay)]" /><BaseDialog.Popup className="z-[var(--layer-modal)]" />';
    const inspect = (content: string) =>
      generatedLayerViolations({
        mode: "single",
        sourceRoot: "src",
        files: [{ path, content }],
      }).filter((record) => record.path === path);
    expect(inspect(correct)).toEqual([]);
    const wrongSurface = correct.replace("--layer-overlay", "--layer-modal");
    expect(invalidLayerUses(wrongSurface)).toEqual([]);
    expect(inspect(wrongSurface)).toHaveLength(1);
    expect(inspect(wrongSurface)[0]?.evidence).toContain("expected only overlay");
    expect(inspect(correct.replace("z-[var(--layer-modal)]", ""))).toHaveLength(1);
  });
});
