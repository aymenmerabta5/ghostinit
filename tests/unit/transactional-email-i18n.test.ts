import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

interface EmailLocaleRuntime {
  emailDirection(locale: "en" | "fr" | "ar"): "ltr" | "rtl";
  resolveEmailLocale(headers?: Headers | null): "en" | "fr" | "ar";
  transactionalEmailSubject(
    kind: "verification" | "password-reset" | "welcome" | "magic-link",
    locale: "en" | "fr" | "ar",
    appName: string,
  ): string;
}

function generate(
  mode: Mode,
  framework: Framework,
  i18n: boolean,
  database: "postgres" | "convex" = "postgres",
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "localized-email",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database,
      apps: ["web"],
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      i18n,
      analytics: false,
      eve: false,
      billing: [],
      features: [],
    }),
    { dryRun: true, validate: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file ${path}`);
  return found.content;
}

async function loadLocaleRuntime(source: string): Promise<EmailLocaleRuntime> {
  const javascript = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(source);
  const encoded = Buffer.from(javascript).toString("base64");
  return (await import(`data:text/javascript;base64,${encoded}`)) as EmailLocaleRuntime;
}

describe("transactional email localization", () => {
  test("keeps every EN/FR/AR transactional email field meaningful and in key parity", () => {
    const catalogs = [
      EN_MESSAGES.transactionalEmail,
      FR_MESSAGES.transactionalEmail,
      AR_MESSAGES.transactionalEmail,
    ];
    const flatten = (value: object, prefix = ""): Array<[string, string]> =>
      Object.entries(value).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return typeof entry === "string" ? [[path, entry]] : flatten(entry, path);
      });
    const [english, ...translations] = catalogs.map((catalog) => flatten(catalog));

    for (const catalog of [english, ...translations]) {
      expect(catalog.map(([key]) => key)).toEqual(english.map(([key]) => key));
      expect(catalog.filter(([, message]) => message.trim().length === 0)).toEqual([]);
    }
  });

  test("resolves cookie and weighted Accept-Language preferences and formats subjects", async () => {
    const files = generate("monorepo", "nextjs", true);
    const runtime = await loadLocaleRuntime(read(files, "packages/email/src/locale.ts"));

    expect(
      runtime.resolveEmailLocale(
        new Headers({ cookie: "theme=dark; NEXT_LOCALE=ar", "accept-language": "fr;q=1" }),
      ),
    ).toBe("ar");
    expect(
      runtime.resolveEmailLocale(
        new Headers({ "accept-language": "en;q=0.2, fr-CA;q=0.9, ar;q=0.5" }),
      ),
    ).toBe("fr");
    expect(runtime.emailDirection("ar")).toBe("rtl");
    expect(runtime.emailDirection("fr")).toBe("ltr");
    expect(runtime.transactionalEmailSubject("verification", "fr", "Acme")).toBe(
      "Vérifiez votre adresse e-mail — Acme",
    );
    expect(runtime.transactionalEmailSubject("password-reset", "ar", "Acme")).toBe(
      "إعادة تعيين كلمة المرور — Acme",
    );
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} wires request locale into subject and RTL templates`, () => {
        const files = generate(mode, framework, true);
        const emailRoot = mode === "monorepo" ? "packages/email/src" : "src/server/email";
        const authPath =
          mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
        const locale = read(files, `${emailRoot}/locale.ts`);
        const layout = read(files, `${emailRoot}/templates/EmailLayout.tsx`);
        const templates = ["VerifyEmail", "ResetPassword", "Welcome", "MagicLink"]
          .map((name) => read(files, `${emailRoot}/templates/${name}.tsx`))
          .join("\n");
        const auth = read(files, authPath);

        expect(locale).toContain('export const EMAIL_LOCALES = ["en", "fr", "ar"]');
        expect(locale).toContain("localeFromAcceptLanguage");
        expect(locale).toContain('headers?.get("cookie")');
        expect(layout).toContain("<Html lang={locale} dir={emailDirection(locale)}>");
        expect(templates).toContain("getTransactionalEmailCopy(locale");
        expect(templates).toContain("transactionalEmailSubject(");
        expect(templates).not.toMatch(
          />\s*(?:Verify your email|Reset your password|Sign in with a magic link|Go to Dashboard)\s*</,
        );
        expect(auth).toContain("resolveEmailLocale(request?.headers)");
        expect(auth).toContain("resolveEmailLocale(context?.request?.headers)");
        expect(auth).toContain('transactionalEmailSubject("verification", locale');
        expect(auth).toContain("{ link: url, appName, locale }");
      });

      test(`${mode}/${framework} keeps i18n-off email copy English-only`, async () => {
        const files = generate(mode, framework, false);
        const localePath =
          mode === "monorepo" ? "packages/email/src/locale.ts" : "src/server/email/locale.ts";
        const locale = read(files, localePath);
        expect(locale).toContain('export const EMAIL_LOCALES = ["en"]');
        expect(locale).not.toContain("Vérifiez votre adresse");
        expect(locale).not.toContain("تحقق من بريدك");
        expect(locale).not.toContain('locale === "ar"');
        expect(locale).toContain("void locale;");

        const runtime = await loadLocaleRuntime(locale);
        expect(runtime.resolveEmailLocale(new Headers({ "accept-language": "ar, fr;q=0.8" }))).toBe(
          "en",
        );
      });
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework}/convex carries locale through scheduled plain-text delivery`, () => {
        const files = generate(mode, framework, true, "convex");
        const auth = read(files, "convex/auth.ts");
        const delivery = read(files, "convex/authEmail.ts");
        expect(auth).toContain('type AuthEmailLocale = "en" | "fr" | "ar"');
        expect(auth).toContain("authEmailLocale(request)");
        expect(auth).toContain("authEmailLocale(context?.request)");
        expect(auth).toContain("{ kind, to, url, locale }");
        expect(delivery).toContain(
          'locale: v.union(v.literal("en"), v.literal("fr"), v.literal("ar"))',
        );
        expect(delivery).toContain("تحقق من بريدك الإلكتروني");
        expect(delivery).toContain("authEmailCopy(args.kind, args.locale, appName)");
      });
    }
  }
});
