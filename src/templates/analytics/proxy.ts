import type { ProjectMode } from "../../lib/addons.js";

function envAccessSnippet(mode: ProjectMode): string {
  return mode === "monorepo"
    ? `import { env } from "@repo/config";

function getPostHogHost(): string {
  return (env as any).POSTHOG_HOST ?? (env as any).NEXT_PUBLIC_POSTHOG_HOST ?? (env as any).POSTHOG_API_HOST ?? (env as any).POSTHOG_HOST;
}
function getPostHogKey(): string {
  return (env as any).POSTHOG_KEY ?? (env as any).NEXT_PUBLIC_POSTHOG_KEY ?? (env as any).POSTHOG_KEY;
}`
    : `function getPostHogHost(): string {
  return process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? process.env.POSTHOG_API_HOST ?? process.env.POSTHOG_HOST;
}
function getPostHogKey(): string {
  return process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_KEY;
}`;
}

export function proxyReadmeContent(): string {
  return `# Analytics ingest proxy

- Client posthog-js configured with api_host: "/api/ingest"
- Next.js route handler /api/ingest/* proxies to allowlisted PostHog host
- SSRF protection: only allowlisted hosts accepted

Allowlist: us.i.posthog.com, eu.i.posthog.com, app.posthog.com, us-assets, eu-assets
`;
}

export function proxyRouteContent(mode: ProjectMode): string {
  const envAccess = envAccessSnippet(mode);
  return `import { NextRequest, NextResponse } from "next/server";
${envAccess}

const ALLOWLIST = [
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  "https://app.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
] as const;

function isAllowlistedHost(host: string): boolean {
  try {
    const normalized = host.replace(/\\/+$/, "");
    for (const allowed of ALLOWLIST) {
      if (normalized === allowed) return true;
      if (normalized.startsWith(allowed + "/")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolveTargetHost(): string {
  const configured = getPostHogHost();
  if (!configured) return "https://us.i.posthog.com";
  if (configured.startsWith("/")) {
    return "https://us.i.posthog.com";
  }
  if (isAllowlistedHost(configured)) {
    return configured.replace(/\\/+$/, "");
  }
  console.warn(\`[analytics:proxy] POSTHOG_HOST "\${configured}" is not in allowlist \${JSON.stringify(ALLOWLIST)}. Falling back to https://us.i.posthog.com\`);
  return "https://us.i.posthog.com";
}

function buildTargetUrl(request: NextRequest, host: string, extraPath?: string): string {
  const url = new URL(request.url);
  const search = url.search;
  let path = "/";
  const pathname = url.pathname;
  if (extraPath) {
    path = "/" + extraPath;
  } else {
    const idx = pathname.indexOf("/api/ingest");
    if (idx !== -1) {
      const after = pathname.slice(idx + "/api/ingest".length);
      path = after || "/";
    }
  }
  return host + path + search;
}

async function proxyRequest(request: NextRequest, extraPath?: string): Promise<NextResponse> {
  const targetHost = resolveTargetHost();
  const targetUrl = buildTargetUrl(request, targetHost, extraPath);

  if (!isAllowlistedHost(new URL(targetUrl).origin)) {
    return NextResponse.json({ error: "Invalid target host" }, { status: 400 });
  }

  try {
    const MAX_BODY_SIZE = 1_000_000;
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const parsed = parseInt(contentLength, 10);
      if (!Number.isNaN(parsed) && parsed > MAX_BODY_SIZE) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
    }

    let rawBody: Buffer | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const ab = await request.arrayBuffer();
      if (ab.byteLength > MAX_BODY_SIZE) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      rawBody = Buffer.from(ab);
    }

    const headers: Record<string, string> = {};
    const forwardHeaders = [
      "content-type",
      "content-encoding",
      "accept",
      "accept-encoding",
      "user-agent",
      "x-forwarded-for",
      "x-real-ip",
      "cf-connecting-ip",
      "x-posthog-lib",
      "x-posthog-lib-version",
    ];
    for (const h of forwardHeaders) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }

    const originalIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? (request as any).ip;
    if (originalIp && !headers["x-forwarded-for"]) {
      headers["x-forwarded-for"] = originalIp;
    }

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: rawBody,
      cache: "no-store",
      redirect: "manual",
    });

    const resBody = Buffer.from(await upstream.arrayBuffer());
    const res = new NextResponse(resBody, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    const safeResponseHeaders = [
      "content-type",
      "content-encoding",
      "cache-control",
      "access-control-allow-methods",
      "access-control-allow-headers",
    ];
    for (const h of safeResponseHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.headers.set(h, v);
    }

    res.headers.set("access-control-allow-origin", "*");
    return res;
  } catch (err) {
    console.error("[analytics:proxy] Upstream fetch failed", { targetUrl, err });
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "Content-Type, Authorization");
  res.headers.set("access-control-max-age", "86400");
  return res;
}
`;
}

