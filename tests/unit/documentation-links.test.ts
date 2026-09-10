import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "../..");
const decoder = new TextDecoder();
const inlineLink = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g;
const referenceLink = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm;
const externalTarget = /^(?:https?:|mailto:|tel:|data:|javascript:|app:|\/\/)/i;
const retiredDocumentation = [
  /(?<![\w.-])(?:docs[\\/])?ARCHITECTURE(?:_CHECKER)?\.md\b/i,
  /(?<![\w.-])(?:docs[\\/])?RESEARCH\.md\b/i,
  /(?:^|[\\/])docs[\\/]compatibility[\\/]v1-to-v2(?:\.schema)?\.json\b/i,
  /(?:^|[\\/])docs[\\/]superpowers[\\/](?:plans|specs)[\\/]/i,
] as const;

function trackedMarkdownPaths(): string[] {
  const result = Bun.spawnSync({
    cmd: ["git", "ls-files", "-z", "--", "*.md"],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, decoder.decode(result.stderr)).toBe(0);
  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter((path) => path.length > 0 && existsSync(resolve(root, path)));
}

function markdownTargets(source: string): string[] {
  const targets: string[] = [];
  for (const expression of [inlineLink, referenceLink]) {
    expression.lastIndex = 0;
    for (const match of source.matchAll(expression)) {
      const target = match[1] ?? match[2];
      if (target) targets.push(target);
    }
  }
  return targets;
}

test("retired documentation detection matches exact filenames and preserves current references", () => {
  for (const source of [
    "ARCHITECTURE.md",
    "Read ARCHITECTURE.md.",
    "See `ARCHITECTURE_CHECKER.md`.",
    "[architecture](./docs/ARCHITECTURE.md)",
    "`docs\\ARCHITECTURE_CHECKER.md`",
    "RESEARCH.md",
    "[research](../docs/research.md)",
    "[ledger](./docs/compatibility/v1-to-v2.json)",
    "[schema](./docs/compatibility/v1-to-v2.schema.json)",
    "[plan](./docs/superpowers/plans/example.md)",
    "[spec](./docs/superpowers/specs/example.md)",
  ]) {
    expect(
      retiredDocumentation.some((pattern) => pattern.test(source)),
      source,
    ).toBe(true);
  }
  for (const source of [
    "[frontend architecture](./skills/ghostinit-use/references/frontend-architecture.md)",
    "`references/frontend-architecture.md`",
    "[research methods](./docs/user-research.md)",
    "[ledger](./evidence/compatibility/v1-to-v2.json)",
    "[schema](./evidence/compatibility/v1-to-v2.schema.json)",
    "[record](./docs/engineering/frontend-task-records/design-system-contract-v1.json)",
  ]) {
    expect(
      retiredDocumentation.some((pattern) => pattern.test(source)),
      source,
    ).toBe(false);
  }
});

test("every local link in tracked Markdown resolves inside the repository", () => {
  const markdownPaths = trackedMarkdownPaths();
  const invalid: string[] = [];

  for (const markdownPath of markdownPaths) {
    const source = readFileSync(resolve(root, markdownPath), "utf8");
    for (const rawTarget of markdownTargets(source)) {
      if (rawTarget.startsWith("#") || externalTarget.test(rawTarget)) continue;
      const encodedPath = rawTarget.split(/[?#]/, 1)[0];
      if (!encodedPath) continue;

      let targetPath: string;
      try {
        targetPath = decodeURIComponent(encodedPath);
      } catch {
        invalid.push(`${markdownPath} -> ${rawTarget} (invalid URL encoding)`);
        continue;
      }

      const absolute = isAbsolute(targetPath)
        ? targetPath
        : resolve(root, dirname(markdownPath), targetPath);
      const repositoryRelative = relative(root, absolute);
      const escapesRepository =
        repositoryRelative === ".." ||
        repositoryRelative.startsWith(`..${sep}`) ||
        isAbsolute(repositoryRelative);
      if (escapesRepository || !existsSync(absolute)) {
        invalid.push(`${markdownPath} -> ${rawTarget}`);
      }
    }
  }

  expect(markdownPaths.length).toBeGreaterThan(0);
  expect(invalid).toEqual([]);
});

test("tracked Markdown does not reference retired documentation locations", () => {
  const offenders: string[] = [];
  for (const markdownPath of trackedMarkdownPaths()) {
    const source = readFileSync(resolve(root, markdownPath), "utf8");
    for (const pattern of retiredDocumentation) {
      if (pattern.test(source)) offenders.push(markdownPath);
    }
  }

  expect(offenders.toSorted()).toEqual([]);
});
