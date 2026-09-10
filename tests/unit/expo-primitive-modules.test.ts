import { expect, test } from "bun:test";
import { posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { formatGenerationText } from "../../src/generation/plan-formatter.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { rnrDialogFiles } from "../../src/templates/apps/fragments/expo/rnr/dialog.js";
import { rnrDialogModalContent } from "../../src/templates/apps/fragments/expo/rnr/dialog-parts.js";
import { rnrTabsFiles } from "../../src/templates/apps/fragments/expo/rnr/tabs.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  type TestElement,
} from "../helpers/generated-form-harness.js";

const contextRuntime = `React.createContext = (value) => ({ Provider: "Provider", current: value });
React.useContext = (context) => context.current;
`;
function node(tree: unknown, predicate: (value: TestElement) => boolean): TestElement {
  const result = elements(tree).find(predicate);
  if (!result) throw new Error("Missing primitive element");
  return result;
}
function invoke(element: TestElement, name: string, ...args: unknown[]): unknown {
  const action = element.props[name];
  if (typeof action !== "function") throw new Error(`Missing ${name}`);
  return action(...args);
}

test("Expo dialog and tabs preserve public entrypoints with closed, bounded modules in both modes", async () => {
  for (const mode of ["monorepo", "single"] as const) {
    const root = mode === "monorepo" ? "apps/mobile/src" : "src";
    const all = generateProjectFiles(
      projectConfigSchema.parse({
        name: "expo-primitives",
        mode,
        framework: "nextjs",
        database: "none",
        preset: "frontend",
        billing: [],
        features: [],
        apps: ["mobile"],
      }),
      { dryRun: true },
    );
    const paths = new Set(all.map((file) => file.path));
    const files = [...rnrDialogFiles(root), ...rnrTabsFiles(root)];
    expect(files).toHaveLength(6);
    for (const file of files) {
      expect(paths.has(file.path), file.path).toBe(true);
      const formatted = await formatGenerationText(file.path, file.content);
      expect(formatted.split(/\r?\n/).length, file.path).toBeLessThanOrEqual(150);
      const parsed = parseFile(formatted, file.path.endsWith(".tsx") ? ".tsx" : ".ts");
      expect(parsed.diagnostics, file.path).toEqual([]);
      for (const target of parsed.imports.filter((entry) => entry.startsWith("."))) {
        const stem = posix.normalize(posix.join(posix.dirname(file.path), target));
        expect(
          [stem, stem + ".ts", stem + ".tsx"].some((path) => paths.has(path)),
          `${file.path} -> ${target}`,
        ).toBe(true);
      }
    }
    expect(files[0]!.content).toContain(
      'export { DialogContent, type DialogContentProps } from "./dialog-content"',
    );
    expect(files[3]!.content).toContain(
      'export { TabsTrigger, type TabsTriggerProps } from "./tabs-trigger"',
    );
  }
});

test("dialog extraction preserves controlled and uncontrolled state, trigger events, and focus restoration", () => {
  const changes: boolean[] = [];
  const focus: unknown[][] = [];
  const source =
    contextRuntime +
    rnrDialogFiles()
      .filter((file) => !file.path.endsWith("dialog-content.tsx"))
      .map((file) => file.content)
      .reverse()
      .join("\n") +
    `
function renderDialog(props) { const tree = Dialog(props); DialogContext.current = tree.props.value; return tree; }
`;
  const ui = generatedFormHarness(source, ["renderDialog", "DialogTrigger"], {
    View: "View",
    Pressable: "Pressable",
    Text: "Text",
    AccessibilityInfo: { sendAccessibilityEvent: (...args: unknown[]) => focus.push(args) },
    requestAnimationFrame: (callback: () => void) => callback(),
  });
  const render = (props: Record<string, unknown> = {}) =>
    ui.render("renderDialog", {
      onOpenChange: (value: boolean) => changes.push(value),
      ...props,
    }) as TestElement;
  let root = render();
  expect(root.props.value).toMatchObject({ open: false });
  const order: string[] = [];
  const trigger = ui.render("DialogTrigger", {
    children: "Open settings",
    onPress: () => order.push("caller"),
    className: "custom-trigger",
  }) as TestElement;
  expect(trigger.props.accessibilityLabel).toBe("Open settings");
  expect(trigger.props.className).toContain("min-h-11 min-w-11");
  invoke(trigger, "onPress", {});
  root = render();
  expect(root.props.value).toMatchObject({ open: true });
  expect(order).toEqual(["caller"]);
  const context = root.props.value as { close(): void; triggerRef: { current: unknown } };
  context.triggerRef.current = "trigger-node";
  context.close();
  expect(render().props.value).toMatchObject({ open: false });
  expect(focus).toEqual([["trigger-node", "focus"]]);
  render({ open: false });
  invoke(ui.render("DialogTrigger", { children: "Open" }) as TestElement, "onPress", {});
  expect(render({ open: false }).props.value).toMatchObject({ open: false });
  expect(changes).toEqual([true, false, true]);
});

