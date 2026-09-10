import { expect } from "bun:test";
import { accountDeletionFeatureFiles } from "../../src/templates/apps/fragments/settings/deletion-feature.js";
import { identityModelContent } from "../../src/templates/apps/fragments/auth/client-validation.js";
import { settingsFeatureHarness } from "./settings-feature-harness.js";
import { EN_MESSAGES } from "../../src/templates/i18n/messages/en.js";
import { elements, type TestElement } from "./generated-form-harness.js";

interface Scenario {
  label: string;
  router: "next" | "tanstack";
  source: string;
  transport: "identity-client";
}

export function scenarios(hasEmail = true): Scenario[] {
  return (["monorepo", "single"] as const).flatMap<Scenario>((mode) =>
    (["next", "tanstack"] as const).map((router) => ({
      label: `${mode}/${router}`,
      router,
      transport: "identity-client",
      source:
        identityModelContent() +
        "\n" +
        accountDeletionFeatureFiles(mode === "single" ? "src" : "apps/web/src", router, hasEmail)
          .filter(({ path }) => !path.endsWith("/account-deletion.tsx"))
          .map(({ content }) => content)
          .join("\n"),
    })),
  );
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
  let queryClient: unknown;
  const harness = settingsFeatureHarness(
    scenario.source,
    ["useAccountDeletion", "DangerZoneView"],
    {
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
      transitionQueryAuthScope: (client: unknown, scope: unknown) => {
        expect(client).toBe(queryClient);
        expect(scope).toBeNull();
        events.push("retire");
      },
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
    },
  );
  queryClient = harness.queryClient;
  return {
    ...harness,
    destinations,
    events,
    render: () => harness.render("DangerZoneView", { model: harness.render("useAccountDeletion") }),
  };
}
