// @allow-long 150: proxy template shared by monorepo + single, must stay reviewable side-by-side with licence-last src/proxy.ts
import { file, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";

const MATCHER = `"/((?!api|_next|_vercel|static|.*\\\\..*).*)"`;

/** Env-driven maintenance gate shared by both proxy variants (see MAINTENANCE_MODE in .env.example). */
const MAINTENANCE_GATE = `const MAINTENANCE_COOKIE = "ghostinit_maintenance_bypass";

interface MaintenanceStatus {
  enabled: boolean;
  canBypass: boolean;
  /** Token captured from ?maintenance_bypass=<token> — proxy sets the bypass cookie when present. */
  paramToken?: string;
}

function checkMaintenanceStatus(request: NextRequest): MaintenanceStatus {
  if (process.env.MAINTENANCE_MODE !== "true") return { enabled: false, canBypass: true };
  const token = process.env.MAINTENANCE_BYPASS_TOKEN;
  if (!token) return { enabled: true, canBypass: false };
  const paramToken = request.nextUrl.searchParams.get("maintenance_bypass") ?? undefined;
  const canBypass =
    (paramToken !== undefined && paramToken === token) ||
    request.cookies.get(MAINTENANCE_COOKIE)?.value === token;
  return { enabled: true, canBypass, paramToken: paramToken === token ? token : undefined };
}`;

function maintenancePageContent(): string {
  return `export const metadata = { title: "Maintenance" };

export default function MaintenancePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">503</p>
      <h1 className="text-2xl font-semibold tracking-tight">Down for maintenance</h1>
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        We are applying changes and will be back shortly. Your data is safe.
      </p>
    </main>
  );
}
`;
}

function proxyContent(mode: ProjectMode): string {
  const isSingle = mode === "single";
  const importPath = isSingle
    ? `import { getSessionCookie } from "better-auth/cookies";\nimport type { NextRequest } from "next/server";\nimport { NextResponse } from "next/server";`
    : `import { getSessionCookie } from "better-auth/cookies";\nimport type { NextRequest } from "next/server";\nimport { NextResponse } from "next/server";\nimport createMiddleware from "next-intl/middleware";\nimport { routing } from "@/i18n/routing";\n\nconst intlMiddleware = createMiddleware(routing);\n// Derive locales from routing to keep proxy in sync with next-intl config\nconst LOCALES = (routing.locales as readonly string[]).join("|");\nconst localeRegex = new RegExp(\`^/(\${LOCALES})(?=/|$)\`);`;

  const stripLocaleImpl = isSingle
    ? `function stripLocale(pathname: string): string {
  return pathname;
}`
    : `function stripLocale(pathname: string): string {
  return pathname.replace(localeRegex, "");
}`;

  const localeExtraction = isSingle
    ? `  const locale = "en";`
    : `  const locale = pathname.match(localeRegex)?.[1] ?? routing.defaultLocale;`;

  const intlDelegate = isSingle
    ? `  return NextResponse.next();`
    : `  return intlMiddleware(request);`;

  return `${importPath}

export const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/profile", "/admin", "/settings", "/billing"] as const;
export const AUTH_PATHS = ["/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password"] as const;
export const MAINTENANCE_EXEMPT_PATHS = ["/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password", "/verify", "/maintenance"] as const;

${stripLocaleImpl}

function matchesPath(path: string, base: string): boolean {
  if (path === base) return true;
  if (!path.startsWith(base)) return false;
  const nextChar = path.charAt(base.length);
  return nextChar === "/" || nextChar === "?" || nextChar === "#";
}

export function isProtectedPath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PROTECTED_PATHS.some((p) => matchesPath(path, p));
}

export function isAuthPath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return AUTH_PATHS.some((p) => matchesPath(path, p));
}

export function isMaintenanceExemptPath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return MAINTENANCE_EXEMPT_PATHS.some((p) => matchesPath(path, p));
}

${MAINTENANCE_GATE}

export async function proxy(request: NextRequest): Promise<ReturnType<typeof NextResponse.next>> {
  const { pathname } = request.nextUrl;
${localeExtraction}

  if (!isMaintenanceExemptPath(pathname)) {
    const { enabled, canBypass, paramToken } = checkMaintenanceStatus(request);
    if (enabled && canBypass && paramToken) {
      const bypassed = NextResponse.next();
      bypassed.cookies.set(MAINTENANCE_COOKIE, paramToken, { httpOnly: true, sameSite: "lax", path: "/" });
      return bypassed;
    }
    if (enabled && !canBypass) {
      const response = NextResponse.rewrite(new URL(\`/\${locale}/maintenance\`, request.url));
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("CDN-Cache-Control", "no-store");
      return response;
    }
  }

  if (isProtectedPath(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const response = NextResponse.redirect(new URL(\`/\${locale}/login\`, request.url));
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("CDN-Cache-Control", "no-store");
      return response;
    }
  }

  ${intlDelegate}
}

export const config = {
  matcher: [${MATCHER}],
};
`;
}

export function proxyFiles(mode: ProjectMode = "monorepo", hasI18n = false): TemplateFile[] {
  const proxyPath = mode === "single" ? "src/proxy.ts" : "apps/web/src/proxy.ts";
  const middlewarePath = mode === "single" ? "src/middleware.ts" : "apps/web/src/middleware.ts";
  // Shared matcher exported for Next middleware discovery (Next 16 supports both proxy.ts and middleware.ts)
  const middlewareShim = `import { proxy as proxyHandler, config } from "./proxy.js";
export default proxyHandler;
export { config };
`;
  // The maintenance rewrite target must exist, otherwise the gate 404s.
  const pageDir = mode === "single" ? "src/app" : "apps/web/src/app";
  const maintenancePage = hasI18n
    ? `${pageDir}/[locale]/maintenance/page.tsx`
    : `${pageDir}/maintenance/page.tsx`;

  // For non-i18n projects, emit a simplified proxy without next-intl import to avoid alias failure
  if (!hasI18n) {
    const simple = `import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/profile", "/admin", "/settings", "/billing"] as const;
export const AUTH_PATHS = ["/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password"] as const;
export const MAINTENANCE_EXEMPT_PATHS = ["/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password", "/verify", "/maintenance"] as const;

function stripLocale(pathname: string): string {
  return pathname;
}
function matchesPath(path: string, base: string): boolean {
  if (path === base) return true;
  if (!path.startsWith(base)) return false;
  const n = path.charAt(base.length);
  return n === "/" || n === "?" || n === "#";
}
export function isProtectedPath(p: string): boolean { return PROTECTED_PATHS.some((x) => matchesPath(stripLocale(p), x)); }
export function isAuthPath(p: string): boolean { return AUTH_PATHS.some((x) => matchesPath(stripLocale(p), x)); }
export function isMaintenanceExemptPath(pathname: string): boolean { return MAINTENANCE_EXEMPT_PATHS.some((x) => matchesPath(stripLocale(pathname), x)); }
${MAINTENANCE_GATE}
export async function proxy(request: NextRequest) {
  if (!isMaintenanceExemptPath(request.nextUrl.pathname)) {
    const { enabled, canBypass, paramToken } = checkMaintenanceStatus(request);
    if (enabled && canBypass && paramToken) {
      const bypassed = NextResponse.next();
      bypassed.cookies.set(MAINTENANCE_COOKIE, paramToken, { httpOnly: true, sameSite: "lax", path: "/" });
      return bypassed;
    }
    if (enabled && !canBypass) {
      const res = NextResponse.rewrite(new URL("/maintenance", request.url));
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }
  if (isProtectedPath(request.nextUrl.pathname)) {
    const c = getSessionCookie(request);
    if (!c) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }
  return NextResponse.next();
}
export const config = { matcher: [${MATCHER}] };
`;
    return [
      file(proxyPath, simple),
      file(middlewarePath, middlewareShim),
      file(maintenancePage, maintenancePageContent()),
    ];
  }
  return [
    file(proxyPath, proxyContent(mode)),
    file(middlewarePath, middlewareShim),
    file(maintenancePage, maintenancePageContent()),
  ];
}
