import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { desktopEveFiles } from "../../src/templates/apps/fragments/eve/desktop.js";
import { expoEveFiles } from "../../src/templates/apps/fragments/eve/expo.js";
import { oxlintConfig } from "../../src/templates/root/config.js";
import { elements, generatedFormHarness, textContent } from "../helpers/generated-form-harness.js";

const prefix = "ghostinit-native-eve-lint-";
const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
const requirePackage = createRequire(import.meta.url);
const oxlint = join(dirname(requirePackage.resolve("oxlint/package.json")), "bin/oxlint");
const paths: string[] = [];
const controls: Array<{ path: string; name: string }> = [];

function read(files: ReturnType<typeof expoEveFiles>, suffix: string): string {
  const entry = files.find((item) => item.path.endsWith(suffix));
  if (!entry) throw new Error("Missing emitted native Eve file: " + suffix);
  return entry.content;
}

beforeAll(async () => {
  const transaction = new FsTransaction(root);
  for (const mode of ["single", "monorepo"] as const) {
    for (const i18n of [false, true]) {
      for (const platform of ["expo", "desktop"] as const) {
        const files = (platform === "expo" ? expoEveFiles : desktopEveFiles)(mode, i18n);
        const label = mode + "-" + platform + (i18n ? "-i18n" : "-english");
        for (const suffix of [
          "screen.tsx",
          "agent-prompt.tsx",
          "components/agent-view.tsx",
          "components/agent-prompt.tsx",
        ]) {
          const entry = files.find((item) => item.path.endsWith("/features/agent/" + suffix));
          if (!entry) throw new Error("Missing emitted native Eve surface");
          const path = label + "/" + suffix;
          await transaction.write(path, entry.content);
          paths.push(join(root, path));
        }
      }
    }
  }
  const expo = read(expoEveFiles("monorepo", true), "/components/agent-view.tsx");
  const expoControl = expo
    .replace("isAuthenticated: boolean;", "isAuthenticated: boolean; pending: boolean;")
    .replace("isAuthenticated, error,", "isAuthenticated, pending, error,");
  expect(expoControl).not.toBe(expo);
  const desktop = read(desktopEveFiles("monorepo", true), "/components/agent-prompt.tsx");
  const desktopControl = 'import { Button } from "@/components/ui/button";\n' + desktop;
  for (const [path, content, name] of [
    ["controls/unused-pending.tsx", expoControl, "pending"],
    ["controls/unused-button.tsx", desktopControl, "Button"],
  ]) {
    await transaction.write(path!, content!);
    controls.push({ path: join(root, path!), name: name! });
  }
  const config = oxlintConfig();
  await transaction.write(config.path, config.content);
  expect(transaction.getStagedFiles()).toHaveLength(paths.length + controls.length + 1);
  await transaction.commit();
});

afterAll(() => {
  if (dirname(root) !== realpathSync.native(tmpdir()) || !basename(root).startsWith(prefix)) {
    throw new Error("Refusing unsafe native Eve lint fixture cleanup");
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function lint(selected: readonly string[]) {
  const node = Bun.which("node");
  if (!node) throw new Error("Node is required for the installed oxlint CLI");
  const result = Bun.spawnSync(
    [node, oxlint, "--deny-warnings", "--config", join(root, ".oxlintrc.json"), ...selected],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20_000,
    },
  );
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + "\n" + result.stderr.toString(),
  };
}

describe("native Eve presentation lint and pending behavior", () => {
  test("all emitted native views and composition containers are lint-clean with and without i18n", () => {
    expect(paths).toHaveLength(32);
    const result = lint(paths);
    expect(result.exitCode, result.output).toBe(0);
  });

  test("the linter rejects the original unused Expo binding and desktop Button import", () => {
    for (const control of controls) {
      const result = lint([control.path]);
      expect(result.exitCode, result.output).not.toBe(0);
      expect(result.output).toContain("no-unused-vars");
      expect(result.output).toContain(control.name);
    }
  });

  test("desktop keeps its pending transcript marker and both prompts remain disabled while sending", () => {
    const desktop = desktopEveFiles("monorepo", false);
    const view = generatedFormHarness(read(desktop, "/components/agent-view.tsx"), ["AgentView"], {
      MessageScrollerProvider: "MessageScrollerProvider",
      MessageScroller: "MessageScroller",
      MessageScrollerViewport: "MessageScrollerViewport",
      MessageScrollerContent: "MessageScrollerContent",
      MessageScrollerButton: "MessageScrollerButton",
      MessageScrollerItem: "MessageScrollerItem",
      Marker: "Marker",
      MarkerContent: "MarkerContent",
      Empty: "Empty",
      EmptyHeader: "EmptyHeader",
      EmptyTitle: "EmptyTitle",
      EmptyDescription: "EmptyDescription",
    });
    const props = {
      isPending: false,
      isAuthenticated: true,
      messages: [],
      composer: null,
      error: null,
    };
    expect(
      elements(view.render("AgentView", { ...props, pending: true })).some(
        (node) => node.type === "Marker",
      ),
    ).toBe(true);
    expect(
      elements(view.render("AgentView", { ...props, pending: false })).some(
        (node) => node.type === "Marker",
      ),
    ).toBe(false);

    for (const platform of ["expo", "desktop"] as const) {
      const files = platform === "expo" ? expoEveFiles("monorepo", false) : desktop;
      const prompt = generatedFormHarness(
        read(files, "/components/agent-prompt.tsx"),
        ["AgentPromptView"],
        {
          View: "View",
          Text: "Text",
          NativeFormField: "NativeFormField",
        },
      );
      const form = {
        Field: "Field",
        AppField: "AppField",
        AppForm: "AppForm",
        SubmitButton: "SubmitButton",
        Subscribe: "Subscribe",
        handleSubmit() {},
      };
      const field = {
        state: { value: "A message", meta: { errors: [] } },
        handleChange() {},
        handleBlur() {},
        TextField: "TextField",
      };
      for (const pending of [false, true]) {
        const tree = prompt.render("AgentPromptView", {
          form,
          pending,
          label: "Message",
          placeholder: "Message",
          working: "Working",
          submitLabel: "Send",
        });
        const nodes = elements(tree);
        const fieldNode = nodes.find(
          (node) => node.type === (platform === "expo" ? "Field" : "AppField"),
        )!;
        const renderField = fieldNode.children[0] as (value: typeof field) => unknown;
        expect(elements(renderField(field))[0]?.props.disabled).toBe(pending);
        if (platform === "expo") {
          const subscribe = nodes.find((node) => node.type === "Subscribe")!;
          const renderButton = subscribe.children[0] as (hasMessage: boolean) => unknown;
          const active = renderButton(true);
          expect(elements(active)[0]?.props.disabled).toBe(pending);
          expect(textContent(active)).toBe(pending ? "Working" : "Send");
          expect(elements(renderButton(false))[0]?.props.disabled).toBe(true);
        } else {
          expect(nodes.find((node) => node.type === "SubmitButton")?.props.disabled).toBe(pending);
          expect(nodes.find((node) => node.type === "SubmitButton")?.props.pendingLabel).toBe(
            "Working",
          );
        }
      }
    }
  });
});
