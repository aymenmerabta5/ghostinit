import { describe, expect, test } from "bun:test";
import { rnrButtonContent } from "../../src/templates/apps/fragments/expo/rnr/button.js";
import { rnrTextContent } from "../../src/templates/apps/fragments/expo/rnr/text.js";
import {
  elements,
  generatedFormHarness,
  textContent,
  type TestElement,
} from "../helpers/generated-form-harness.js";

interface Context {
  current: unknown;
  Provider: unknown;
}

function element(
  type: unknown,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): TestElement {
  return { type, props, children };
}

// Resolve the emitted JSX with scoped context, including composed components.
// Host elements are retained so assertions inspect actual forwarded native props.
function resolveTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveTree);
  if (!value || typeof value !== "object" || !("type" in value)) return value;
  const node = value as TestElement;
  const children = node.children.length ? node.children : [node.props.children];
  if (typeof node.type === "function") {
    return resolveTree(
      node.type({ ...node.props, children: children.length === 1 ? children[0] : children }),
    );
  }
  if (node.type && typeof node.type === "object" && "context" in node.type) {
    const context = (node.type as { context: Context }).context;
    const previous = context.current;
    context.current = node.props.value;
    try {
      return resolveTree(children);
    } finally {
      context.current = previous;
    }
  }
  return { ...node, children: children.map(resolveTree) };
}

interface VariantConfig {
  base?: string;
  variants: Record<string, Record<string, string>>;
  defaultVariants?: Record<string, string>;
}

// Select classes from the generated configuration; no button-specific mapping
// or CSS conflict rules are duplicated in this dependency-free fixture.
function tv(config: VariantConfig) {
  return (selection: Record<string, string | undefined> = {}) =>
    [
      config.base,
      ...Object.entries(config.variants).map(([name, values]) => {
        const selected = selection[name] ?? config.defaultVariants?.[name];
        return selected === undefined ? undefined : values[selected];
      }),
    ]
      .filter(Boolean)
      .join(" ");
}

function nativeButton() {
  const React = {
    createElement: element,
    createContext(current: unknown): Context {
      const context: Context = { current, Provider: undefined };
      context.Provider = { context };
      return context;
    },
    useContext: (context: Context) => context.current,
    forwardRef:
      (render: (props: Record<string, unknown>, ref: unknown) => unknown) =>
      (props: Record<string, unknown>) =>
        render(props, props.ref),
  };
  const { module } = generatedFormHarness(
    rnrTextContent() + "\n" + rnrButtonContent(),
    ["Button", "Text"],
    {
      React,
      tv,
      RNText: "RNText",
      Pressable: "Pressable",
      View: "View",
      ActivityIndicator: "ActivityIndicator",
    },
  );
  return {
    button: (props: Record<string, unknown>) => element(module.Button, props),
    text: (label: string, props: Record<string, unknown> = {}) =>
      element(module.Text, props, label),
    render: (props: Record<string, unknown>) => resolveTree(element(module.Button, props)),
  };
}

function nativeText(tree: unknown, label: string): TestElement {
  const found = elements(tree).find(
    (node) => node.type === "RNText" && textContent(node) === label,
  );
  if (!found) throw new Error("Missing native text: " + label);
  return found;
}

function classes(node: TestElement): string[] {
  return String(node.props.className).split(/\s+/);
}

const variantClasses = {
  default: ["text-primary-foreground"],
  destructive: ["text-destructive", "active:text-background"],
  outline: ["text-foreground"],
  secondary: ["text-secondary-foreground"],
  ghost: ["text-foreground"],
  link: ["text-primary", "underline"],
} as const;
const sizeClasses = {
  default: "text-sm",
  sm: "text-xs",
  lg: "text-base",
  icon: "text-base",
} as const;

