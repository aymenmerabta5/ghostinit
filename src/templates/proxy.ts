import type { ProjectMode } from "../lib/addons.js";
import { file, type TemplateFile } from "./shared.js";

const MATCHER = `"/((?!api|_next|_vercel|static|.*\\\\..*).*)"`;

const MAINTENANCE_ACCESS = `export const MAINTENANCE_COOKIE = "ghostinit_maintenance_bypass";
export const MAINTENANCE_COOKIE_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid maintenance cookie");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  // atob accepts alternate trailing pad bits that decode to the same MAC.
  // Require the one canonical unpadded base64url spelling before verification.
  if (base64Url(bytes) !== value) throw new Error("Invalid maintenance cookie");
  return bytes.buffer;
}

async function maintenanceKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isMaintenanceSecretConfigured(secret: string | undefined): secret is string {
  return Boolean(
    secret &&
    secret.length >= 32 &&
    secret.length <= 512 &&
    !secret.startsWith("REPLACE_WITH") &&
    new Set(secret).size >= 12,
  );
}

export async function matchesMaintenanceMaster(candidate: string, secret: string): Promise<boolean> {
  if (candidate.length === 0 || candidate.length > 512 || !isMaintenanceSecretConfigured(secret)) return false;
  const [candidateHash, secretHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(secretHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

export async function issueMaintenanceCookie(secret: string): Promise<string> {
  if (!isMaintenanceSecretConfigured(secret)) throw new Error("Maintenance bypass is not securely configured");
  const expiresAt = Date.now() + MAINTENANCE_COOKIE_TTL_SECONDS * 1000;
  const payload = "ghostinit-maintenance:" + String(expiresAt);
  const signature = await crypto.subtle.sign("HMAC", await maintenanceKey(secret), encoder.encode(payload));
  return String(expiresAt) + "." + base64Url(new Uint8Array(signature));
}

export async function verifyMaintenanceCookie(value: string | undefined, secret: string): Promise<boolean> {
  if (!value || value.length > 256 || !isMaintenanceSecretConfigured(secret)) return false;
  const [expiresText, encodedSignature, ...extra] = value.split(".");
  if (extra.length > 0 || !expiresText || !encodedSignature || !/^\\d{13}$/.test(expiresText)) return false;
  const expiresAt = Number(expiresText);
  const now = Date.now();
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAINTENANCE_COOKIE_TTL_SECONDS * 1000) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await maintenanceKey(secret),
      decodeBase64Url(encodedSignature),
      encoder.encode("ghostinit-maintenance:" + expiresText),
    );
  } catch {
    return false;
  }
}`;

const MAINTENANCE_GATE = `interface MaintenanceStatus {
  enabled: boolean;
  canBypass: boolean;
}

async function checkMaintenanceStatus(request: NextRequest): Promise<MaintenanceStatus> {
  if (process.env.MAINTENANCE_MODE !== "true") return { enabled: false, canBypass: true };
  const secret = process.env.MAINTENANCE_BYPASS_TOKEN;
  if (!isMaintenanceSecretConfigured(secret)) return { enabled: true, canBypass: false };
  return {
    enabled: true,
    canBypass: await verifyMaintenanceCookie(request.cookies.get(MAINTENANCE_COOKIE)?.value, secret),
  };
}`;

function maintenanceAccessRouteContent(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import {
  MAINTENANCE_COOKIE,
  MAINTENANCE_COOKIE_TTL_SECONDS,
  isMaintenanceSecretConfigured,
  issueMaintenanceCookie,
  matchesMaintenanceMaster,
} from "@/lib/maintenance-access";

const MAX_ACCESS_BODY_BYTES = 1_024;
const ACCESS_BODY_TIMEOUT_MS = 5_000;
const ACCESS_WINDOW_MS = 60_000;
const MAX_ACCESS_ATTEMPTS = 30;
let accessWindowStartedAt = 0;
let accessAttempts = 0;
let activeAccessRequests = 0;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

function admitAccessAttempt(): (() => void) | undefined {
  const now = Date.now();
  if (now - accessWindowStartedAt >= ACCESS_WINDOW_MS) {
    accessWindowStartedAt = now;
    accessAttempts = 0;
  }
  if (accessAttempts >= MAX_ACCESS_ATTEMPTS || activeAccessRequests >= 4) return undefined;
  accessAttempts += 1;
  activeAccessRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeAccessRequests = Math.max(0, activeAccessRequests - 1);
  };
}

