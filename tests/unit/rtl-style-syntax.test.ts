import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { nativeMessagingCommandFiles } from "../../src/templates/apps/fragments/messaging/native-command-gate.js";
import { desktopPackageJsonContent } from "../../src/templates/apps/desktop/package.js";
import {
  singlePackageJson,
  singlePackageJsonExpo,
  singlePackageJsonTanstack,
} from "../../src/templates/modes/single/package.js";
import { rootPackageJson } from "../../src/templates/root/package.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { tooling } from "../../packages/versions/src/index.js";

const workspace = resolve(import.meta.dir, "../..");
const prefix = "ghostinit-rtl-style-syntax-";
const roots: string[] = [];
const tick = String.fromCharCode(96);
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== realpathSync.native(tmpdir()) || !basename(root).startsWith(prefix)) {
      throw new Error("Refusing unsafe RTL fixture cleanup");
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
async function fixture(files: ReadonlyArray<{ path: string; content: string }>): Promise<string> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  const scripts = lintScriptFiles().filter(({ path }) =>
    ["scripts/check-rtl-logical.cjs", "scripts/lib/oxc.cjs"].includes(path),
  );
  const transaction = new FsTransaction(root);
  for (const file of [...scripts, ...files]) await transaction.write(file.path, file.content);
  expect(transaction.getStagedFiles()).toHaveLength(scripts.length + files.length);
  await transaction.commit();
  return root;
}
function run(root: string, runtime: "bun" | "node") {
  const executable = runtime === "bun" ? process.execPath : Bun.which("node");
  if (!executable) throw new Error("Node is required for RTL portability controls");
  const result = spawnSync(executable, [join(root, "scripts/check-rtl-logical.cjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, NODE_PATH: resolve(workspace, "node_modules") },
  });
  return { exitCode: result.status ?? -1, output: (result.stdout ?? "") + (result.stderr ?? "") };
}
describe("RTL object-style syntax", () => {
  test("real messaging comparators, types, destructuring, comments and logical styles pass", async () => {
    const root = await fixture([
      ...nativeMessagingCommandFiles("apps/mobile/src/features/messaging", "@"),
      ...nativeMessagingCommandFiles("apps/desktop/src/renderer/features/messaging", "@"),
      {
        path: "src/features/non-styles.tsx",
        content: [
          "interface Bounds { left: number; right: number; 'marginLeft': number; }",
          "type Compare = (left: string, right: string) => boolean;",
          "export const compare: Compare = (left: string, right: string) => left === right;",
          "export function compareBounds({ left: lhs, right: rhs }: Bounds) { return lhs === rhs; }",
          "export const example = '{ right: 0, marginLeft: 1 }';",
          "// A code example: { left: 0, paddingRight: 2 }",
          "/* Another example: { borderLeft: 1 } */",
          "const right = 'insetInlineEnd';",
          "export const computedLogical = { [right]: 1 };",
          "export const methods = { right() { return 1; }, get left() { return 2; } };",
          "export const logical = { insetInlineStart: 0, marginInlineEnd: 2 };",
          'export const View = () => <div className="text-start ps-2 ms-4 border-s">{/* {right: 0} */}</div>;',
        ].join("\n"),
      },
    ]);
    for (const runtime of ["bun", "node"] as const) {
      const result = run(root, runtime);
      expect(result.exitCode, runtime + ": " + result.output).toBe(0);
      expect(result.output).toContain("RTL logical direction check passed.");
    }
  });
  test("inline, extracted, multiline, nested, quoted and static computed physical properties fail", async () => {
    const cases = [
      [
        "src/features/inline.tsx",
        "export const View = () => <div style={{ right: 0 }} />;",
        1,
        "right:",
      ],
      [
        "src/features/multiline.ts",
        "export const styles = [\n  {\n    marginLeft: 2,\n  },\n];",
        3,
        "marginLeft:",
      ],
      ["src/features/quoted.js", 'export const style = { "paddingRight": 4 };', 1, "paddingRight:"],
      [
        "src/features/computed.jsx",
        'export const View = () => <div style={{ ["borderLeft"]: 1 }} />;',
        1,
        "borderLeft:",
      ],
      [
        "src/features/template.ts",
        "export const style = { [" + tick + "marginRight" + tick + "]: 2 };",
        1,
        "marginRight:",
      ],
      [
        "apps/mobile/src/styles.ts",
        "const styles = StyleSheet.create({\n  item: {\n    left: 0,\n  },\n});",
        3,
        "left:",
      ],
      [
        "src/features/conditional.ts",
        "export const style = active ? { paddingLeft: 0 } : { borderRight: 0 };",
        1,
        "paddingLeft:",
      ],
      [
        "src/features/asserted.tsx",
        "export const style = ({ right: 0 } satisfies React.CSSProperties);",
        1,
        "right:",
      ],
      [
        "src/features/jsx-in-js.js",
        "export const View = () => <div style={{ left: 0 }} />;",
        1,
        "left:",
      ],
      ["src/features/spread.ts", "export const style = { ...{ right: 0 } };", 1, "right:"],
      [
        "src/features/shorthand.js",
        "const right = 0; export const style = { right };",
        1,
        "right:",
      ],
    ] as const;
    const root = await fixture(cases.map(([path, content]) => ({ path, content })));
    for (const runtime of ["bun", "node"] as const) {
      const result = run(root, runtime);
      expect(result.exitCode, runtime + ": " + result.output).toBe(1);
      for (const [path, , line, token] of cases)
        expect(result.output).toContain(path + ":" + line + " [style] " + token);
      expect(result.output).toContain("[style] borderRight:");
    }
  });
  test("CSS, template-literal utilities and token-scoped exceptions keep their original behavior", async () => {
    const root = await fixture([
      {
        path: "src/styles/physical.css",
        content: ".physical { margin-left: 1rem; text-align: right; }\n",
      },
      {
        path: "src/components/physical.tsx",
        content:
          "export const View = () => <div className={" + tick + "text-left mr-2" + tick + "} />;\n",
      },
      {
        path: "src/components/ui/popover.tsx",
        content:
          'export const Popover = () => <div className="data-[side=left]:slide-in-from-right-2 ml-4" />;\n',
      },
    ]);
    for (const runtime of ["bun", "node"] as const) {
      const result = run(root, runtime);
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain("src/styles/physical.css:1 [css] margin-left:");
      expect(result.output).toContain("[css] text-align: right");
      expect(result.output).toContain("src/components/physical.tsx:1 [utility] text-left");
      expect(result.output).toContain("[utility] mr-2");
      expect(result.output).toContain("src/components/ui/popover.tsx:1 [utility] ml-4");
      expect(result.output).not.toContain("[utility] data-[side=left]");
    }
  });
  test("malformed owned JS and TS fail closed with their real filename", async () => {
    for (const extension of ["ts", "tsx", "js", "jsx"]) {
      const path = "src/features/invalid." + extension;
      const root = await fixture([{ path, content: "export const broken = { right: ;\n" }]);
      for (const runtime of ["bun", "node"] as const) {
        const result = run(root, runtime);
        expect(result.exitCode, result.output).toBe(2);
        expect(result.output).toContain("Parser diagnostics in " + path + ":");
        expect(result.output).not.toContain("check passed");
      }
    }
  });
  test("every root and standalone platform already declares the catalog parser", () => {
    for (const runtime of ["bun", "node"] as const) {
      const manifests = [
        rootPackageJson("demo", runtime).content,
        singlePackageJson("demo", runtime, [], false, false),
        singlePackageJsonTanstack("demo", runtime, [], false, false),
        singlePackageJsonExpo("demo", runtime, [], false, false, false, true),
        desktopPackageJsonContent(runtime, undefined, "single"),
      ];
      for (const content of manifests) {
        const manifest = JSON.parse(content) as { devDependencies: Record<string, string> };
        expect(manifest.devDependencies["oxc-parser"]).toBe(tooling["oxc-parser"]);
      }
    }
  });
});
