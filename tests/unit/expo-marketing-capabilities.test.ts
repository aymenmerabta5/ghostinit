import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { FR_MESSAGES } from "../../src/templates/i18n/messages/fr.js";
import { AR_MESSAGES } from "../../src/templates/i18n/messages/ar.js";

const catalogs = [EN_MESSAGES, FR_MESSAGES, AR_MESSAGES];
const profiles = [
  { name: "frontend", database: "none", auth: false, api: false, billing: [] },
  { name: "api-only", database: "none", auth: false, api: true, billing: [] },
  { name: "auth-only", database: "postgres", auth: true, api: false, billing: [] },
  { name: "account-api", database: "postgres", auth: true, api: true, billing: [] },
  { name: "stripe", database: "postgres", auth: true, api: true, billing: ["stripe"] },
  { name: "convex-chargily", database: "convex", auth: true, api: true, billing: ["chargily"] },
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function header(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = header(child);
      if (found) return found;
    }
    return undefined;
  }
  const node = record(value);
  if (!node) return undefined;
  const opening = record(node.openingElement);
  if (node.type === "JSXElement" && Array.isArray(opening?.attributes)) {
    const isHeader = opening.attributes.some((attribute: unknown) => {
      const entry = record(attribute);
      return (
        record(entry?.name)?.name === "accessibilityRole" &&
        record(entry?.value)?.value === "header"
      );
    });
    if (isHeader) return node;
  }
  return header(Object.values(node));
}

function message(catalog: unknown, key: string): string {
  let value: unknown = record(catalog)?.marketing;
  for (const segment of key.split(".")) value = record(value)?.[segment];
  if (typeof value !== "string") throw new Error(`Missing marketing translation: ${key}`);
  return value;
}

function headerText(value: unknown, catalog: unknown): string {
  if (Array.isArray(value)) return value.map((child) => headerText(child, catalog)).join("");
  const node = record(value);
  if (!node) return "";
  if (node.type === "JSXElement") return headerText(node.children, catalog);
  if (node.type === "JSXText") return String(node.value ?? "");
  if (node.type !== "JSXExpressionContainer") return "";
  const expression = record(node.expression);
  if (typeof expression?.value === "string") return expression.value;
  if (record(expression?.callee)?.name === "t" && Array.isArray(expression?.arguments)) {
    const key = record(expression.arguments[0])?.value;
    if (typeof key === "string") return message(catalog, key);
  }
  throw new Error("Expo headline contains an unverified expression");
}

function verifyLanding(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
  profile: (typeof profiles)[number],
  i18n: boolean,
): void {
  const resolution = resolveCreateConfig({
    name: "expo-marketing-proof",
    runtime: "bun",
    mode,
    framework,
    database: profile.database,
    databaseWasExplicit: true,
    apps: mode === "single" ? ["mobile"] : ["web", "mobile"],
    preset: "custom",
    billing: [...profile.billing],
    features: [],
    cache: "none",
    deploy: "none",
    withAuth: profile.auth,
    withApi: profile.api,
    withEmail: false,
    withAnalytics: false,
    withI18n: i18n,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
  const files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
  const root = mode === "single" ? "app" : "apps/mobile/app";
  const routePath = `${root}/index.tsx`;
  const route = files.get(routePath);
  if (!route) throw new Error(`Missing Expo landing route: ${routePath}`);
  expect(parseSync(routePath, route, { lang: "tsx" }).errors).toEqual([]);
  expect(route).toContain(
    'export { MarketingScreen as default } from "@/features/marketing/screen";',
  );
  const path = `${mode === "single" ? "" : "apps/mobile/"}src/features/marketing/screen.tsx`;
  const content = files.get(path);
  if (!content) throw new Error(`Missing Expo landing: ${path}`);
  const parsed = parseSync(path, content, { lang: "tsx" });
  expect(parsed.errors).toEqual([]);
  const title = header(parsed.program);
  expect(title).toBeDefined();
  for (const catalog of i18n ? catalogs : [EN_MESSAGES]) {
    const completeTitle = `${message(catalog, "hero.title")} ${message(catalog, "hero.titleAccent")}`;
    expect(headerText(title, catalog).replace(/\s+/g, " ").trim()).toBe(completeTitle);
    for (const [, key] of content.matchAll(/\bt\("([A-Za-z.]+)"\)/g)) {
      expect(message(catalog, key!).length).toBeGreaterThan(0);
    }
  }
  expect(content).toContain("from 'react-native'");
  expect(content).not.toMatch(/<h1|<div|<span|from ["']next(?:["'/])/);
  expect(content).not.toMatch(/Bun only|Next\.js App Router|Drizzle|Better Auth|Stripe, Chargily/);
  expect(content.includes("useTranslations")).toBe(i18n);
  expect(content.includes("<LocaleSwitcher")).toBe(i18n);

  const capabilities = resolution.resolvedConfig.capabilities;
  const apiClaim = i18n ? 't("features.apiTitle")' : '"Connected, with confidence"';
  const billingClaim = i18n ? 't("features.billingTitle")' : '"Billing that fits"';
  expect(content.includes(apiClaim)).toBe(capabilities.transport);
  expect(content.includes(billingClaim)).toBe(capabilities.billing.enabled);
  expect(content.includes("from 'expo-router'")).toBe(capabilities.auth);
  const links = [...content.matchAll(/<Link href="([^"]+)"/g)].map((match) => match[1]!);
  expect(links).toEqual(capabilities.auth ? ["/(auth)/sign-up", "/(auth)/sign-in"] : []);
  for (const link of links) expect(files.has(`${root}${link}.tsx`)).toBe(true);
}

describe("Expo landing follows resolved capabilities and locale copy", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const i18n of [false, true]) {
      for (const profile of profiles) {
        test(`monorepo/${framework}/${profile.name}/i18n=${i18n}`, () => {
          verifyLanding("monorepo", framework, profile, i18n);
        });
      }
    }
  }
  for (const i18n of [false, true]) {
    test(`single/frontend/i18n=${i18n} has no backend claims or auth routes`, () => {
      verifyLanding("single", "nextjs", profiles[0], i18n);
    });
  }
});
