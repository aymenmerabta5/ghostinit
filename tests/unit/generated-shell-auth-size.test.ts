import { describe, expect, test } from "bun:test";
import {
  clientProviderContent,
  postHogContextContent,
  singleComponentsHooksContent,
  singleComponentsProviderContent,
} from "../../src/templates/analytics/provider.js";
import {
  authOAuthButtonsContent,
  signInFormContent,
  signInMethodsContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
} from "../../src/templates/apps/fragments/auth/index.js";
import {
  settingsPasskeyCardContent,
  settingsPasskeyListContent,
} from "../../src/templates/apps/fragments/settings/passkey-card.js";
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
    { name: `${router}-sign-in-page`, source: signInPageContent(router), maximum: 120 },
    { name: `${router}-sign-in-form`, source: signInFormContent(router), maximum: 150 },
    { name: `${router}-sign-in-methods`, source: signInMethodsContent(router), maximum: 150 },
    { name: `${router}-sign-up-page`, source: signUpPageContent(router), maximum: 120 },
    { name: `${router}-sign-up-form`, source: signUpFormContent(router), maximum: 150 },
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
      { name: "auth-oauth-buttons", source: authOAuthButtonsContent(), maximum: 150 },
      { name: "auth-passkey-card", source: settingsPasskeyCardContent(), maximum: 150 },
      { name: "auth-passkey-list", source: settingsPasskeyListContent(), maximum: 150 },
    ];

    for (const sizeCase of cases) {
      expect(formattedLines(sizeCase), sizeCase.name).toBeLessThanOrEqual(sizeCase.maximum);
    }
  });

  test("preserves public entry points and logical RTL navigation across routers", () => {
    for (const router of ["next", "tanstack"] as const) {
      const signInPage = signInPageContent(router);
      const signUpPage = signUpPageContent(router);
      expect(signInPage).toContain('from "@/components/auth/sign-in-form"');
      expect(signUpPage).toContain('from "@/components/auth/sign-up-form"');
      for (const page of [signInPage, signUpPage]) {
        expect(page).toContain('import { ArrowLeft } from "lucide-react"');
        expect(
          page.match(
            /<ArrowLeft\b[^>]*aria-hidden[^>]*className="[^"\n]*\brtl:rotate-180\b[^"\n]*"[^>]*\/>/g,
          ),
        ).toHaveLength(1);
      }
      expect(`${signInPage}\n${signUpPage}`).not.toMatch(/>←\s+\{t\(/);

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
      }).find(({ path }) => path.endsWith("/app-shell.tsx"))!.content;
      expect(shell).toContain('from "./header-actions"');
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