export function proxyCatchAllRouteContent(mode: ProjectMode): string {
  const envAccess = envAccessSnippet(mode);
  return `import { NextRequest, NextResponse } from "next/server";
${envAccess}

const ALLOWLIST = [
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  "https://app.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
] as const;

function isAllowlistedHost(host: string): boolean {
  try {
    const normalized = host.replace(/\\/+$/, "");
    for (const allowed of ALLOWLIST) {
      if (normalized === allowed) return true;
      if (normalized.startsWith(allowed + "/")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolveTargetHost(): string {
  const configured = getPostHogHost();
  if (!configured) return "https://us.i.posthog.com";
  if (configured.startsWith("/")) return "https://us.i.posthog.com";
  if (isAllowlistedHost(configured)) return configured.replace(/\\/+$/, "");
  console.warn(\`[analytics:proxy] POSTHOG_HOST "\${configured}" not in allowlist, fallback\`);
  return "https://us.i.posthog.com";
}

interface RouteParams {
  params: Promise<{ path?: string[] }>;
}

async function proxyCatchAll(request: NextRequest, params: RouteParams): Promise<NextResponse> {
  const resolved = await params.params;
  const extraPath = (resolved.path?.join("/") ?? resolved.path?.join("/")) || "";
  const targetHost = resolveTargetHost();
  const url = new URL(request.url);
  const targetUrl = targetHost + "/" + extraPath + url.search;

  if (!isAllowlistedHost(new URL(targetUrl).origin)) {
    return NextResponse.json({ error: "Invalid target host" }, { status: 400 });
  }

  try {
    const MAX_BODY_SIZE = 1_000_000;
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const parsed = parseInt(contentLength, 10);
      if (!Number.isNaN(parsed) && parsed > MAX_BODY_SIZE) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
    }

    let rawBody: Buffer | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const ab = await request.arrayBuffer();
      if (ab.byteLength > MAX_BODY_SIZE) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      rawBody = Buffer.from(ab);
    }

    const headers: Record<string, string> = {};
    const forward = ["content-type", "user-agent", "x-forwarded-for", "x-real-ip", "accept", "accept-encoding"];
    for (const h of forward) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: rawBody,
      cache: "no-store",
      redirect: "manual",
    });

    const resBody = Buffer.from(await upstream.arrayBuffer());
    const res = new NextResponse(resBody, { status: upstream.status });
    const ct = upstream.headers.get("content-type");
    if (ct) res.headers.set("content-type", ct);
    res.headers.set("access-control-allow-origin", "*");
    return res;
  } catch (err) {
    console.error("[analytics:proxy] catch-all failed", { err, targetUrl });
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  return proxyCatchAll(request, ctx);
}

export async function GET(request: NextRequest, ctx: RouteParams): Promise<NextResponse> {
  return proxyCatchAll(request, ctx);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "Content-Type, Authorization");
  res.headers.set("access-control-max-age", "86400");
  return res;
}
`;
}