async function readAccessToken(request: Request): Promise<string | undefined> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\\d+$/.test(declared) || Number(declared) > MAX_ACCESS_BODY_BYTES)) return undefined;
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("maintenance access body timeout").catch(() => undefined);
  }, ACCESS_BODY_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACCESS_BODY_BYTES) {
        void reader.cancel("maintenance access body limit exceeded").catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    if (timedOut) return undefined;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(body)).get("token") ?? undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.MAINTENANCE_MODE !== "true") return jsonError("Not found", 404);
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin) return jsonError("Maintenance access denied", 403);
  const release = admitAccessAttempt();
  if (!release) return jsonError("Maintenance access is temporarily rate limited", 429);
  try {
    const secret = process.env.MAINTENANCE_BYPASS_TOKEN;
    if (!isMaintenanceSecretConfigured(secret)) return jsonError("Maintenance bypass is unavailable", 503);
    const candidate = await readAccessToken(request);
    if (!candidate || !(await matchesMaintenanceMaster(candidate, secret))) {
      return jsonError("Maintenance access denied", 403);
    }
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.cookies.set(MAINTENANCE_COOKIE, await issueMaintenanceCookie(secret), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAINTENANCE_COOKIE_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } finally {
    release();
  }
}
`;
}

function maintenancePageContent(): string {
  return `import * as React from "react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function generateMetadata(): Promise<{ title: string; description: string }> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("maintenanceTitle"), description: t("maintenanceDescription") };
}

async function MaintenanceContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{t("maintenance.status")}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t("maintenance.title")}</h1>
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        {t("maintenance.description")}
      </p>
      <Card className="mt-5 w-full max-w-sm text-start">
        <CardHeader>
          <CardTitle>{t("maintenance.accessLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/maintenance/access" method="post" rel="noreferrer">
            <FieldGroup>
              <Field>
                <FieldLabel className="sr-only" htmlFor="maintenance-token">
                  {t("maintenance.accessLabel")}
                </FieldLabel>
                <Input
                  id="maintenance-token"
                  name="token"
                  type="password"
                  required
                  minLength={32}
                  maxLength={512}
                  autoComplete="off"
                />
              </Field>
              <Button type="submit">{t("maintenance.accessAction")}</Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function MaintenanceFallback(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-3 px-6" aria-busy="true">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-32 w-full" />
    </main>
  );
}

export default function MaintenancePage(): React.JSX.Element {
  return (
    <Suspense fallback={<MaintenanceFallback />}>
      <MaintenanceContent />
    </Suspense>
  );
}
`;
}

function proxyContent(hasAuth: boolean): string {
  const authDefinitions = hasAuth
    ? `export const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/profile", "/admin", "/settings", "/billing"] as const;
export const AUTH_PATHS = ["/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => matchesPath(pathname, path));
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => matchesPath(pathname, path));
}`
    : "";
  const authGate = hasAuth
    ? `  if (isProtectedPath(pathname) && !getSessionCookie(request)) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    return response;
  }
`
    : "";
  return `${hasAuth ? 'import { getSessionCookie } from "better-auth/cookies";\n' : ""}import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MAINTENANCE_COOKIE,
  isMaintenanceSecretConfigured,
  verifyMaintenanceCookie,
} from "@/lib/maintenance-access";

export const MAINTENANCE_EXEMPT_PATHS = [${hasAuth ? '"/login", "/sign-in", "/sign-up", "/reset-password", "/forgot-password", "/verify", ' : ""}"/maintenance"] as const;

function matchesPath(path: string, base: string): boolean {
  if (path === base) return true;
  if (!path.startsWith(base)) return false;
  const nextChar = path.charAt(base.length);
  return nextChar === "/" || nextChar === "?" || nextChar === "#";
}

${authDefinitions}

export function isMaintenanceExemptPath(pathname: string): boolean {
  return MAINTENANCE_EXEMPT_PATHS.some((path) => matchesPath(pathname, path));
}

${MAINTENANCE_GATE}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const maintenance = await checkMaintenanceStatus(request);

  if (!isMaintenanceExemptPath(pathname)) {
    if (maintenance.enabled && !maintenance.canBypass) {
      const response = NextResponse.rewrite(new URL("/maintenance", request.url));
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("CDN-Cache-Control", "no-store");
      return response;
    }
  }

${authGate}
  return NextResponse.next();
}

export const config = {
  matcher: [${MATCHER}],
};
`;
}

export function proxyFiles(
  mode: ProjectMode = "monorepo",
  _hasI18n = false,
  hasAuth = true,
): TemplateFile[] {
  const proxyPath = mode === "single" ? "src/proxy.ts" : "apps/web/src/proxy.ts";
  const pageDir = mode === "single" ? "src/app" : "apps/web/src/app";
  const libDir = mode === "single" ? "src/lib" : "apps/web/src/lib";
  return [
    file(proxyPath, proxyContent(hasAuth)),
    file(`${libDir}/maintenance-access.ts`, MAINTENANCE_ACCESS),
    file(`${pageDir}/maintenance/access/route.ts`, maintenanceAccessRouteContent()),
    file(`${pageDir}/maintenance/page.tsx`, maintenancePageContent()),
  ];
}
