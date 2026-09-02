import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";

function generate(
  mode: Mode,
  framework: Framework,
  database: Database,
  i18n: boolean,
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "localized-optionals",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database,
      apps: ["web"],
      preset: "custom",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: true,
      analytics: false,
      eve: true,
      i18n,
      pdf: true,
      billing: [],
      features: [],
      messaging: true,
      storage: true,
      notifications: false,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    }),
    { dryRun: true, validate: true },
  );
}

function root(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/src" : "src";
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file ${path}`);
  return found.content;
}

function matchingSource(files: readonly TemplateFile[], expression: RegExp): string {
  return files
    .filter(({ path }) => expression.test(path))
    .map(({ content }) => content)
    .join("\n");
}

const hardcodedOptionalUi =
  />\s*(?:Storage|Remote feature flags|Background jobs|Conversations|No conversations yet|No messages yet\. Say hello\.|Send|Generate a secure PDF|Conversation|Agent error)\s*</;

describe("optional web surface localization", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} routes all optional copy through typed catalogs`, () => {
          const files = generate(mode, framework, database, true);
          const sourceRoot = root(mode);
          const storage = read(files, `${sourceRoot}/features/storage/page.tsx`);
          const flags = read(files, `${sourceRoot}/features/feature-flags/page.tsx`);
          const jobs = read(files, `${sourceRoot}/features/jobs/page.tsx`);
          const pdf = read(
            files,
            framework === "nextjs"
              ? `${sourceRoot}/app/pdf/page.tsx`
              : `${sourceRoot}/routes/pdf.tsx`,
          );
          const agent = read(
            files,
            framework === "nextjs"
              ? `${sourceRoot}/app/agent/page.tsx`
              : `${sourceRoot}/routes/agent.tsx`,
          );
          const messages = matchingSource(
            files,
            new RegExp(
              `^${sourceRoot}/(?:app/(?:\\(app\\)/)?messages|routes/(?:-components/)?messages)`,
            ),
          );

          for (const [namespace, source] of [
            ["storage", storage],
            ["featureFlags", flags],
            ["jobs", jobs],
            ["messaging", messages],
            ["pdf", pdf],
            ["agent", agent],
          ] as const) {
            expect(source, `${mode}/${framework}/${database}/${namespace}`).toContain(
              `useSurfaceTranslations("${namespace}")`,
            );
            expect(source, `${mode}/${framework}/${database}/${namespace}`).not.toMatch(
              hardcodedOptionalUi,
            );
          }

          expect(messages).toContain('t("messagePlaceholder")');
          expect(messages).toMatch(/t\("(?:selectConversationShort|selectOrStart)"\)/);
          expect(pdf).toContain("const locale = useSurfaceLocale()");
          expect(pdf).toContain("data: samplePdfData(template, t), locale,");
          expect(pdf).not.toContain('locale: "en"');
          expect(agent).toContain('t("streaming")');

          const arabicPath =
            framework === "nextjs"
              ? mode === "monorepo"
                ? "apps/web/messages/ar.json"
                : "src/messages/ar.json"
              : `${sourceRoot}/i18n/messages/ar.json`;
          const arabic = JSON.parse(read(files, arabicPath)) as {
            messaging: { noMessages: string };
            pdf: { secureTitle: string };
            transactionalEmail: { verification: { title: string } };
          };
          expect(arabic.messaging.noMessages).toContain("رسائل");
          expect(arabic.pdf.secureTitle).toContain("PDF");
          expect(arabic.transactionalEmail.verification.title).toContain("بريدك");

          const shell = read(
            files,
            framework === "nextjs"
              ? `${sourceRoot}/app/layout.tsx`
              : `${sourceRoot}/routes/__root.tsx`,
          );
          if (framework === "nextjs") {
            expect(shell).toContain("localeDirection[locale]");
            expect(shell).toContain("document.documentElement.dir");
          } else {
            expect(shell).toMatch(/dir=\{(?:direction|localeDirection\[locale\])\}/);
          }
        });
      }
    }
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} keeps i18n-off optional output English-only`, () => {
        const files = generate(mode, framework, "postgres", false);
        const sourceRoot = root(mode);
        const adapter = read(files, `${sourceRoot}/lib/translations.ts`);
        const optionalSource = matchingSource(
          files,
          new RegExp(
            `^${sourceRoot}/(?:features/(?:storage|feature-flags|jobs)|app/(?:\\(app\\)/)?messages|routes/(?:-components/)?messages|app/(?:pdf|agent)|routes/(?:pdf|agent))`,
          ),
        );
        expect(optionalSource).toContain('from "@/lib/translations"');
        expect(adapter).toContain('import ENGLISH_MESSAGES from "./translations.en.json"');
        expect(adapter).not.toContain("next-intl");
        expect(adapter).not.toContain('from "@/lib/i18n"');
        expect(files.some(({ path }) => path === `${sourceRoot}/lib/translations.fr.json`)).toBe(
          false,
        );
        expect(files.some(({ path }) => path === `${sourceRoot}/lib/translations.ar.json`)).toBe(
          false,
        );
      });
    }
  }

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`monorepo/${framework} sends the selected locale from every PDF client`, () => {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "localized-pdf-clients",
          runtime: "bun",
          version: "0.1.0",
          mode: "monorepo",
          framework,
          database: "postgres",
          apps: ["web", "mobile", "desktop"],
          preset: "custom",
          auth: true,
          api: true,
          email: false,
          i18n: true,
          pdf: true,
          billing: [],
          features: [],
        }),
        { dryRun: true, validate: true },
      );
      const web = read(
        files,
        framework === "nextjs" ? "apps/web/src/app/pdf/page.tsx" : "apps/web/src/routes/pdf.tsx",
      );
      const mobile = read(files, "apps/mobile/app/pdf.tsx");
      const mobileClient = read(files, "apps/mobile/src/hooks/usePdf.ts");
      const desktop = read(files, "apps/desktop/src/renderer/routes/pdf.tsx");
      const desktopClient = read(files, "apps/desktop/src/lib/pdf.ts");

      expect(web).toContain("const locale = useSurfaceLocale()");
      for (const source of [mobile, desktop]) {
        expect(source).toContain("const { locale } = usePlatformI18n()");
        expect(source).toContain("data: samplePdfData(template, t), locale,");
      }
      for (const source of [mobileClient, desktopClient]) {
        expect(source).toContain("locale?: string");
        expect(source).toContain("body: JSON.stringify(input)");
      }
    });
  }
});
