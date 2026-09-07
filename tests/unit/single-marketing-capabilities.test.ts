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

describe("single marketing follows the resolved project", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const profile of profiles) {
      test(`${framework}/${JSON.stringify(profile)} keeps claims and links valid`, () => {
        const result = resolveCreateConfig({
          name: "single-marketing",
          runtime: "node",
          mode: "single",
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
        const sections = ["hero", "features", "closing"].map((name) => {
          const path = `src/components/marketing/${name}.tsx`;
          const content = files.get(path)!;
          expect(content, path).toBeDefined();
          expect(parseSync(path, content, { lang: "tsx" }).errors).toEqual([]);
          return content;
        });
        const content = sections.join("\n");
        expect(content.includes("Better Auth ")).toBe(profile.auth);
        expect(content.includes("Drizzle ")).toBe(profile.database === "postgres");
        expect(content.includes("Convex ")).toBe(profile.database === "convex");
        expect(content.includes('t("single.authTitle")')).toBe(profile.auth);
        expect(content.includes('t("single.billingTitle")')).toBe(profile.billing);
        expect(content.includes(">agent/</Badge>")).toBe(profile.eve);
        expect(content.includes(">src/server</Badge>")).toBe(
          profile.auth || profile.api || profile.database !== "none",
        );
        expect(content).not.toContain("authClient.signIn.email callbackURL");
        expect(content).not.toContain("bunx ghostinit create");
        expect(content).not.toMatch(/bun install(?:\s|&|<)/);

        const links = [...content.matchAll(/(?:href|to)="([^"]+)"/g)].map((match) => match[1]!);
        expect(links.includes("/sign-in")).toBe(profile.auth);
        expect(links.includes("/sign-up")).toBe(profile.auth);
        expect(links.includes("/billing")).toBe(profile.billing);
        for (const link of links) {
          if (link.startsWith("#")) {
            expect(content).toContain(`id="${link.slice(1)}"`);
            continue;
          }
          const routePath =
            framework === "nextjs" ? `src/app${link}/page.tsx` : `src/routes${link}.tsx`;
          expect(files.has(routePath), `${link} -> ${routePath}`).toBe(true);
        }
        const scripts = (
          JSON.parse(files.get("package.json")!) as { scripts: Record<string, string> }
        ).scripts;
        const commands = [...content.matchAll(/>bun run ([a-z:-]+)</g)].map((match) => match[1]!);
        expect(commands).toEqual(["install:bootstrap", "dev"]);
        for (const command of commands) expect(scripts[command], command).toBeDefined();

        const translatedKeys = [...content.matchAll(/t\("single\.([A-Za-z]+)"/g)].map(
          (match) => match[1]!,
        );
        for (const catalog of [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES]) {
          const single: Readonly<Record<string, string>> = catalog.marketing.single;
          for (const key of translatedKeys) expect(single[key], key).toBeDefined();
          const visibleCopy = translatedKeys.map((key) => single[key]).join(" ");
          expect(visibleCopy).not.toMatch(
            /Bun only|Bun uniquement|Bun فقط|one (?:port|development server)|un seul (?:port|serveur)|منفذ واحد|Drizzle|Better Auth/,
          );
        }
      });
    }
  }
});
