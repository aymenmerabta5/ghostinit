import { describe, expect, test } from "bun:test";
import { extname, posix } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

const POLAR_PROVIDER_FILES = [
  "polar-benefits.tsx",
  "polar-panel.tsx",
  "polar-subscriptions.tsx",
] as const;

function config(mode: Mode, framework: Framework): ProjectConfig {
  return projectConfigSchema.parse({
    name: `polar-panel-${mode}-${framework}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: ["polar"],
    features: [],
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
  });
}

function formattedLineCount(path: string, content: string): number {
  const result = Bun.spawnSync(
    [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", path],
    {
      stdin: new TextEncoder().encode(content),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
}

function importCandidates(path: string, specifier: string, sourceRoot: string): string[] {
  const unresolved = specifier.startsWith("@/")
    ? `${sourceRoot}/${specifier.slice(2)}`
    : posix.normalize(posix.join(posix.dirname(path), specifier));
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

describe("generated Polar provider panel boundaries", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode}/Next emits bounded parseable Polar components with closed imports`, () => {
      const generated = generateProjectFiles(config(mode, "nextjs"), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
      const providerRoot = `${sourceRoot}/features/billing/components/providers`;
      const polarFiles = generated.filter(({ path }) => path.startsWith(`${providerRoot}/polar-`));

      expect(polarFiles.map(({ path }) => posix.basename(path)).sort()).toEqual(
        [...POLAR_PROVIDER_FILES].sort(),
      );

      const unresolvedImports: string[] = [];
      for (const generatedFile of polarFiles) {
        const parsed = parseFile(generatedFile.content, extname(generatedFile.path));
        expect(parsed.diagnostics, generatedFile.path).toEqual([]);
        const maximum = generatedFile.path.endsWith("/polar-panel.tsx") ? 120 : 150;
        expect(
          formattedLineCount(generatedFile.path, generatedFile.content),
          generatedFile.path,
        ).toBeLessThan(maximum);
        expect(generatedFile.content, generatedFile.path).not.toContain("@allow-long");
        for (const specifier of parsed.imports.filter(
          (candidate) => candidate.startsWith("./") || candidate.startsWith("@/"),
        )) {
          if (
            !importCandidates(generatedFile.path, specifier, sourceRoot).some((candidate) =>
              byPath.has(candidate),
            )
          ) {
            unresolvedImports.push(`${generatedFile.path} -> ${specifier}`);
          }
        }
      }
      expect(unresolvedImports).toEqual([]);

      const panel = byPath.get(`${providerRoot}/polar-panel.tsx`) ?? "";
      expect(panel).toContain('from "./polar-benefits"');
      expect(panel).toContain('from "./polar-subscriptions"');
      expect(panel).toContain('handleCheckout("polar")');
      expect(panel).toContain('handlePortal("polar")');
      expect(panel).toContain('subscription.provider === "polar"');
      const combined = polarFiles.map(({ content }) => content).join("\n");
      for (const behavior of [
        "copyText(licenseKey.key)",
        "totalCredits",
        't("noUsageTitle")',
        "periodEnd(subscription.currentPeriodEnd)",
        't("noSubscriptionsTitle")',
      ]) {
        expect(combined, behavior).toContain(behavior);
      }
    });

    test(`${mode}/TanStack retains its route-owned billing presentation`, () => {
      const generated = generateProjectFiles(config(mode, "tanstack-start"), { dryRun: true });
      const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
      expect(
        generated.some(({ path }) =>
          path.startsWith(`${sourceRoot}/features/billing/components/providers/`),
        ),
      ).toBe(false);
      expect(generated.some(({ path }) => path === `${sourceRoot}/routes/billing.tsx`)).toBe(true);
    });
  }
});
