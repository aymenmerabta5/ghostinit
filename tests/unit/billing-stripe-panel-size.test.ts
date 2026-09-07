import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { parseSync } from "oxc-parser";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";

function config(
  mode: Mode,
  framework: "nextjs" | "tanstack-start" = "nextjs",
  billing: ProjectConfig["billing"] = ["stripe"],
): ProjectConfig {
  return {
    name: "stripe-panel-size",
    version: "0.1.0",
    runtime: "bun",
    mode,
    framework,
    database: "postgres",
    billing,
    features: [],
    apps: ["web"],
  } as ProjectConfig;
}

function formatted(path: string, source: string): string {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(source),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  return new TextDecoder().decode(result.stdout);
}

function relativeImports(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s+(?:type\s+)?[^"']*?from\s+["']([^"']+)["']/g)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => specifier.startsWith("."));
}

function candidates(path: string, specifier: string): string[] {
  const unresolved = posix.normalize(posix.join(posix.dirname(path), specifier));
  const extensionless = unresolved.replace(/\.[cm]?[jt]sx?$/, "");
  return [
    unresolved,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    `${extensionless}/index.ts`,
    `${extensionless}/index.tsx`,
  ];
}

describe("generated Stripe billing panel size", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} splits the Next.js panel into bounded, closed presentation files`, () => {
      const generated = generateProjectFiles(config(mode), { dryRun: true });
      const byPath = new Map(generated.map((entry) => [entry.path, entry.content]));
      const base = mode === "monorepo" ? "apps/web/src/app/billing" : "src/app/billing";
      const panelPath = `${base}/components/providers/stripe-panel.tsx`;
      const expected = [
        `${base}/components/providers/stripe-invoices.tsx`,
        panelPath,
        `${base}/components/providers/stripe-subscriptions.tsx`,
      ];

      expect(
        generated
          .map(({ path }) => path)
          .filter((path) => path.startsWith(`${base}/components/providers/stripe-`))
          .sort(),
      ).toEqual(expected);

      for (const path of expected) {
        const source = byPath.get(path);
        expect(source, `${path} was not generated`).toBeDefined();
        expect(parseSync(path, source ?? "").errors, path).toEqual([]);
        const canonical = formatted(path, source ?? "");
        expect(parseSync(path, canonical).errors, `${path} after formatting`).toEqual([]);
        expect(canonical.split(/\r?\n/).length, path).toBeLessThanOrEqual(
          path === panelPath ? 120 : 150,
        );
        for (const specifier of relativeImports(source ?? "")) {
          expect(
            candidates(path, specifier).some((candidate) => byPath.has(candidate)),
            `${path} -> ${specifier}`,
          ).toBe(true);
        }
      }

      const panel = byPath.get(panelPath) ?? "";
      expect(panel).toContain("<StripeSubscriptions subscriptions={stripeSubs}");
      expect(panel).toContain("<StripeInvoices invoices={stripeInvs}");
      expect(panel).toContain('handleCheckout("stripe")');
      expect(panel).toContain('handlePortal("stripe")');
      expect(panel).toContain("copyText(window.location.origin)");
    });
  }

  test("does not leak the Next.js provider panel into TanStack or non-Stripe output", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const generated of [
        generateProjectFiles(config(mode, "tanstack-start"), { dryRun: true }),
        generateProjectFiles(config(mode, "nextjs", ["chargily"]), { dryRun: true }),
      ]) {
        expect(
          generated
            .map(({ path }) => path)
            .filter((path) => path.includes("/components/providers/stripe-")),
        ).toEqual([]);
      }
    }
  });
});
