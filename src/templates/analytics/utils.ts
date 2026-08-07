import type { ProjectMode } from "../../lib/addons.js";

export function serverUtilsContent(mode: ProjectMode): string {
  // Emitted at packages/analytics/src/server/utils.ts (monorepo) but at
  // src/server/analytics/utils.ts (single) — one directory shallower, so the
  // types module is a sibling there rather than a parent.
  const typesImport = mode === "monorepo" ? "../types.js" : "./types.js";
  return `import { createHash } from "node:crypto";
import type { AnalyticsContext } from "${typesImport}";

export function anonymize(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function anonymizeEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return anonymize(email);
  const hashedLocal = createHash("sha256").update(local.toLowerCase()).digest("hex").slice(0, 8);
  return \`\${hashedLocal}@\${domain.toLowerCase()}\`;
}

export function buildServerContext(req?: Request): AnalyticsContext {
  const ctx: AnalyticsContext = {};
  if (!req) return ctx;
  try {
    const url = new URL(req.url);
    ctx.url = req.url;
    ctx.pathname = url.pathname;
    const utm: AnalyticsContext["utm"] = {};
    const source = url.searchParams.get("utm_source");
    const medium = url.searchParams.get("utm_medium");
    const campaign = url.searchParams.get("utm_campaign");
    const term = url.searchParams.get("utm_term");
    const content = url.searchParams.get("utm_content");
    if (source) utm.source = source;
    if (medium) utm.medium = medium;
    if (campaign) utm.campaign = campaign;
    if (term) utm.term = term;
    if (content) utm.content = content;
    if (Object.keys(utm).length > 0) ctx.utm = utm;
  } catch {}
  try {
    const ua = req.headers.get("user-agent");
    if (ua) ctx.userAgent = ua;
  } catch {}
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? undefined;
    if (ip) ctx.ip = ip;
  } catch {}
  try {
    const referer = req.headers.get("referer") ?? req.headers.get("referrer");
    if (referer) ctx.referrer = referer;
  } catch {}
  return ctx;
}

export function buildContext(req?: Request): AnalyticsContext {
  return buildServerContext(req);
}

export function extractDistinctId(opts: {
  userId?: string | null;
  anonymousId?: string | null;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined } | Map<string, string>;
}): string {
  if (opts.userId) return opts.userId;
  if (opts.anonymousId) return opts.anonymousId;
  try {
    // Intersecting a getter signature with Map made \`.get\` a union of two
    // incompatible call signatures, so TS refused to call it (TS2349). Narrow the
    // Map case first, then treat anything else as a cookies()-style accessor.
    const cookieStore = opts.cookies as unknown as string;
    if (cookieStore) {
      if (cookieStore instanceof Map) {
        const m = cookieStore as Map<string, string>;
        const v = m.get("posthog_distinct_id") ?? m.get("distinct_id");
        if (v) return v;
      } else if (typeof (cookieStore as { get?: unknown }).get === "function") {
        const store = cookieStore as { get: (name: string) => { value?: string } | undefined };
        const v = store.get("posthog_distinct_id")?.value ?? store.get("distinct_id")?.value;
        if (v) return v;
      }
    }
  } catch {}
  try {
    const h = opts.headers;
    if (h) {
      const v = h.get("x-distinct-id") ?? h.get("x-anonymous-id");
      if (v) return v;
    }
  } catch {}
  return anonymize(\`anon_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`);
}

export function getClientIp(req: Request): string | undefined {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim();
    return req.headers.get("x-real-ip") ?? req.headers.get("cf-connecting-ip") ?? undefined;
  } catch {
    return undefined;
  }
}

export function maskPII<T extends Record<string, unknown>>(props: T): T {
  const masked = { ...props };
  const piiKeys = ["email", "phone", "ssn", "password", "credit_card", "ip"];
  for (const key of Object.keys(masked)) {
    if (piiKeys.some((pii) => key.toLowerCase().includes(pii))) {
      const v = masked[key];
      if (typeof v === "string") (masked as Record<string, unknown>)[key] = "***";
    }
  }
  return masked;
}
`;
}
