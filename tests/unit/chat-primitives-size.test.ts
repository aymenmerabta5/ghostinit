import { describe, expect, test } from "bun:test";
import { extname, posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const CHAT_MODULES = [
  "chat.tsx",
  "chat/attachment.tsx",
  "chat/bubble.tsx",
  "chat/marker.tsx",
  "chat/message.tsx",
  "chat/scroller.tsx",
] as const;

const PUBLIC_EXPORTS = [
  "Attachment",
  "AttachmentActions",
  "AttachmentContent",
  "AttachmentDescription",
  "AttachmentGroup",
  "AttachmentMedia",
  "AttachmentProps",
  "AttachmentTitle",
  "Bubble",
  "BubbleContent",
  "BubbleProps",
  "Marker",
  "MarkerContent",
  "MarkerProps",
  "Message",
  "MessageAvatar",
  "MessageContent",
  "MessageFooter",
  "MessageGroup",
  "MessageHeader",
  "MessageProps",
  "MessageScroller",
  "MessageScrollerButton",
  "MessageScrollerContent",
  "MessageScrollerItem",
  "MessageScrollerItemProps",
  "MessageScrollerProvider",
  "MessageScrollerViewport",
] as const;

function format(path: string, content: string): string {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout);
}

function importCandidates(path: string, specifier: string): string[] {
  const unresolved = posix.normalize(posix.join(posix.dirname(path), specifier));
  const withoutJs = unresolved.replace(/\.js$/, "");
  return [
    unresolved,
    withoutJs,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}/index.ts`,
    `${withoutJs}/index.tsx`,
  ];
}

function config(mode: "monorepo" | "single", framework: "nextjs" | "tanstack-start") {
  return projectConfigSchema.parse({
    name: `chat-primitives-${mode}-${framework}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps: mode === "monorepo" ? ["web", "desktop"] : ["web"],
    preset: "custom",
    auth: true,
    api: true,
    messaging: true,
    billing: [],
    features: [],
  });
}

function assertChatModules(
  label: string,
  files: ReturnType<typeof generateProjectFiles>,
  roots: readonly string[],
): void {
  const byPath = new Map(files.map((entry) => [entry.path, entry.content]));
  for (const root of roots) {
    const expected = CHAT_MODULES.map((module) => `${root}/components/ui/${module}`).sort();
    const emitted = files
      .filter(({ path }) => path.startsWith(`${root}/components/ui/chat`))
      .map(({ path }) => path)
      .sort();
    expect(emitted, label).toEqual(expected);

    for (const path of expected) {
      const source = format(path, byPath.get(path) ?? "");
      expect(source.split(/\r?\n/).length, `${label}: ${path}`).toBeLessThanOrEqual(150);
      expect(source, path).not.toContain("@allow-long");
      const parsed = parseFile(source, extname(path));
      expect(parsed.diagnostics, path).toEqual([]);
      for (const specifier of parsed.imports.filter((entry) => entry.startsWith("."))) {
        expect(
          importCandidates(path, specifier).some((candidate) => byPath.has(candidate)),
          `${path} -> ${specifier}`,
        ).toBe(true);
      }
    }

    const barrel = format(
      `${root}/components/ui/chat.tsx`,
      byPath.get(`${root}/components/ui/chat.tsx`) ?? "",
    );
    expect(barrel).not.toMatch(/export\s+\*/);
    expect(barrel).not.toContain("React.forwardRef");
    for (const symbol of PUBLIC_EXPORTS)
      expect(barrel, symbol).toMatch(new RegExp(`\\b${symbol}\\b`));
  }
}

describe("generated chat primitive module budgets", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} formats into closed modules at or below 150 lines`, () => {
        const files = generateProjectFiles(config(mode, framework), { dryRun: true });
        assertChatModules(
          `${mode}/${framework}`,
          files,
          mode === "monorepo" ? ["apps/web/src", "apps/desktop/src/renderer"] : ["src"],
        );
      });
    }
  }

  test("single Electron emits the same bounded public chat surface", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "chat-primitives-single-electron",
        runtime: "bun",
        version: "0.1.0",
        mode: "single",
        framework: "nextjs",
        database: "none",
        apps: ["desktop"],
        preset: "frontend",
        auth: false,
        api: false,
        billing: [],
        features: [],
      }),
      { dryRun: true },
    );
    assertChatModules("single/electron", files, ["src"]);
  });
});
