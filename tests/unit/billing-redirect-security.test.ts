import { describe, expect, it } from "bun:test";
import { billingApplicationsFiles } from "../../src/templates/billing/applications/billing.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { billingServiceFiles } from "../../src/templates/services/billing.js";

interface RedirectError extends Error {
  code: "INVALID_REDIRECT";
}

type ValidateRedirect = (
  value: string,
  label: string,
  readEnvironment: (name: string) => string | undefined,
) => { ok: true; value: string } | { ok: false; error: RedirectError };

function loadRedirectValidator(mode: "monorepo" | "single"): ValidateRedirect {
  const source =
    billingServiceFiles(mode).find(({ path }) => path.endsWith("billing/redirect-url-policy.ts"))
      ?.content ?? "";
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
  );
  return new Function("ServiceError", `${executable}; return validateBillingRedirectUrl;`)(
    class ServiceError extends Error {
      constructor(
        readonly code: "INVALID_REDIRECT",
        message: string,
        options?: { cause?: unknown },
      ) {
        super(message, options);
      }
    },
  ) as ValidateRedirect;
}

function environment(values: Record<string, string | undefined>) {
  return (name: string): string | undefined => values[name];
}

describe("billing redirect origin policy", () => {
  for (const mode of ["monorepo", "single"] as const) {
    it(`${mode} accepts only configured HTTPS or loopback HTTP application origins`, () => {
      const validate = loadRedirectValidator(mode);
      const readEnvironment = environment({
        BETTER_AUTH_URL: "https://app.example.test",
        EXPO_PUBLIC_APP_URL: "http://localhost:8081",
      });

      expect(
        validate(
          "https://app.example.test/billing/success?session=1#done",
          "Checkout success URL",
          readEnvironment,
        ),
      ).toEqual({
        ok: true,
        value: "https://app.example.test/billing/success?session=1#done",
      });
      expect(
        validate(
          "http://localhost:8081/billing?checkout=success",
          "Mobile callback",
          readEnvironment,
        ),
      ).toEqual({
        ok: true,
        value: "http://localhost:8081/billing?checkout=success",
      });

      for (const candidate of [
        "http://app.example.test/billing",
        "https://evil.example.test/billing",
        "https://app.example.test.evil.test/billing",
        "https://user:password@app.example.test/billing",
        "javascript:alert(1)",
        "ghostinit://billing/success",
        "//app.example.test/billing",
        "/billing/success",
        "not a url",
      ]) {
        const result = validate(candidate, "Billing callback", readEnvironment);
        expect(result.ok, candidate).toBe(false);
        if (!result.ok) expect(result.error.code, candidate).toBe("INVALID_REDIRECT");
      }
    });

    it(`${mode} rejects insecure or non-canonical configured application origins`, () => {
      const validate = loadRedirectValidator(mode);
      for (const configured of [
        "http://app.example.test",
        "http://0.0.0.0:3000",
        "http://127.attacker.example:3000",
        "ftp://app.example.test",
        "https://user:password@app.example.test",
        "https://app.example.test/base",
        "https://app.example.test?tenant=one",
        "https://app.example.test?",
        "https://app.example.test#fragment",
        "https://app.example.test#",
      ]) {
        const result = validate(
          "https://app.example.test/billing",
          "Billing callback",
          environment({ BETTER_AUTH_URL: configured }),
        );
        expect(result.ok, configured).toBe(false);
        if (!result.ok) {
          expect(result.error.message, configured).toBe(
            "Billing application origin or deep link is not configured",
          );
        }
      }

      expect(
        validate(
          "http://127.0.0.42:8081/billing?checkout=success",
          "Loopback callback",
          environment({ NEXT_PUBLIC_APP_URL: "http://127.0.0.42:8081/" }),
        ),
      ).toEqual({
        ok: true,
        value: "http://127.0.0.42:8081/billing?checkout=success",
      });
    });

    it(`${mode} accepts only the explicitly configured Expo billing deep link`, () => {
      const validate = loadRedirectValidator(mode);
      const readEnvironment = environment({ EXPO_PUBLIC_APP_URL: "myapp://billing" });

      expect(
        validate("myapp://billing?checkout=success", "Mobile callback", readEnvironment),
      ).toEqual({ ok: true, value: "myapp://billing?checkout=success" });

      for (const candidate of [
        "myapp://settings",
        "myapp://billing/other",
        "otherapp://billing",
        "javascript:alert(1)",
        "file:///billing",
      ]) {
        const result = validate(candidate, "Mobile callback", readEnvironment);
        expect(result.ok, candidate).toBe(false);
        if (!result.ok) expect(result.error.code, candidate).toBe("INVALID_REDIRECT");
      }

      for (const configured of [
        "myapp://billing?tenant=one",
        "myapp://billing?",
        "myapp://billing#fragment",
        "myapp://billing#",
      ]) {
        const result = validate(
          "myapp://billing?checkout=success",
          "Mobile callback",
          environment({ EXPO_PUBLIC_APP_URL: configured }),
        );
        expect(result.ok, configured).toBe(false);
      }
    });

    it(`${mode} fails closed when no valid application origin is configured`, () => {
      const result = loadRedirectValidator(mode)(
        "https://app.example.test/billing",
        "Billing callback",
        environment({ BETTER_AUTH_URL: "REPLACE_WITH_URL", NEXT_PUBLIC_APP_URL: "invalid" }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error.message).toBe(
          "Billing application origin or deep link is not configured",
        );
    });
  }

  it("validates every checkout and portal destination before invoking capability services", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = billingApplicationsFiles(mode);
      const checkout =
        files.find(({ path }) => path.endsWith("billing/application/create-checkout.usecase.ts"))
          ?.content ?? "";
      const portal =
        files.find(({ path }) =>
          path.endsWith("billing/application/create-portal-session.usecase.ts"),
        )?.content ?? "";

      expect(checkout.match(/validateBillingRedirectUrl\(/g)).toHaveLength(3);
      expect(checkout).toContain(
        'validateBillingRedirectUrl(input.successUrl, "Checkout success URL"',
      );
      expect(checkout.indexOf("validateBillingRedirectUrl(")).toBeLessThan(
        checkout.indexOf("createCheckoutService("),
      );
      expect(portal).toContain(
        'validateBillingRedirectUrl(\n    input.returnUrl,\n    "Portal return URL"',
      );
      expect(portal.indexOf("validateBillingRedirectUrl(")).toBeLessThan(
        portal.indexOf("createPortalSessionService("),
      );
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        it(`${mode}/${framework}/${database} emits oRPC billing without parallel REST routes`, () => {
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: "billing-orpc-only",
              mode,
              framework,
              database,
              preset: "saas",
              billing: ["stripe", "chargily"],
              apps: ["web"],
            }),
          );
          const paths = files.map(({ path }) => path);
          const procedurePrefix = mode === "monorepo" ? "packages/api/src" : "src/server/api";

          expect(paths).toContain(`${procedurePrefix}/procedures/billing/create-checkout.ts`);
          expect(paths).toContain(`${procedurePrefix}/procedures/billing/create-portal-session.ts`);
          expect(
            paths.filter((path) =>
              /(?:app|routes)\/api\/billing\/(?:subscriptions|checkout|portal|payment-link)(?:\/route)?\.ts$/.test(
                path,
              ),
            ),
          ).toEqual([]);

          const billingClients = files
            .filter(({ path }) => /(?:use-billing(?:-page)?|billing\/mutations)\.ts$/.test(path))
            .map(({ content }) => content)
            .join("\n");
          expect(billingClients).toContain("orpc");
          expect(billingClients).not.toMatch(/fetch\(["']\/api\/billing\//);
        });
      }
    }
  }
});
