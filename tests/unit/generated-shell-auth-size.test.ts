import { generateProjectFiles } from "../../src/templates/default.js";
import { describe, expect, test } from "bun:test";
import {
  clientProviderContent,
  postHogContextContent,
  singleComponentsHooksContent,
  singleComponentsProviderContent,
} from "../../src/templates/analytics/provider.js";
import {
  signInPageContent,
  signUpPageContent,
} from "../../src/templates/apps/fragments/auth/index.js";
import { webSettingsFeatureFiles } from "../../src/templates/apps/fragments/settings/feature.js";
import {
  headerActionsContent,
  headerFileContent,
  headerUserMenuContent,
  workspaceShellFiles,
} from "../../src/templates/apps/fragments/header/index.js";
import {
  buildMarketingPageContent,
  marketingFeaturesComponentContent,
  marketingFooterComponentContent,
  marketingHeroComponentContent,
  marketingQuickStartComponentContent,
  singleMarketingClosingComponentContent,
  singleMarketingFeaturesComponentContent,
  singleMarketingHeroComponentContent,
  singleMarketingPageContent,
} from "../../src/templates/apps/fragments/marketing/index.js";

type Router = "next" | "tanstack";

interface SizeCase {
  name: string;
  source: string;
  maximum: 120 | 150 | 200;
  extension?: "ts" | "tsx";
}

function formattedLines({ name, source, extension = "tsx" }: SizeCase): number {
  const result = Bun.spawnSync(
    [process.execPath, "x", "oxfmt", "--stdin-filepath", `${name}.${extension}`],
    { stdin: new TextEncoder().encode(source), stdout: "pipe", stderr: "pipe" },
  );
  const stderr = new TextDecoder().decode(result.stderr);
  expect(result.exitCode, `${name}: oxfmt failed\n${stderr}`).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
}

function authSources(router: Router) {
  const files = generateProjectFiles({
    name: "auth-size",
    version: "0.1.0",
    runtime: "bun",
    mode: "monorepo",
    framework: router === "next" ? "nextjs" : "tanstack-start",
    database: "postgres",
    apps: ["web"],
    preset: "saas",
    billing: [],
    features: [],
  });
  const root = "apps/web/src/features/auth/";
  for (const name of [
    "sign-in-screen.tsx",
    "sign-up-screen.tsx",
    "components/sign-in-form.tsx",
    "components/sign-up-form.tsx",
    "use-sign-in-form.ts",
    "use-sign-up-form.ts",
    "mutations.ts",
  ])
    expect(
      files.some(({ path }) => path === root + name),
      name,
    ).toBe(true);
  return files.filter(({ path }) => path.startsWith(root));
}

function casesFor(router: Router): SizeCase[] {
  const marketingOptions = {
    hasAuth: true,
    hasApi: true,
    hasBilling: true,
    hasEve: true,
    database: "postgres",
  } as const;
  return [
    ...workspaceShellFiles(router, {
      sourceRoot: "src",
      hasAuth: true,
      hasBilling: true,
      hasAdminNavigation: true,
      hasPdf: true,
      hasMessaging: true,
      navigation: { eve: true, notifications: true, storage: true, featureFlags: true, jobs: true },
    }).map(({ path, content }): SizeCase => ({
      name: `${router}-${path}`,
      source: content,
      maximum: 150,
      extension: path.endsWith(".tsx") ? "tsx" : "ts",
    })),
    { name: `${router}-header`, source: headerFileContent(router, true, true), maximum: 120 },
    {
      name: `${router}-public-header`,
      source: headerFileContent(router, true, false),
      maximum: 120,
    },
    {
      name: `${router}-header-actions`,
      source: headerActionsContent(router, true),
      maximum: 150,
    },
    {
      name: `${router}-header-user-menu`,
      source: headerUserMenuContent(router),
      maximum: 150,
    },
    ...authSources(router).map(({ path, content }): SizeCase => ({
      name: `${router}-${path}`,
      source: content,
      maximum: 150,
      extension: path.endsWith("x") ? "tsx" : "ts",
    })),
    { name: `${router}-sign-in-page`, source: signInPageContent(router), maximum: 120 },
    { name: `${router}-sign-up-page`, source: signUpPageContent(router), maximum: 120 },
    {
      name: `${router}-marketing-page`,
      source: buildMarketingPageContent(router),
      maximum: 120,
    },
    {
      name: `${router}-marketing-hero`,
      source: marketingHeroComponentContent(router),
      maximum: 150,
    },
    {
      name: `${router}-marketing-features`,
      source: marketingFeaturesComponentContent(router),
      maximum: 150,
    },
    {
      name: `${router}-marketing-quick-start`,
      source: marketingQuickStartComponentContent(router),
      maximum: 150,
    },
    {
      name: `${router}-marketing-footer`,
      source: marketingFooterComponentContent(router),
      maximum: 150,
    },
    {
      name: `${router}-single-marketing-page`,
      source: singleMarketingPageContent(router),
      maximum: 120,
    },
    {
      name: `${router}-single-marketing-hero`,
      source: singleMarketingHeroComponentContent(router, marketingOptions),
      maximum: 150,
    },
    {
      name: `${router}-single-marketing-features`,
      source: singleMarketingFeaturesComponentContent(router, marketingOptions),
      maximum: 150,
    },
    {
      name: `${router}-single-marketing-closing`,
      source: singleMarketingClosingComponentContent(router, marketingOptions),
      maximum: 150,
    },
  ];
}

