import { file, type TemplateFile } from "../shared.js";

export function huskyFiles(): TemplateFile[] {
  return [
    file(
      ".husky/pre-commit",
      `#!/usr/bin/env sh
# GhostInit pre-commit — lint + format + architecture
# Installed via \`bunx husky init\` or \`npx husky init\`. If husky is not installed, run:
#   bun add -d husky && bunx husky init
# Or use lefthook: see lefthook.yml

set -e

echo "[pre-commit] oxlint..."
bunx oxlint . 2>/dev/null || bun run lint 2>/dev/null || npx oxlint . 2>/dev/null || echo "oxlint not found, skipping"

echo "[pre-commit] oxfmt check..."
bunx oxfmt --check . 2>/dev/null || bun run format:check 2>/dev/null || npx oxfmt --check . 2>/dev/null || echo "oxfmt not found, skipping"

echo "[pre-commit] ghostinit check..."
# Prefer local ghostinit binary if available, else try npx
if [ -f "./dist/cli.js" ]; then
  node ./dist/cli.js check 2>/dev/null || bun run check 2>/dev/null || true
elif command -v ghostinit >/dev/null 2>&1; then
  ghostinit check 2>/dev/null || true
elif [ -f "./node_modules/.bin/ghostinit" ]; then
  ./node_modules/.bin/ghostinit check 2>/dev/null || true
else
  npx --yes ghostinit check 2>/dev/null || true
fi

echo "[pre-commit] ok"
`,
    ),
    file(
      "lefthook.yml",
      `# GhostInit lefthook alternative to husky
# Install: bun add -d lefthook && bunx lefthook install
# Docs: https://github.com/evilmartians/lefthook
pre-commit:
  parallel: false
  commands:
    oxlint:
      run: bunx oxlint . || bun run lint
    oxfmt:
      run: bunx oxfmt --check . || bun run format:check
    arch:
      run: npx --yes ghostinit check 2>/dev/null || bun run check 2>/dev/null || true
`,
    ),
  ];
}
