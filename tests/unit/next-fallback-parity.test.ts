import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

const fallbackFiles = ["not-found.tsx", "error.tsx", "global-error.tsx", "loading.tsx"];

function generate(mode: "single" | "monorepo", i18n: boolean, auth: boolean) {
  const result = resolveCreateConfig({
    name: "fallback-review",
    runtime: "node",
    mode,
    framework: "nextjs",
    database: auth ? "postgres" : "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    billing: [],
    features: [],
    cache: "none",
    deploy: "none",
    withAuth: auth,
    withApi: auth,
    withEmail: false,
    withAnalytics: false,
    withI18n: i18n,
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  return new Map(plan.files.map((file) => [file.physicalPath, file.content]));
}

describe("generated Next fallback parity", () => {
  for (const i18n of [false, true]) {
    for (const auth of [false, true]) {
      test(`single and monorepo fallbacks preserve locale and recovery contracts (i18n=${i18n}, auth=${auth})`, () => {
        const single = generate("single", i18n, auth);
        const monorepo = generate("monorepo", i18n, auth);
        for (const filename of fallbackFiles) {
          const content = single.get(`src/app/${filename}`);
          expect(content, filename).toBeDefined();
          expect(content, filename).toBe(monorepo.get(`apps/web/src/app/${filename}`));
          const parsed = parseSync(filename, content!, { lang: "tsx" });
          expect(parsed.errors, filename).toEqual([]);
          for (const statement of parsed.program.body) {
            if (statement.type !== "ImportDeclaration") continue;
            const specifier = String(statement.source.value);
            const local = specifier.startsWith("@/")
              ? `src/${specifier.slice(2)}`
              : specifier.startsWith("./")
                ? `src/app/${specifier.slice(2)}`
                : undefined;
            if (!local) continue;
            expect(
              [local, `${local}.ts`, `${local}.tsx`, `${local}/index.ts`].some((path) =>
                single.has(path),
              ),
              `${filename}: missing ${specifier}`,
            ).toBe(true);
          }
          expect(content).not.toContain("error.message");
          expect(content).not.toContain("min-h-screen");
        }

        const error = single.get("src/app/error.tsx")!;
        expect(error).toContain("console.error(error)");
        expect(error).toContain('t("unexpected.description")');
        expect(error).toContain("onClick={() => reset()}");
        expect(error).toContain('as="h1"');
        const global = single.get("src/app/global-error.tsx")!;
        expect(global).toContain('import "./globals.css";');
        expect(global).toContain('from "@/lib/translations.standalone"');
        expect(global).toContain("<html lang={locale} dir={standaloneSurfaceDirection(locale)}");
        expect(global).not.toContain("<Providers");
        expect(global).not.toContain("<AppProviders");
        expect(single.get("src/app/loading.tsx")).toContain('aria-busy="true"');
        expect(single.get("src/app/loading.tsx")).toContain("lg:grid-cols-[1.35fr_1fr]");
        for (const locale of i18n ? ["en", "fr", "ar"] : ["en"]) {
          const catalog = single.get(`src/lib/translations.${locale}.json`);
          expect(catalog).toBeDefined();
          const messages = JSON.parse(catalog!);
          expect(messages.errors.global.retry).toBeString();
          expect(messages.errors.notFound.backHome).toBeString();
        }
        expect(single.get("src/app/layout.tsx")).toContain("<Providers>");
        expect(single.get("src/app/layout.tsx")).not.toContain("<AppProviders>");
      });
    }
  }
});