describe("generated native Button text inheritance", () => {
  for (const [variant, expectedVariant] of Object.entries(variantClasses)) {
    for (const [size, expectedSize] of Object.entries(sizeClasses)) {
      test(variant + "/" + size + " styles string, composed and nested labels", () => {
        const ui = nativeButton();
        for (const children of [
          "Pay",
          ui.text("Pay"),
          element("View", {}, element("Icon", { name: "receipt" }), ui.text("Pay")),
        ]) {
          const tree = ui.render({ variant, size, children });
          const label = nativeText(tree, "Pay");
          expect(classes(label)).toEqual(
            expect.arrayContaining([
              "text-center",
              "font-medium",
              ...expectedVariant,
              expectedSize,
            ]),
          );
          // Text's base color and size must precede inherited button typography.
          for (const token of expectedVariant) {
            expect(classes(label).lastIndexOf(token)).toBeGreaterThanOrEqual(
              classes(label).indexOf("text-foreground"),
            );
          }
          expect(classes(label).lastIndexOf(expectedSize)).toBeGreaterThanOrEqual(
            classes(label).indexOf("text-base"),
          );
        }
      });
    }
  }

  test("omitted variants use primary contrast and default sizing for composed labels", () => {
    const ui = nativeButton();
    const label = nativeText(ui.render({ children: ui.text("Confirm") }), "Confirm");
    expect(classes(label)).toEqual(
      expect.arrayContaining(["text-primary-foreground", "text-sm", "font-medium"]),
    );
  });

  test("caller typography reaches composed descendants and explicit child classes remain last", () => {
    const ui = nativeButton();
    const tree = ui.render({
      variant: "default",
      size: "sm",
      textClassName: "text-secondary-foreground text-lg",
      children: element(
        "View",
        {},
        ui.text("Inherited"),
        ui.text("Override", { className: "text-destructive text-xl font-bold" }),
      ),
    });
    const inherited = classes(nativeText(tree, "Inherited"));
    expect(inherited.indexOf("text-secondary-foreground")).toBeGreaterThan(
      inherited.indexOf("text-primary-foreground"),
    );
    expect(inherited.indexOf("text-lg")).toBeGreaterThan(inherited.indexOf("text-xs"));
    const override = classes(nativeText(tree, "Override"));
    expect(override.indexOf("text-destructive")).toBeGreaterThan(
      override.indexOf("text-secondary-foreground"),
    );
    expect(override.indexOf("text-xl")).toBeGreaterThan(override.indexOf("text-lg"));
    expect(override.indexOf("font-bold")).toBeGreaterThan(override.indexOf("font-medium"));
  });

  test("button context stays scoped across sibling text, nested buttons and later renders", () => {
    const ui = nativeButton();
    const tree = resolveTree(
      element(
        "View",
        {},
        ui.text("Before"),
        ui.button({
          variant: "default",
          children: element(
            "View",
            {},
            ui.text("Outer"),
            ui.button({ variant: "destructive", children: ui.text("Inner") }),
            ui.text("Outer restored"),
          ),
        }),
        ui.text("After"),
        ui.button({ variant: "secondary", children: ui.text("Sibling") }),
      ),
    );
    for (const label of ["Before", "After"]) {
      expect(classes(nativeText(tree, label))).toEqual(["text-foreground", "text-base"]);
    }
    for (const label of ["Outer", "Outer restored"]) {
      expect(classes(nativeText(tree, label))).toContain("text-primary-foreground");
      expect(classes(nativeText(tree, label))).not.toContain("text-destructive");
    }
    expect(classes(nativeText(tree, "Inner"))).toContain("text-destructive");
    expect(classes(nativeText(tree, "Inner"))).not.toContain("text-primary-foreground");
    expect(classes(nativeText(tree, "Sibling"))).toContain("text-secondary-foreground");
    expect(classes(nativeText(resolveTree(ui.text("Later")), "Later"))).toEqual([
      "text-foreground",
      "text-base",
    ]);
  });

  for (const isLoading of [false, true]) {
    for (const disabled of [false, true]) {
      test(
        "preserves native behavior with loading=" + isLoading + " and disabled=" + disabled,
        () => {
          const ui = nativeButton();
          const presses: unknown[] = [];
          const onPress = (event: unknown) => presses.push(event);
          const ref = { current: null };
          const tree = ui.render({
            isLoading,
            disabled,
            onPress,
            accessibilityLabel: "Submit transfer",
            accessibilityHint: "Send receipt for review",
            accessibilityState: { selected: true, busy: !isLoading, disabled: !disabled },
            testID: "submit-transfer",
            className: "caller-button",
            children: element(
              "View",
              {},
              element("Icon", { name: "receipt" }),
              ui.text("Submit", { ref, selectable: true, accessibilityLabel: "Submit receipt" }),
            ),
          });
          const button = elements(tree).find((node) => node.type === "Pressable");
          expect(button?.props).toMatchObject({
            accessibilityRole: "button",
            accessibilityLabel: "Submit transfer",
            accessibilityHint: "Send receipt for review",
            accessibilityState: {
              selected: true,
              busy: isLoading,
              disabled: disabled || isLoading,
            },
            disabled: disabled || isLoading,
            testID: "submit-transfer",
            onPress,
          });
          expect(classes(button!)).toContain("caller-button");
          expect(classes(button!).includes("ui-loading")).toBe(isLoading);
          expect(classes(button!).includes("ui-disabled")).toBe(disabled || isLoading);
          expect(elements(tree).filter((node) => node.type === "ActivityIndicator")).toHaveLength(
            Number(isLoading),
          );
          expect(elements(tree).filter((node) => node.type === "Icon")).toHaveLength(1);
          expect(nativeText(tree, "Submit").props).toMatchObject({
            ref,
            selectable: true,
            accessibilityLabel: "Submit receipt",
          });
          expect(classes(nativeText(tree, "Submit"))).toContain("text-primary-foreground");
          const event = { nativeEvent: { timestamp: 123 } };
          expect(button?.props.onPress).toBe(onPress);
          if (!isLoading && !disabled) {
            (button!.props.onPress as typeof onPress)(event);
            expect(presses).toEqual([event]);
          } else {
            // Native Pressable owns suppressed dispatch; verify its disabled contract.
            expect(presses).toEqual([]);
          }
        },
      );
    }
  }
});
