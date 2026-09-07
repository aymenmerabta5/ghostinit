/**
 * Core fragments – security headers + CSP
 * Shared between Next.js nextConfig and TanStack vite/nitro routeRules
 */

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
    // Note: 'unsafe-eval' removed — no generated dependency requires eval.
    // If adding a library that needs eval (e.g. legacy analytics), isolate it
    // and add 'unsafe-eval' only to that route's CSP.
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  },
];

export function nextConfigHeadersFunction(): string {
  return `  async headers() {
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
            // 'unsafe-eval' removed; PostHog served via /ingest rewrites so no extra connect-src needed in CSP here
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://us.i.posthog.com https://*.convex.cloud https://*.convex.site wss://*.convex.cloud; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
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

export function viteSecurityHeaders(): string {
  return `        '/**': {
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-XSS-Protection': '0',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
            // preload omitted by default — see securityHeaders comment
            'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
            'Content-Security-Policy':
              // 'unsafe-eval' removed; allow ws/wss for vite HMR in dev (prod Nitro routeRules overrides with stricter connect-src)
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
        },`;
}
