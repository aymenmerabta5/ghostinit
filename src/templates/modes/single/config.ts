import { secret, type TemplateFile } from "../../shared.js";
import {
  filteredEnvExample as unifiedFilteredEnvExample,
  filteredEnvLocal as unifiedFilteredEnvLocal,
} from "../../shared/env.js";
import { billingProviders } from "../../../lib/addons.js";
import type { RootSecrets } from "../../root.js";
import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";

export interface SingleSecrets extends RootSecrets {}
export interface SingleContext {
  dryRun?: boolean;
}

export function buildSecrets(): RootSecrets {
  return {
    authSecret: secret(),
    postgresPassword: secret(),
    resendApiKey: secret(),
    stripeSecretKey: secret(),
    stripeWebhookSecret: secret(),
    stripePublishableKey: "pk_test_" + secret().slice(0, 32),
    chargilyApiKey: secret(),
    chargilySecretKey: secret(),
    paddleApiKey: secret(),
    paddleWebhookSecret: secret(),
    paddleClientToken: "pdl_ntf_" + secret().slice(0, 24),
    polarAccessToken: secret(),
    polarWebhookSecret: secret(),
    polarOrgId: secret(),
  };
}

export function filteredEnvExample(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  includeResend: boolean,
  runtime: string,
): TemplateFile {
  return unifiedFilteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    includeResend,
    runtime,
    "single",
  );
}

export function filteredEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  runtime = "bun",
): TemplateFile {
  return unifiedFilteredEnvLocal(projectName, secrets, selectedBilling, runtime, "single");
}

export function selectedBillingFromAddons(
  addons?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): BillingProviderName[] {
  if (!addons) return [];
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) {
    if ((addons as any)[p]?.inUse) sel.push(p as BillingProviderName);
  }
  return sel;
}

export const SECURITY_HEADERS = [
  "  reactStrictMode: true,",
  "  poweredByHeader: false,",
  "  async headers() {",
  "    return [",
  "      {",
  "        source: '/:path*',",
  "        headers: [",
  "          { key: 'X-Content-Type-Options', value: 'nosniff' },",
  "          { key: 'X-Frame-Options', value: 'DENY' },",
  "          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },",
  "          { key: 'X-XSS-Protection', value: '0' },",
  "          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },",
  "          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },",
  "          {",
  "            key: 'Content-Security-Policy',",
  "            value: \"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';\",",
  "          },",
  "        ],",
  "      },",
  "    ];",
  "  },",
].join("\n");

export function viteSecurityHeaders(): string {
  return `        '/**': {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-XSS-Protection': '0',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
            'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
        },`;
}

export const REWRITES = [
  "  async rewrites() {",
  "    return [",
  "      {",
  '        source: "/ingest/static/:path*",',
  '        destination: "https://us.i.posthog.com/static/:path*",',
  "      },",
  "      {",
  '        source: "/ingest/:path*",',
  '        destination: "https://us.i.posthog.com/:path*",',
  "      },",
  "      {",
  '        source: "/ingest/decide",',
  '        destination: "https://us.i.posthog.com/decide",',
  "      },",
  "    ];",
  "  },",
].join("\n");
