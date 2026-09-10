import { authFeatureFiles } from "../../src/templates/apps/fragments/auth/feature.js";
import { generatedFormHarness } from "./generated-form-harness.js";

/** Executes the emitted public-auth workflows and their ordinary SDK adapters. */
export function authFeatureHarness(
  router: "next" | "tanstack",
  names: string[],
  bindings: Record<string, unknown> = {},
) {
  const source =
    authFeatureFiles({ router, hasEmail: true, hasPasskey: true })
      .filter(
        ({ path }) =>
          !path.endsWith("/types.ts") && !path.includes("/lib/") && !path.endsWith("-screen.tsx"),
      )
      .map(({ content }) => content)
      .join("\n") +
    `
function TwoFactorHarness() { return TwoFactorForm({ state: useTwoFactorForm() }); }
function ResetPasswordHarness({ token, queryError }) { return ResetPasswordForm({ state: useResetPasswordForm(token, queryError) }); }
`;
  const ui = generatedFormHarness(source, names, {
    Link: "Link",
    CardFooter: "CardFooter",
    Badge: "Badge",
    ArrowLeft: "ArrowLeft",
    createSignInSchema: () => ({}),
    createSignUpSchema: () => ({}),
    createTwoFactorChallengeSchema: () => ({}),
    createResetPasswordSchema: () => ({}),
    createEmailSchema: () => ({}),
    IDENTITY_OAUTH_PROVIDERS: ["google", "github"],
    ...bindings,
  });
  return {
    ...ui,
    render(name: string, props?: unknown) {
      const result = ui.render(name, props);
      ui.flushEffects();
      return result;
    },
  };
}
