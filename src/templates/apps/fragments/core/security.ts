/**
 * Core fragments – security headers + CSP
 * Shared between Next.js nextConfig and TanStack vite/nitro routeRules
 */
import { paddleCheckoutPolicyDeclaration } from "../../../billing/ui/paddle-csp.js";

export const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "0",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    // Note: `preload` is intentionally omitted by default. Adding `preload`
    // submits the domain to the HSTS preload list which is irreversible.
    // Enable only after verifying https on all subdomains and submitting at hstspreload.org.
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    // Production baseline. React's development diagnostics require
    // 'unsafe-eval', so framework adapters may append it only in development.
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  },
];

export function cacheComponentsConfigBlock(hasCloudflare = false): string {
  if (hasCloudflare) {
    return `  // The pinned Next/OpenNext stack hangs on request-bound Suspense in workerd.
  // Re-enable only after the Worker runtime gate proves compatibility.
  // Application caching (--cache redis) remains independent of this setting.
  // See docs/CLOUDFLARE_DEPLOYMENT.md for the affected versions and evidence.
  cacheComponents: false,`;
  }
  return `  // Cache Components keeps static shells and Partial Prerendering available.
  // On self-hosted horizontal replicas, configure and verify the appropriate
  // Next.js cacheHandler/cacheHandlers against shared storage. --cache redis
  // configures the application cache only; it does not configure Next.js.
  cacheComponents: true,`;
}

export function nextConfigHeadersFunction(hasConvex = false, hasPaddle = false): string {
  const convexSourceDeclaration = hasConvex
    ? `    const publicConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    const convexSiteUrl = process.env.CONVEX_SITE_URL;
    if (!publicConvexUrl || !convexSiteUrl) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL and CONVEX_SITE_URL are required to build an exact Convex CSP");
    }
    const publicConvexOrigin = new URL(publicConvexUrl);
    const convexSiteOrigin = new URL(convexSiteUrl);
    if (publicConvexOrigin.protocol !== "https:" || convexSiteOrigin.protocol !== "https:") {
      throw new Error("Convex CSP origins must use HTTPS");
    }
    const convexConnectSources =
      " " + publicConvexOrigin.origin + " " + convexSiteOrigin.origin +
      " wss://" + publicConvexOrigin.host + " wss://" + convexSiteOrigin.host;
`
    : `    const convexConnectSources = "";
`;
  return `  async headers() {
    ${hasPaddle ? paddleCheckoutPolicyDeclaration() : ""}
    // Next.js and the locale bootstrap emit inline hydration scripts. A
    // per-request nonce would force every route to be dynamic and would disable
    // Cache Components/PPR, so unsafe-inline remains until a production-ready
    // static hash/SRI path is available. React needs unsafe-eval only in dev.
    // Test runners can launch the development server with NODE_ENV=test, so
    // treat that explicit non-production mode as development diagnostics too.
    const allowsDevelopmentDiagnostics =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
${convexSourceDeclaration}
    const contentSecurityPolicy =
      "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (allowsDevelopmentDiagnostics ? " 'unsafe-eval'" : "") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com" + convexConnectSources + "; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            // preload omitted by default — see securityHeaders comment
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
      ${hasPaddle ? '{ source: "/billing/paddle-checkout", headers: [{ key: "Content-Security-Policy", value: paddleCheckoutContentSecurityPolicy(contentSecurityPolicy) }] },' : ""}
    ];
  },`;
}

export const transpilePackagesList = `  transpilePackages: ["@repo/analytics", "@repo/api", "@repo/auth", "@repo/billing", "@repo/config", "@repo/contracts", "@repo/database", "@repo/email", "@repo/kernel", "@repo/modules", "@repo/observability", "@repo/services", "@repo/ui"],`;

export function posthogRewritesBlock(): string {
  return `  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },`;
}

export function tanstackSecurityPolicyDeclaration(hasConvex = false, hasPaddle = false): string {
  const convexSourceDeclaration = hasConvex
    ? `  const rawConvexUrl = process.env.VITE_CONVEX_URL;
  if (!rawConvexUrl) throw new Error("VITE_CONVEX_URL is required to build an exact Convex CSP");
  const convexUrl = new URL(rawConvexUrl);
  if (convexUrl.protocol !== "https:") throw new Error("VITE_CONVEX_URL must use HTTPS");
  const convexConnectSources = " " + convexUrl.origin + " wss://" + convexUrl.host;
`
    : `  const convexConnectSources = "";
`;
  return `${hasPaddle ? paddleCheckoutPolicyDeclaration() + "\n" : ""}function contentSecurityPolicy(): string {
  // Vite dev servers launched by a test runner can inherit NODE_ENV=test.
  // Production remains an exact fail-closed mode with no eval or HMR sockets.
  const isDevelopment =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
${convexSourceDeclaration}
  return [
    "default-src 'self'",
    \`script-src 'self' 'unsafe-inline'\${isDevelopment ? " 'unsafe-eval'" : ""}\`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    \`connect-src 'self' https://us.i.posthog.com\${convexConnectSources}\${isDevelopment ? " ws: wss:" : ""}\`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ") + ";";
}`;
}

export function viteSecurityHeaders(hasPaddle = false): string {
  return `        '/**': {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-XSS-Protection': '0',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
            // preload omitted by default — see securityHeaders comment
            'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
            // Vite/React diagnostics and HMR require eval/WebSockets only in
            // development. The production Nitro artifact is fail-closed.
            'Content-Security-Policy': contentSecurityPolicy(),
          },
        },${hasPaddle ? '\n        "/billing/paddle-checkout": { headers: { "Content-Security-Policy": paddleCheckoutContentSecurityPolicy(contentSecurityPolicy()) } },' : ""}`;
}
