import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { desktopUiCardContent } from "../../src/templates/apps/desktop/ui/primitives.js";

interface Element {
  type: string;
  props: Record<string, unknown>;
}

type Title = (props: Record<string, unknown>, ref?: unknown) => Element;

function emittedCardTitle(source: string): Title {
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""));
  const react = {
    forwardRef: (render: Title) => render,
    createElement: (type: string, props: Record<string, unknown>) => ({ type, props }),
  };
  return new Function("React", "cn", `${executable}\nreturn CardTitle;`)(
    react,
    (...values: unknown[]) => values.filter(Boolean).join(" "),
  ) as Title;
}

describe("generated desktop CardTitle heading contract", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} renders every supported heading and retains h3 as the default`, () => {
      const source = desktopUiCardContent(mode);
      expect(parseSync("card.tsx", source).errors).toEqual([]);
      expect(source).toContain('as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";');
      const CardTitle = emittedCardTitle(source);
      for (const heading of [undefined, "h1", "h2", "h3", "h4", "h5", "h6"]) {
        const element = CardTitle({ ...(heading ? { as: heading } : {}), children: "Section" });
        expect(element.type).toBe(heading ?? "h3");
        expect(element.props.children).toBe("Section");
        expect(Object.hasOwn(element.props, "as")).toBe(false);
      }
    });

    test(`${mode} preserves refs, accessible attributes and presentation classes`, () => {
      const CardTitle = emittedCardTitle(desktopUiCardContent(mode));
      const ref = { current: null };
      const element = CardTitle(
        {
          as: "h2",
          id: "jobs-heading",
          "aria-describedby": "jobs-help",
          className: "wrap-anywhere",
        },
        ref,
      );
      expect(element.props).toMatchObject({
        ref,
        id: "jobs-heading",
        "aria-describedby": "jobs-help",
        "data-slot": "card-title",
      });
      expect(element.props.className).toBe(
        "text-lg font-semibold leading-snug tracking-tight wrap-anywhere",
      );
    });
  }
});