describe("generated shell, analytics, marketing, and auth boundaries", () => {
  test("keeps formatted orchestrators and standalone components within hard limits", () => {
    const cases: SizeCase[] = [
      ...casesFor("next"),
      ...casesFor("tanstack"),
      { name: "posthog-context", source: postHogContextContent(), maximum: 150 },
      {
        name: "posthog-provider-monorepo",
        source: clientProviderContent("monorepo"),
        maximum: 150,
      },
      { name: "posthog-provider-single", source: singleComponentsProviderContent(), maximum: 150 },
      {
        name: "posthog-hooks-single",
        source: singleComponentsHooksContent(),
        maximum: 150,
        extension: "ts",
      },
      ...webSettingsFeatureFiles("src", "next", true, true, true)
        .filter(({ path }) => path.includes("passkey"))
        .map(({ path, content }): SizeCase => ({
          name: path,
          source: content,
          maximum: 150,
          extension: path.endsWith("x") ? "tsx" : "ts",
        })),
    ];

    for (const sizeCase of cases) {
      expect(formattedLines(sizeCase), sizeCase.name).toBeLessThanOrEqual(sizeCase.maximum);
    }
  });

  test("preserves public entry points and logical RTL navigation across routers", () => {
    for (const router of ["next", "tanstack"] as const) {
      const signInPage = signInPageContent(router);
      const signUpPage = signUpPageContent(router);
      expect(signInPage).toContain('from "@/features/auth/sign-in-screen"');
      expect(signUpPage).toContain('from "@/features/auth/sign-up-screen"');
      const auth = authSources(router);
      const screens = ["sign-in", "sign-up"].map(
        (name) => auth.find(({ path }) => path.endsWith(`/${name}-screen.tsx`))!.content,
      );
      for (const page of screens) {
        expect(page).toContain('import { ArrowLeft } from "lucide-react"');
        expect(
          page.match(
            /<ArrowLeft\b[^>]*aria-hidden[^>]*className="[^"\n]*\brtl:rotate-180\b[^"\n]*"[^>]*\/>/g,
          ),
        ).toHaveLength(1);
      }
      expect(screens.join("\n")).not.toMatch(/>←\s+\{t\(/);

      const header = headerFileContent(router, true, true);
      expect(header).toContain("export function Header(");
      expect(header).not.toMatch(/useAuth|useQueryAuthSession|useQuery\(/);
      const shell = workspaceShellFiles(router, {
        sourceRoot: "src",
        hasAuth: true,
        hasBilling: true,
        hasAdminNavigation: true,
        hasPdf: false,
        hasMessaging: false,
        navigation: {},
      }).find(({ path }) => path === "src/features/app-shell/app-shell.tsx")!.content;
      expect(shell).toContain('from "@/components/header-actions"');
      expect(shell).toContain("<Header workspace={workspace}");
      expect(headerActionsContent(router, true)).toContain('from "./header-user-menu.js"');
      expect(headerUserMenuContent(router)).toContain("<DropdownMenuTrigger");

      const marketingPage = buildMarketingPageContent(router);
      expect(marketingPage).toContain('from "@/components/marketing/hero"');
      expect(marketingPage).toContain("<MarketingFeatures />");
      expect(singleMarketingPageContent(router)).toContain("<SingleMarketingFeatures />");
    }

    const singleProvider = singleComponentsProviderContent();
    expect(singleProvider).toContain('from "./posthog-hooks.js"');
    expect(singleProvider).toContain('from "./posthog-context.js"');
    expect(singleComponentsHooksContent()).toContain("export function useExperiment");
  });
});
