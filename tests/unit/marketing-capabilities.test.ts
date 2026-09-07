import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";

const profiles = [
  { database: "none", auth: false, api: false, billing: false, eve: false },
  { database: "none", auth: false, api: true, billing: false, eve: false },
  { database: "convex", auth: false, api: false, billing: false, eve: false },
  { database: "convex", auth: true, api: true, billing: false, eve: false },
  { database: "convex", auth: true, api: true, billing: true, eve: false },
  { database: "postgres", auth: false, api: false, billing: false, eve: false },
  { database: "postgres", auth: true, api: true, billing: false, eve: false },
  { database: "postgres", auth: true, api: true, billing: true, eve: true },
] as const;

describe("marketing follows the resolved project", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const profile of profiles) {
        test(`${mode}/${framework}/${JSON.stringify(profile)} keeps claims and links valid`, () => {
          const result = resolveCreateConfig({
            name: "marketing-preview",
            runtime: "node",
            mode,
            framework,
            database: profile.database,
            databaseWasExplicit: true,
            apps: ["web"],
            preset: "custom",
            billing: profile.billing ? ["stripe"] : [],
            features: [],
            cache: "none",
            deploy: "none",
            withAuth: profile.auth,
            withApi: profile.api,
            withEmail: false,
            withAnalytics: false,
            withEve: profile.eve,
            withI18n: true,
          });
          if (!result.ok) throw new Error(result.message);
          const plan = buildProjectGenerationPlan(result.resolvedConfig, {
            desiredConfig: result.desiredConfig,
          });
          const files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
          const root = mode === "single" ? "src" : "apps/web/src";
          const names =
            mode === "single"
              ? ["hero", "features", "closing"]
              : ["hero", "features", "quick-start", "footer"];
          const sections = names.map((name) => {
            const path = `${root}/components/marketing/${name}.tsx`;
            const content = files.get(path)!;
            expect(content, path).toBeDefined();
            expect(parseSync(path, content, { lang: "tsx" }).errors).toEqual([]);
            return content;
          });
          const content = sections.join("\n");
          expect(content.includes('t("single.authTitle")')).toBe(profile.auth);
          expect(content.includes('t("features.apiTitle")')).toBe(profile.api);
          expect(content.includes('t("single.billingTitle")')).toBe(profile.billing);
          const directories = [...content.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]!);
          expect(directories.includes(mode === "single" ? "agent/" : "apps/eve/")).toBe(
            profile.eve,
          );
          expect(directories.includes("convex/")).toBe(profile.database === "convex");
          expect(
            directories.includes(mode === "single" ? "src/server/" : "packages/modules/"),
          ).toBe(profile.auth || profile.api || profile.database === "postgres");
          expect(directories).toContain(mode === "single" ? "src/platform/ui/" : "packages/ui/");
          for (const directory of directories) {
            expect(
              [...files.keys()].some((path) => path.startsWith(directory)),
              directory,
            ).toBe(true);
          }
          expect(content).toContain('t("hero.titleAccent")');
          expect(content).toContain('t("preview.source")');
          expect(content).not.toContain("<Badge");
          expect(content).not.toContain("terminalScaffolded");
          expect(content).not.toContain("terminalReady");
          expect(content).not.toMatch(/\b(?:Drizzle|Convex|React|Next) \d/);
          expect(content).not.toMatch(/bg-(?:red|yellow|green)-\d/);
          expect(content).not.toContain("authClient.signIn.email callbackURL");
          expect(content).not.toContain("bunx ghostinit create");
          expect(content).not.toMatch(/bun install(?:\s|&|<)/);

          const links = [...content.matchAll(/(?:href|to)="([^"]+)"/g)].map((match) => match[1]!);
          expect(links.includes("/sign-in")).toBe(profile.auth);
          expect(links.includes("/sign-up")).toBe(profile.auth);
          expect(links.includes("/billing")).toBe(profile.billing);
          for (const link of links) {
            if (link.startsWith("https:")) {
              expect(mode).toBe("monorepo");
              expect(link).toBe("https://github.com/aymenmerabta5/ghostinit");
              expect(content).toContain('rel="noreferrer"');
              continue;
            }
            if (link.startsWith("#")) {
              expect(content).toContain(`id="${link.slice(1)}"`);
              continue;
            }
            const routePath =
              framework === "nextjs" ? `${root}/app${link}/page.tsx` : `${root}/routes${link}.tsx`;
            expect(files.has(routePath), `${link} -> ${routePath}`).toBe(true);
          }
          const scripts = (
            JSON.parse(files.get("package.json")!) as { scripts: Record<string, string> }
          ).scripts;
          const commands = [...content.matchAll(/>bun run ([a-z:-]+)</g)].map((match) => match[1]!);
          expect(commands).toEqual(["install:bootstrap", "dev"]);
          for (const command of commands) expect(scripts[command], command).toBeDefined();

          const translatedKeys = [...content.matchAll(/t\("([A-Za-z.]+)"/g)].map(
            (match) => match[1]!,
          );
          for (const catalog of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
            const visibleCopy = translatedKeys
              .map((key) => {
                const [group, name] = key.split(".");
                const branch = (catalog.marketing as Record<string, unknown>)[group!] as
                  | Record<string, unknown>
                  | undefined;
                expect(typeof branch?.[name!], key).toBe("string");
                return branch?.[name!];
              })
              .join(" ");
            expect(visibleCopy).not.toMatch(
              /Bun only|Bun uniquement|Bun فقط|one (?:port|development server)|un seul (?:port|serveur)|منفذ واحد|Drizzle|Better Auth/,
            );
            expect(visibleCopy).not.toMatch(/[—–]/);
          }
        });
      }
    }
  }
});
