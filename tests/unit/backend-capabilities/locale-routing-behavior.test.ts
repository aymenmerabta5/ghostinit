import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../../src/lib/config.js";
import { generateProjectFiles } from "../../../src/templates/default.js";

const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
function executable(source: string): string {
  return transpiler.transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
}
type Config = {
  defaultLocale: string;
  localeCookieName: string;
  localeCookieMaxAge: number;
  localeDirection: Record<string, string>;
  isValidLocale(value: unknown): boolean;
};

describe("generated web locale request operation", () => {
  test("resolves request locale after persisted switches and preserves weighted fallback", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "locale-operation-evidence",
            runtime: "bun",
            mode,
            framework,
            database: "none",
            preset: "frontend",
            apps: ["web"],
            billing: [],
            features: ["i18n"],
          }),
          { dryRun: true },
        );
        const root = mode === "monorepo" ? "apps/web/src" : "src";
        const read = (path: string) => {
          const content = files.find((file) => file.path === path)?.content;
          if (!content) throw new Error(`Missing generated locale module ${path}`);
          return content;
        };
        const configSource = read(
          `${root}/i18n/${framework === "nextjs" ? "routing" : "config"}.ts`,
        );
        const config = new Function(
          "defineRouting",
          executable(configSource) +
            "\nreturn { defaultLocale, localeCookieName, localeCookieMaxAge, localeDirection, isValidLocale };",
        )((value: unknown) => value) as Config;
        let requestHeaders = new Headers();
        const resolverSource =
          framework === "nextjs"
            ? read(`${root}/i18n/request.ts`).split("export default getRequestConfig")[0]!
            : read(`${root}/lib/i18n.server.ts`);
        const resolver = new Function(
          "defaultLocale",
          "isValidLocale",
          "localeCookieName",
          "localeDirection",
          "cookies",
          "headers",
          executable(resolverSource) +
            `\nreturn ${framework === "nextjs" ? "resolveRequestLocale" : "getLocaleFromHeaders"};`,
        )(
          config.defaultLocale,
          config.isValidLocale,
          config.localeCookieName,
          config.localeDirection,
          async () => ({
            get: (name: string) => {
              const field = requestHeaders
                .get("cookie")
                ?.split(";")
                .map((part) => part.trim())
                .find((part) => part.startsWith(name + "="));
              return field ? { value: field.slice(name.length + 1) } : undefined;
            },
          }),
          async () => requestHeaders,
        ) as (headers?: Headers) => string | Promise<string>;
        const select = async (values: HeadersInit) => {
          requestHeaders = new Headers(values);
          return await resolver(requestHeaders);
        };
        expect(await select({ "accept-language": "en;q=0.2, fr-CA;q=0.9, ar;q=0.5" })).toBe("fr");
        expect(await select({ cookie: "NEXT_LOCALE=ar", "accept-language": "fr;q=1" })).toBe("ar");
        expect(
          await select({ cookie: "NEXT_LOCALE=invalid", "accept-language": "ar;q=0,fr;q=0.5" }),
        ).toBe("fr");
        expect(await select({ "accept-language": "de,ar;q=bogus" })).toBe("en");

        const switcherSource =
          framework === "nextjs"
            ? read(`${root}/components/locale-switcher.tsx`)
            : read(`${root}/lib/i18n.ts`);
        const start = switcherSource.indexOf("function writeLocaleCookie(");
        const end = switcherSource.indexOf("\n}", start);
        expect(start >= 0 && end > start, "generated cookie writer must be reachable").toBe(true);
        const document = { cookie: "" };
        const writeCookie = new Function(
          "window",
          "document",
          "localeCookieName",
          "localeCookieMaxAge",
          executable(switcherSource.slice(start, end + 2)) + "\nreturn writeLocaleCookie;",
        )(
          { location: { protocol: "https:" } },
          document,
          config.localeCookieName,
          config.localeCookieMaxAge,
        ) as (locale: string) => void;
        writeCookie("ar");
        expect(document.cookie).toContain("Path=/");
        expect(document.cookie).toContain("SameSite=Lax; Secure");
        const locale = await select({
          cookie: document.cookie.split(";", 1)[0]!,
          "accept-language": "fr",
        });
        expect(locale).toBe("ar");
        expect(config.localeDirection[locale]).toBe("rtl");
        writeCookie("fr");
        const changed = await select({
          cookie: document.cookie.split(";", 1)[0]!,
          "accept-language": "ar",
        });
        expect(changed).toBe("fr");
        expect(config.localeDirection[changed]).toBe("ltr");
      }
    }
  });
});
