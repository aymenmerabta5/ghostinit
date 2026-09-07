import { expect } from "bun:test";
import {
  settingsDangerZoneCardContent,
  tanstackSettingsFeatureFiles,
} from "../../src/templates/apps/fragments/settings/index.js";
import { settingsDangerZoneCardSingle } from "../../src/templates/modes/single/pages/settings.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { elements, generatedFormHarness, type TestElement } from "./generated-form-harness.js";

type Transport = "identity-client" | "settings-action";

interface Scenario {
  label: string;
  component: "DangerZoneCard" | "DangerZoneSection";
  source: string;
  transport: Transport;
}

export function scenarios(hasEmail = true): Scenario[] {
  return (["monorepo", "single"] as const).flatMap<Scenario>((mode) => {
    const next: Scenario = {
      label: `${mode}/next`,
      component: "DangerZoneCard",
      source:
        mode === "single"
          ? settingsDangerZoneCardSingle(hasEmail)
          : settingsDangerZoneCardContent(hasEmail),
      transport: "identity-client",
    };
    const danger = tanstackSettingsFeatureFiles(mode, true, hasEmail, false).find(({ path }) =>
      path.endsWith("/danger-zone-section.tsx"),
    );
    if (!danger) throw new Error(`Missing ${mode} TanStack danger section`);
    return [
      next,
      {
        label: `${mode}/tanstack`,
        component: "DangerZoneSection",
        source: danger.content,
        transport: "settings-action",
      },
    ];
  });
}

export function element(tree: unknown, type: string): TestElement {
  const node = elements(tree).find((candidate) => candidate.type === type);
  if (!node) throw new Error(`Missing ${type}`);
  return node;
}

export function invoke(node: TestElement, event: string, ...args: unknown[]): void {
  const handler = node.props[event];
  if (typeof handler !== "function") throw new Error(`Missing ${event} handler`);
  Reflect.apply(handler, undefined, args);
}

export function deletionHarness(
  scenario: Scenario,
  deleteAccount: unknown,
  translations?: typeof EN_MESSAGES.settings.danger,
) {
  const destinations: string[] = [];
  const events: string[] = [];
  const queryClient = {};
  const harness = generatedFormHarness(scenario.source, [scenario.component], {
    ...Object.fromEntries(
      [
        "CardFooter",
        "Dialog",
        "DialogContent",
        "DialogDescription",
        "DialogFooter",
        "DialogHeader",
        "DialogTitle",
        "DialogTrigger",
        "Separator",
      ].map((name) => [name, name]),
    ),
    createRequiredPasswordSchema: () => ({}),
    identityClient: { deleteAccount },
    getQueryClient: () => queryClient,
    transitionQueryAuthScope: (client: unknown, scope: unknown) => {
      expect(client).toBe(queryClient);
      expect(scope).toBeNull();
      events.push("retire");
    },
    isIdentityRecentAuthenticationError: (error: { code?: string }) =>
      error.code === "SESSION_EXPIRED" || error.code === "SESSION_NOT_FRESH",
    useNavigate:
      () =>
      ({ to }: { to: string }) => {
        events.push("navigate");
        destinations.push(to);
      },
    useRouter: () => ({
      push: (to: string) => {
        events.push("navigate");
        destinations.push(to);
      },
      refresh: () => events.push("refresh"),
    }),
    useSurfaceTranslations: () => (key: string) => {
      const value = translations
        ? Reflect.get(translations, key.replace(/^danger\./, ""))
        : undefined;
      return typeof value === "string" ? value : key;
    },
  });
  return {
    ...harness,
    destinations,
    events,
    render: () => harness.render(scenario.component, { deleteAccount }),
  };
}
