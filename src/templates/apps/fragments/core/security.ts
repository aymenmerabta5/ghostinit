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
    // Production baseline. React's development diagnostics require
    // 'unsafe-eval', so framework adapters may append it only in development.
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  },
];

export const cacheComponentsConfigBlock = `  // Cache Components keeps static shells and Partial Prerendering available.
  // On self-hosted horizontal replicas, configure and verify the appropriate
  // Next.js cacheHandler/cacheHandlers against shared storage. --cache redis
  // configures the application cache only; it does not configure Next.js.
  cacheComponents: true,`;

export function nextConfigHeadersFunction(): string {
  return `  async headers() {
    // Next.js and the locale bootstrap emit inline hydration scripts. A
    // per-request nonce would force every route to be dynamic and would disable
    // Cache Components/PPR, so unsafe-inline remains until a production-ready
    // static hash/SRI path is available. React needs unsafe-eval only in dev.
    // Test runners can launch the development server with NODE_ENV=test, so
    // treat that explicit non-production mode as development diagnostics too.
    const allowsDevelopmentDiagnostics =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const contentSecurityPolicy =
      "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (allowsDevelopmentDiagnostics ? " 'unsafe-eval'" : "") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
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

export function tanstackSecurityPolicyDeclaration(): string {
  return `function contentSecurityPolicy(): string {
  // Vite dev servers launched by a test runner can inherit NODE_ENV=test.
  // Production remains an exact fail-closed mode with no eval or HMR sockets.
  const isDevelopment =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  return [
    "default-src 'self'",
    \`script-src 'self' 'unsafe-inline'\${isDevelopment ? " 'unsafe-eval'" : ""}\`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    \`connect-src 'self' https://us.i.posthog.com\${isDevelopment ? " ws: wss:" : ""}\`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ") + ";";
}`;
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
            // Vite/React diagnostics and HMR require eval/WebSockets only in
            // development. The production Nitro artifact is fail-closed.
            'Content-Security-Policy': contentSecurityPolicy(),
          },
        },`;
}
