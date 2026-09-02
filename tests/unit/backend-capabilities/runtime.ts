import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

interface RenderedFile {
  path: string;
  content: string;
}

export async function importRenderedService<T>(
  name: string,
  prefix: string,
  files: readonly RenderedFile[],
): Promise<{ module: T; root: string }> {
  const root = mkdtempSync(join(tmpdir(), `ghostinit-${name}-runtime-`));
  for (const entry of files) {
    if (!entry.path.startsWith(prefix)) {
      throw new Error(`Rendered path ${entry.path} is outside ${prefix}`);
    }
    const target = join(root, entry.path.slice(prefix.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content, "utf8");
  }
  const serverOnlyRoot = join(root, "node_modules", "server-only");
  mkdirSync(serverOnlyRoot, { recursive: true });
  writeFileSync(join(serverOnlyRoot, "package.json"), '{"type":"module","exports":"./index.js"}\n');
  writeFileSync(join(serverOnlyRoot, "index.js"), "export {};\n");
  const module = (await import(pathToFileURL(join(root, "index.ts")).href)) as T;
  return { module, root };
}

export async function expectErrorCode(work: Promise<unknown>, code: string): Promise<void> {
  try {
    await work;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}
