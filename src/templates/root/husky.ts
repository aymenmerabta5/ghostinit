import { file, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export function huskyFiles(): TemplateFile[] {
  return [
    file(
      ".husky/pre-commit",
      `#!/usr/bin/env sh
# GhostInit pre-commit — lint + format + architecture
# Installed by the package.json prepare script. Or use lefthook: see lefthook.yml.

set -e

echo "[pre-commit] oxlint..."
bunx --no-install oxlint --deny-warnings .

echo "[pre-commit] oxfmt check..."
bunx --no-install oxfmt --check .

echo "[pre-commit] ghostinit check..."
# Never trust an unversioned global binary. Use an exact local package when
# present, otherwise acquire the exact generator version with Bun.
expected_ghostinit_version="${v.ghostinitVersion}"
if [ -f "./node_modules/ghostinit/package.json" ]; then
  installed_ghostinit_version="$(bun -e 'const manifest = await Bun.file("./node_modules/ghostinit/package.json").json(); process.stdout.write(String(manifest.version ?? ""));')"
  if [ "$installed_ghostinit_version" != "$expected_ghostinit_version" ]; then
    echo "[pre-commit] expected ghostinit@$expected_ghostinit_version, found ghostinit@$installed_ghostinit_version" >&2
    exit 1
  fi
  bun ./node_modules/ghostinit/dist/cli.js check --json
else
  bunx --bun "ghostinit@$expected_ghostinit_version" check --json
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
      run: bunx --no-install oxlint --deny-warnings .
    oxfmt:
      run: bunx --no-install oxfmt --check .
    arch:
      run: bunx --bun ghostinit@${v.ghostinitVersion} check --json
`,
    ),
  ];
}
