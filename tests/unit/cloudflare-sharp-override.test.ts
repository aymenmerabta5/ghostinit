import { describe, expect, test } from "bun:test";
import { cloudflare, pdf } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

function overrides(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
  deploy: "cloudflare" | "none",
  withPdf = false,
) {
  const resolution = resolveCreateConfig({
    name: "sharp-override",
    runtime: "bun",
    mode,
    framework,
    database: withPdf ? "postgres" : "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    billing: [],
    features: [],
    cache: "none",
    deploy,
    withAuth: withPdf,
    withApi: true,
    withPdf,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
  const root = plan.files.find((file) => file.physicalPath === "package.json");
  if (!root) throw new Error("Missing generated root manifest");
  return (JSON.parse(root.content) as { overrides?: Record<string, string> }).overrides ?? {};
}

describe("reviewed Sharp Worker override scope", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} Workers select the exact reviewed catalog release`, () => {
        expect(overrides(mode, framework, "cloudflare")).toEqual({ sharp: cloudflare.sharp });
      });
      test(`${mode}/${framework} non-Worker PDF overrides are preserved`, () => {
        expect(overrides(mode, framework, "none")).not.toHaveProperty("sharp");
        expect(overrides(mode, framework, "none", true)).toEqual({ pdfkit: pdf.pdfkit });
      });
    }
  }
});
