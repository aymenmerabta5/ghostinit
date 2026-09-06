import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pdfFilesWithApps } from "../../src/templates/pdf/index.js";

export interface PdfLayoutNode {
  type: string;
  value?: string;
  children?: PdfLayoutNode[];
  style?: Record<string, unknown>;
  props?: Record<string, unknown>;
  box?: { left: number; top: number; width: number; height: number };
  lines?: Array<{
    string: string;
    runs: Array<{ glyphs: Array<{ id: number; codePoints: number[] }> }>;
  }>;
}

export const layoutNodes = (node: PdfLayoutNode): PdfLayoutNode[] => [
  node,
  ...(node.children ?? []).flatMap(layoutNodes),
];
export const layoutText = (node: PdfLayoutNode): string =>
  node.type === "TEXT_INSTANCE"
    ? (node.value ?? "")
    : (node.children ?? []).map(layoutText).join("");

export async function pdfLayoutFixture() {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-pdf-layout-"));
  try {
    symlinkSync(
      resolve(import.meta.dir, "../../node_modules"),
      join(root, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const prefix = "packages/pdf/src/";
    for (const file of pdfFilesWithApps("monorepo", false, false, "nextjs", true).filter((entry) =>
      entry.path.startsWith(prefix),
    )) {
      const path = join(root, file.path.slice(prefix.length));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content);
    }
    const require = createRequire(import.meta.url);
    const react = (await import(pathToFileURL(require.resolve("react")).href)) as {
      cloneElement(element: unknown, props: unknown): unknown;
    };
    const load = async (path: string) =>
      (await import(pathToFileURL(join(root, path)).href)) as Record<string, unknown>;
    const renderer = (await load("lib/render.ts")) as {
      renderPdfToBuffer(element: unknown): Promise<Buffer>;
    };
    const templates = Object.fromEntries(
      await Promise.all(
        ["invoice", "certificate", "agreement"].map(async (name) => {
          const module = await load(`templates/${name}.tsx`);
          return [name, module[`${name[0]!.toUpperCase()}${name.slice(1)}Template`]];
        }),
      ),
    ) as Record<string, (props: Record<string, unknown>) => unknown>;
    const examples = Object.fromEntries(
      await Promise.all(
        ["invoice", "certificate", "agreement"].map(async (name) => {
          const module = await load(`examples/${name}.example.ts`);
          return [name, module[`example${name[0]!.toUpperCase()}${name.slice(1)}Data`]];
        }),
      ),
    ) as Record<string, Record<string, unknown>>;
    return {
      examples,
      async render(
        template: string,
        data: Record<string, unknown>,
        locale = "en",
        props: Record<string, unknown> = {},
      ) {
        let layout: PdfLayoutNode | undefined;
        const document = templates[template]!({ data, locale, ...props });
        const bytes = await renderer.renderPdfToBuffer(
          react.cloneElement(document, {
            onRender: (event: { _INTERNAL__LAYOUT__DATA_: PdfLayoutNode }) => {
              layout = event._INTERNAL__LAYOUT__DATA_;
            },
          }),
        );
        if (!layout) throw new Error("The real PDF renderer did not expose its completed layout");
        return { bytes, layout };
      },
      close() {
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
