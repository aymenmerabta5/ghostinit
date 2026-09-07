import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { pdfLocaleContent } from "../../src/templates/pdf/lib/locale.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function generate(mode: Mode, framework: Framework): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "i18n-completion",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database: "postgres",
      apps: mode === "monorepo" ? ["web", "mobile", "desktop"] : ["web"],
      preset: "custom",
      cache: "redis",
      deploy: "none",
      auth: true,
      api: true,
      email: true,
      analytics: true,
      eve: true,
      i18n: true,
      pdf: true,
      billing: ["stripe", "chargily", "paddle", "polar"],
      features: [],
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    }),
    { dryRun: true, validate: true },
  );
}

function sourceRoot(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/src" : "src";
}

function read(files: readonly TemplateFile[], path: string): string {
  const entry = files.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`Missing generated file: ${path}`);
  return entry.content;
}

function flatten(value: unknown, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result.set(path, child);
    else for (const [childPath, message] of flatten(child, path)) result.set(childPath, message);
  }
  return result;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("completed application localization", () => {
  test("keeps every catalog leaf and interpolation token in exact EN/FR/AR parity", () => {
    const catalogs = [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES].map((catalog) => flatten(catalog));
    const english = catalogs[0] ?? new Map<string, string>();
    const englishKeys = [...english.keys()].sort();

    expect(englishKeys.length).toBeGreaterThan(1_000);
    for (const catalog of catalogs) {
      expect([...catalog.keys()].sort()).toEqual(englishKeys);
      expect([...catalog.values()].filter((message) => message.trim().length === 0)).toEqual([]);
      for (const key of englishKeys) {
        expect(placeholders(catalog.get(key) ?? ""), key).toEqual(
          placeholders(english.get(key) ?? ""),
        );
      }
    }

    expect(FR_MESSAGES.auth.emailFlow.magicLinkSuccess).not.toBe(
      EN_MESSAGES.auth.emailFlow.magicLinkSuccess,
    );
    expect(AR_MESSAGES.billing.algeriaMarketDescription).toMatch(/[\u0600-\u06ff]/);
    expect(AR_MESSAGES.pdf.document.invoice).toBe("فاتورة");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} translates recovery, settings, common states, and root errors`, () => {
        const files = generate(mode, framework);
        const root = sourceRoot(mode);
        const magicLink = read(
          files,
          framework === "nextjs"
            ? `${root}/app/magic-link/page.client.tsx`
            : `${root}/routes/magic-link.tsx`,
        );
        const verifyEmail = read(
          files,
          framework === "nextjs"
            ? `${root}/app/verify-email/page.client.tsx`
            : `${root}/routes/verify-email.tsx`,
        );
        for (const flow of [magicLink, verifyEmail]) {
          expect(flow).toContain('useSurfaceTranslations("auth")');
          expect(flow).toContain('t("emailFlow.kicker")');
          expect(flow).toContain('t("emailFlow.requestErrorTitle")');
          expect(flow).toContain('t("emailFlow.requestedTitle")');
          expect(flow).not.toMatch(/>\s*(?:Secure email flow|Request failed|Email requested)\s*</);
          expect(flow).not.toContain('setError(result.error.message ?? "Unable to send email")');
        }

        const settings = read(
          files,
          framework === "nextjs"
            ? `${root}/app/settings/layout.tsx`
            : `${root}/routes/settings.tsx`,
        );
        expect(settings).toContain('t("workspace")');
        expect(settings).not.toMatch(/>\s*Workspace\s*</);

        expect(read(files, `${root}/components/form-fields/PasswordField.tsx`)).toContain(
          't("hidePassword")',
        );
        expect(read(files, `${root}/components/ui/spinner.tsx`)).toContain('t("loading")');
        expect(read(files, `${root}/components/ui/dialog.tsx`)).toContain('t("close")');
        expect(read(files, `${root}/components/ui/breadcrumb.tsx`)).toContain('t("breadcrumb")');
        expect(read(files, `${root}/components/ui/chat/scroller.tsx`)).toContain(
          't("jumpToLatest")',
        );

        const rootShell = read(
          files,
          framework === "nextjs" ? `${root}/app/layout.tsx` : `${root}/routes/__root.tsx`,
        );
        if (framework === "nextjs") {
          expect(rootShell).toContain("<StandaloneLocaleLoadingFallback />");
          expect(rootShell).not.toContain('aria-label="Loading locale"');
        } else {
          expect(rootShell).toContain("errorComponent: RootErrorComponent");
          expect(rootShell).toContain('useStandaloneSurfaceTranslations("errors")');
          expect(rootShell).toContain('t("notFound.shortDescription")');
          expect(rootShell).toContain("localeMetadata[loaderData ?? defaultLocale].title");
          expect(rootShell).toContain("localeMetadata[loaderData ?? defaultLocale].description");
          expect(rootShell).not.toMatch(
            />\s*(?:Something went wrong|Page not found|The page does not exist\.)\s*</,
          );
        }
      });
    }
  }

  test("keeps every top-level catalog namespace reachable in maximal generated output", () => {
    const explicitConsumers: Readonly<Record<string, RegExp>> = {
      transactionalEmail: /transactionalEmail(?:Body|Subject)\(/,
      metadata: /(?:getSurfaceTranslations\("metadata"\)|localeMetadata\[)/,
    };

    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const source = generate("monorepo", framework)
        .filter(({ path }) => /\.[cm]?[jt]sx?$/.test(path))
        .map(({ content }) => content)
        .join("\n");
      for (const namespace of Object.keys(EN_MESSAGES)) {
        const consumer =
          explicitConsumers[namespace] ??
          new RegExp(
            `(?:use|get)(?:Standalone|Surface|Framework)?Translations\\(\\s*["']${namespace}["']`,
          );
        expect(source, `${framework} catalog namespace ${namespace}`).toMatch(consumer);
      }
    }
  });

  test("translates provider billing details without translating protocol identifiers", () => {
    const files = generate("monorepo", "nextjs");
    const root = sourceRoot("monorepo");
    const billing = files
      .filter(({ path }) => path.startsWith(`${root}/app/billing/`) && path.endsWith(".tsx"))
      .map(({ content }) => content)
      .join("\n");

    for (const key of [
      "algeriaMarketTitle",
      "dualMarketDescription",
      "chargilyServerDescription",
      "paddleTaxDescription",
      "stripeFlowDescription",
      "polarFlowDescription",
      "licenseDescription",
      "usageDescription",
      "seats",
    ]) {
      expect(billing, key).toContain(`t("${key}"`);
    }
    expect(billing).not.toContain("Chargily alone for Algeria market");
    expect(billing).not.toContain("Paddle handles VAT and sales tax globally");
    expect(billing).not.toContain("No provider-issued license yet");
    expect(billing).toContain("EDAHABIA/CIB");
  });

  test("executes the emitted PDF locale runtime and wires all rendered templates", async () => {
    const transpiled = new Bun.Transpiler({ loader: "ts" }).transformSync(pdfLocaleContent());
    const runtime = (await import(
      `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
    )) as {
      normalizePdfLocale(locale?: string): string;
      pdfLocaleTag(locale?: string): string;
      pdfMessage(locale: string | undefined, key: string): string;
      pdfRowDirection(locale?: string): string;
      pdfTextAlign(locale?: string): string;
    };

    expect(runtime.normalizePdfLocale("ar-DZ")).toBe("ar");
    expect(runtime.normalizePdfLocale("fr_CA")).toBe("fr");
    expect(runtime.normalizePdfLocale("es")).toBe("en");
    expect(runtime.pdfLocaleTag("ar")).toBe("ar-DZ");
    expect(runtime.pdfMessage("fr", "invoice")).toBe("Facture");
    expect(runtime.pdfMessage("ar", "billTo")).toBe("الفاتورة إلى");
    expect(runtime.pdfRowDirection("ar")).toBe("row-reverse");
    expect(runtime.pdfTextAlign("ar")).toBe("right");

    for (const mode of ["monorepo", "single"] as const) {
      const files = generate(mode, "nextjs");
      const base = mode === "monorepo" ? "packages/pdf" : "src/server/pdf";
      const localeRuntime = read(files, `${base}/src/lib/locale.ts`);
      expect(localeRuntime).toContain("normalizePdfLocale");
      expect(localeRuntime).toContain('"invoice": "فاتورة"');
      for (const template of ["invoice", "certificate", "agreement"] as const) {
        const source = read(files, `${base}/src/templates/${template}.tsx`);
        expect(source).toContain("pdfMessage");
        expect(source).toContain("pdfTextAlign");
        expect(source).toContain("pdfRowDirection");
      }
      const web = read(files, `${sourceRoot(mode)}/app/pdf/page.client.tsx`);
      expect(web).toContain("samplePdfData(template, t)");
      expect(web).toContain('translate("sample.invoiceItem")');
      expect(web).not.toContain('description: "Pro subscription"');
    }
  });
});
