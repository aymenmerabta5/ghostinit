import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { systemFeatureFiles } from "../../src/templates/apps/fragments/system-pages.js";
import { tanstackRootDocumentContent } from "../../src/templates/apps/fragments/layout.js";
import { singleRootRouteTanstackContent } from "../../src/templates/modes/single/tanstack/core.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { elements, textContent, type TestElement } from "../helpers/generated-form-harness.js";

type Mode = "monorepo" | "single";
type Locale = "en" | "fr" | "ar";
interface RecoveryRouter {
  invalidate(): Promise<void>;
}
type Screen = (props: Record<string, unknown>) => TestElement;
const catalogs = { en: EN_MESSAGES.errors, fr: FR_MESSAGES.errors, ar: AR_MESSAGES.errors };
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react" } },
});
const React = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) =>
    ({ type, props: props ?? {}, children }) satisfies TestElement,
};

function evaluate<T>(source: string, name: string, bindings: Record<string, unknown>): T {
  const parsed = parseSync("emitted.tsx", source);
  expect(parsed.errors).toHaveLength(0);
  for (const entry of parsed.program.body) {
    const node = entry.type === "ExportNamedDeclaration" ? entry.declaration : entry;
    if (node?.type === "FunctionDeclaration" && node.id?.name === name) {
      const body = transpiler.transformSync(source.slice(node.start, node.end));
      return new Function(...Object.keys(bindings), body + "\nreturn " + name + ";")(
        ...Object.values(bindings),
      ) as T;
    }
  }
  throw new Error("Missing emitted function: " + name);
}

function translate(locale: Locale, namespace: string) {
  expect(namespace).toBe("errors");
  return (key: string): string => {
    let value: unknown = catalogs[locale];
    for (const part of key.split(".")) {
      if (typeof value !== "object" || value === null || !Object.hasOwn(value, part))
        throw new Error("Missing translation: " + key);
      value = Reflect.get(value, part);
    }
    if (typeof value !== "string") throw new Error("Translation must be text: " + key);
    return value;
  };
}

function emittedFallback(router: "next" | "tanstack", mode: Mode, filename: string): string {
  const root = mode === "single" ? "src" : "apps/web/src";
  const output = systemFeatureFiles(router, root, true, mode === "single");
  const file = output.find((item) => item.path === root + "/features/system/" + filename);
  if (!file) throw new Error("Missing generated system feature: " + filename);
  return file.content;
}

function oneButton(tree: TestElement): TestElement {
  const buttons = elements(tree).filter((node) => node.type === "button");
  expect(buttons).toHaveLength(1);
  const button = buttons[0];
  if (!button || typeof button.props.onClick !== "function")
    throw new Error("Recovery button must expose a callable action");
  return button;
}

describe("generated TanStack route error recovery", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const i18n of [false, true]) {
      for (const locale of ["en", "fr", "ar"] as const) {
        test(
          mode + " i18n=" + i18n + " " + locale + " retries through the framework adapter",
          () => {
            const source = emittedFallback("tanstack", mode, "route-fallbacks.tsx");
            const root =
              mode === "single"
                ? singleRootRouteTanstackContent(i18n)
                : tanstackRootDocumentContent(i18n);
            let invalidations = 0;
            const router: RecoveryRouter = {
              invalidate: async () => {
                invalidations++;
              },
            };
            const error = new Error("route-load fixture");
            const reported: unknown[] = [];
            const RouteErrorScreen = evaluate<Screen>(source, "RouteErrorScreen", {
              React,
              Button: "button",
              useReportError: (value: unknown) => reported.push(value),
              useStandaloneSurfaceTranslations: (namespace: string) => translate(locale, namespace),
            });
            const RootErrorComponent = evaluate<Screen>(root, "RootErrorComponent", {
              React,
              RouteErrorScreen,
              RootDocument: "root-document",
              useRouter: () => router,
              useStandaloneSurfaceLocale: () => locale,
            });

            const document = RootErrorComponent({ error });
            expect(document.props.locale).toBe(i18n ? locale : undefined);
            const slot = elements(document).find((node) => node.type === RouteErrorScreen);
            if (!slot) throw new Error("Root adapter omitted RouteErrorScreen");
            const screen = RouteErrorScreen(slot.props);
            const button = oneButton(screen);
            expect(button.props.type).toBe("button");
            expect(textContent(button)).toBe(catalogs[locale].unexpected.retry);
            expect(reported).toEqual([error]);
            expect(invalidations).toBe(0);
            (button.props.onClick as () => void)();
            expect(invalidations).toBe(1);

            // The view remains usable outside normal app providers and does not own router access.
            expect(source).toContain('from "@/components/ui/button"');
            expect(source).toContain('from "@/lib/translations.standalone"');
            expect(source).not.toContain('from "@/lib/translations"');
            expect(source).not.toContain("@tanstack/react-router");
            const imports = parseSync("__root.tsx", root).program.body.filter(
              (node) =>
                node.type === "ImportDeclaration" && node.source.value === "@tanstack/react-router",
            );
            expect(
              imports.some(
                (node) =>
                  node.type === "ImportDeclaration" &&
                  node.specifiers.some(
                    (specifier) =>
                      specifier.type === "ImportSpecifier" && specifier.local.name === "useRouter",
                  ),
              ),
            ).toBe(true);
          },
        );
      }
    }
  }

  test("Next local and global error presenters still invoke their supplied reset callback", () => {
    for (const [filename, name, translationKey] of [
      ["unexpected-error.tsx", "UnexpectedErrorScreen", "unexpected.retry"],
      ["global-error.tsx", "GlobalErrorScreen", "global.retry"],
    ] as const) {
      const source = emittedFallback("next", "monorepo", filename);
      let resets = 0;
      const reset = () => {
        resets++;
      };
      const screen = evaluate<Screen>(source, name, {
        React,
        Button: "button",
        Card: "div",
        CardHeader: "div",
        CardTitle: "h1",
        CardDescription: "p",
        CardContent: "div",
        useReportError: () => {},
        useSurfaceTranslations: (namespace: string) => translate("en", namespace),
        useStandaloneSurfaceTranslations: (namespace: string) => translate("en", namespace),
        useStandaloneSurfaceLocale: () => "en",
        standaloneSurfaceDirection: () => "ltr",
      })({ error: new Error("Next fixture"), reset });
      const button = oneButton(screen);
      expect(textContent(button)).toBe(translate("en", "errors")(translationKey));
      expect(resets).toBe(0);
      (button.props.onClick as () => void)();
      expect(resets).toBe(1);
    }
  });
});
