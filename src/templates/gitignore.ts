/**
 * Canonical ignore policy for every generated GhostInit repository.
 *
 * Secret and tool-reserved names apply recursively. Generic output directory
 * names are anchored to generated workspace roots so a legitimate source path
 * such as `src/out/` remains trackable. Safe environment documentation is
 * re-included explicitly.
 */
export function generatedGitignoreContent(): string {
  return [
    "# Dependencies",
    "node_modules/",
    "",
    "# Framework and build artifacts",
    "/dist/",
    "/apps/*/dist/",
    "/packages/*/dist/",
    "/tooling/*/dist/",
    ".next/",
    ".output/",
    ".vercel/",
    ".open-next/",
    ".wrangler/",
    ".expo/",
    ".expo-shared/",
    "/web-build/",
    "/apps/*/web-build/",
    ".turbo/",
    ".eve/",
    "/out/",
    "/apps/*/out/",
    "/installers/",
    "/apps/*/installers/",
    "*.tsbuildinfo",
    "",
    "# Test and coverage reports",
    "/coverage/",
    "/apps/*/coverage/",
    "/packages/*/coverage/",
    "/tooling/*/coverage/",
    "/reports/",
    "/apps/*/reports/",
    "/packages/*/reports/",
    "/tooling/*/reports/",
    ".nyc_output/",
    "/playwright-report/",
    "/test-results/",
    "/blob-report/",
    "/allure-results/",
    "/apps/*/playwright-report/",
    "/apps/*/test-results/",
    "/apps/*/blob-report/",
    "/apps/*/allure-results/",
    "",
    "# Environment files may contain credentials",
    ".env",
    ".env.*",
    "!.env.example",
    "!.env.*.example",
    "!.env.template",
    "!.env.*.template",
    ".dev.vars",
    ".dev.vars.*",
    "!.dev.vars.example",
    "",
    "# Logs and operating-system metadata",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    "",
    "# GhostInit internal state",
    "/.ghostinit/",
    "/apps/*/.ghostinit/",
    "/.ghostinit-staging/",
    "/.ghostinit.lock",
    "",
  ].join("\n");
}

/** Keep generated POSIX scripts runnable after checkout on every host. */
export function generatedGitattributesContent(includePatchFiles = false): string {
  return [
    "*.sh text eol=lf",
    "/.husky/* text eol=lf",
    ...(includePatchFiles ? ["patches/*.patch text eol=lf"] : []),
    "",
  ].join("\n");
}
