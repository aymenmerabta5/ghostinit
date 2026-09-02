import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { billing } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { billingFiles } from "../../src/templates/billing-generator.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { webhookRuntimeDeps } from "../../src/templates/apps/fragments/webhook-deps.js";
import { webhookContent } from "../../src/templates/billing/webhooks/providers/index.js";

describe("Stripe 22 Bun-compatible integration", () => {
  it("keeps the exact SDK release and Dahlia API literal coupled", () => {
    expect(billing.stripe).toBe("22.5.0");

    for (const mode of ["monorepo", "single"] as const) {
      const files = billingFiles({
        mode,
        addons: { billing: { inUse: true }, stripe: { inUse: true } } as never,
      });
      const apiVersion = files.find(({ path }) =>
        path.endsWith("providers/stripe/api-version.ts"),
      )?.content;
      const client = files.find(({ path }) => path.endsWith("providers/stripe/client.ts"))?.content;
      const provider = files.find(({ path }) => path.endsWith("providers/stripe.ts"))?.content;

      expect(apiVersion).toContain('STRIPE_API_VERSION = "2026-07-29.dahlia"');
      expect(client).toContain('from "./api-version"');
      expect(client).toContain("apiVersion: STRIPE_API_VERSION");
      expect(provider).toContain("Stripe Node v22.5.0 / API 2026-07-29.dahlia");
    }

    const hostTypes = readFileSync(
      resolve(import.meta.dir, "../../src/templates/billing/providers/stripe/host-only.d.ts"),
      "utf8",
    );
    expect(hostTypes).toContain('apiVersion?: "2026-07-29.dahlia"');
    expect(hostTypes).toContain("constructEventAsync(");
    expect(hostTypes).toContain("): Promise<Stripe.Event>;");
    expect(hostTypes).not.toMatch(/\bconstructEvent\(/);
  });

  it("uses asynchronous webhook verification in every framework/database variant", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["next", "tanstack"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const content = webhookContent("stripe", framework, mode, database).content;
          expect(content).toContain('apiVersion: "2026-07-29.dahlia"');
          expect(content).toContain(
            "await stripe.webhooks.constructEventAsync(buf, sig, stripeWebhookSecret)",
          );
          expect(content).not.toContain("stripe.webhooks.constructEvent(");
        }
      }
    }

    const providerWebhook = billingFiles("monorepo").find(({ path }) =>
      path.endsWith("providers/stripe/webhook.ts"),
    )?.content;
    expect(providerWebhook).toContain("await stripe.webhooks.constructEventAsync");
    expect(providerWebhook).not.toContain("stripe.webhooks.constructEvent(");
  });

  it("exact-pins Stripe everywhere while retaining compatible ranges for uncoupled SDKs", () => {
    expect(
      webhookRuntimeDeps({
        stripe: { inUse: true },
        chargily: { inUse: true },
        paddle: { inUse: true },
        polar: { inUse: true },
      } as never),
    ).toMatchObject({
      stripe: billing.stripe,
      "@chargily/chargily-pay": `^${billing["@chargily/chargily-pay"]}`,
      "@paddle/paddle-node-sdk": `^${billing["@paddle/paddle-node-sdk"]}`,
      "@polar-sh/sdk": `^${billing["@polar-sh/sdk"]}`,
    });

    const variants = [
      { mode: "monorepo", framework: "nextjs", database: "postgres", apps: ["web"] },
      { mode: "monorepo", framework: "tanstack-start", database: "convex", apps: ["web"] },
      { mode: "single", framework: "nextjs", database: "postgres", apps: ["web"] },
      { mode: "single", framework: "tanstack-start", database: "convex", apps: ["web"] },
    ] as const;

    for (const variant of variants) {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "stripe-exact",
          ...variant,
          preset: "saas",
          billing: ["stripe"],
        }),
      );
      const stripeSpecifiers = files.flatMap(({ path, content }) => {
        if (!path.endsWith("package.json")) return [];
        const manifest = JSON.parse(content) as { dependencies?: Record<string, string> };
        return manifest.dependencies?.stripe ? [`${path}: ${manifest.dependencies.stripe}`] : [];
      });
      expect(stripeSpecifiers.length, `${variant.mode}/${variant.framework}`).toBeGreaterThan(0);
      expect(stripeSpecifiers, `${variant.mode}/${variant.framework}`).toEqual(
        stripeSpecifiers.map((entry) => entry.replace(/: .+$/, `: ${billing.stripe}`)),
      );
    }
  });
});