test("dialog modal retains reduced motion, native dismissal, content focus, and subscription cleanup", async () => {
  const initialMotion = deferred<boolean>();
  const callbacks: Record<string, (value?: boolean) => unknown> = {};
  const removed: string[] = [];
  const focus: unknown[][] = [];
  let closed = 0;
  const context = {
    open: true,
    close: () => {
      closed++;
    },
  };
  const ui = generatedFormHarness(rnrDialogModalContent(), ["DialogContent"], {
    Modal: "Modal",
    View: "View",
    Pressable: "Pressable",
    useDialogContext: () => context,
    AccessibilityInfo: {
      isReduceMotionEnabled: () => initialMotion.promise,
      addEventListener: (name: string, callback: (value?: boolean) => unknown) => {
        callbacks[name] = callback;
        return { remove: () => removed.push(name) };
      },
      sendAccessibilityEvent: (...args: unknown[]) => focus.push(args),
    },
    BackHandler: {
      addEventListener: (name: string, callback: () => unknown) => {
        callbacks[name] = callback;
        return { remove: () => removed.push(name) };
      },
    },
  });
  const render = () =>
    ui.render("DialogContent", { children: "Content", accessibilityLabel: "Settings" });
  let tree = render();
  ui.flushEffects();
  expect(node(tree, (entry) => entry.type === "Modal").props.animationType).toBe("fade");
  const content = node(tree, (entry) => entry.props.role === "dialog");
  (content.props.ref as { current: unknown }).current = "content-node";
  invoke(
    node(tree, (entry) => entry.type === "Modal"),
    "onShow",
  );
  expect(focus).toEqual([["content-node", "focus"]]);
  expect(content.props.accessibilityViewIsModal).toBe(true);
  invoke(content, "onAccessibilityEscape");
  invoke(
    node(tree, (entry) => entry.type === "Modal"),
    "onRequestClose",
  );
  invoke(
    node(tree, (entry) => entry.type === "Pressable"),
    "onPress",
  );
  expect(callbacks.hardwareBackPress!()).toBe(true);
  expect(closed).toBe(4);
  initialMotion.resolve(true);
  await flush();
  tree = render();
  expect(node(tree, (entry) => entry.type === "Modal").props.animationType).toBe("none");
  context.open = false;
  expect(render()).toBeNull();
  ui.flushEffects();
  ui.unmount();
  expect(removed.sort()).toEqual(["hardwareBackPress", "reduceMotionChanged"]);
});

test("tabs extraction retains linked panels, selected and disabled semantics, and caller callbacks", () => {
  const changes: string[] = [];
  const source =
    contextRuntime +
    rnrTabsFiles()
      .sort(
        (a, b) =>
          Number(!a.path.endsWith("tabs-context.ts")) - Number(!b.path.endsWith("tabs-context.ts")),
      )
      .map((file) => file.content)
      .join("\n") +
    `
function renderTabs(props) { const tree = Tabs(props); TabsContext.current = tree.props.value; return tree; }
`;
  const ui = generatedFormHarness(source, ["renderTabs", "TabsTrigger", "TabsContent"], {
    View: "View",
    Pressable: "Pressable",
    Text: "Text",
  });
  const render = (props: Record<string, unknown> = {}) =>
    ui.render("renderTabs", {
      defaultValue: "first",
      nativeID: "settings",
      onValueChange: (value: string) => changes.push(value),
      ...props,
    }) as TestElement;
  render();
  let called = 0;
  const trigger = ui.render("TabsTrigger", {
    value: "second",
    children: "Second",
    onPress: () => called++,
  }) as TestElement;
  expect(trigger.props.nativeID).toBe("settings-tab-second");
  expect(trigger.props.accessibilityState).toMatchObject({ selected: false, disabled: false });
  invoke(trigger, "onPress", {});
  render();
  expect(ui.render("TabsContent", { value: "first" })).toBeNull();
  expect(ui.render("TabsContent", { value: "second" })).toMatchObject({
    props: { role: "tabpanel", "aria-labelledby": "settings-tab-second" },
  });
  expect(ui.render("TabsTrigger", { value: "second", disabled: true })).toMatchObject({
    props: { disabled: true, accessibilityState: { disabled: true, selected: true } },
  });
  render({ value: "first" });
  invoke(ui.render("TabsTrigger", { value: "second" }) as TestElement, "onPress", {});
  expect(render({ value: "first" }).props.value).toMatchObject({ value: "first" });
  expect(changes).toEqual(["second", "second"]);
  expect(called).toBe(1);
});
