import type { ProjectMode } from "../../lib/addons.js";

export function sharedPropertiesContent(_mode: ProjectMode): string {
  return `import type { AnalyticsContext, EventProperties } from "../types.js";

const SENSITIVE_PARAMS = [
  "token",
  "access_token",
  "reset_token",
  "invite",
  "invitation",
  "email",
  "code",
  "state",
  "auth",
  "password",
  "secret",
  "key",
];

function getSanitizedUrl(raw: string): string {
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    for (const key of SENSITIVE_PARAMS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export function getBrowserProperties(): EventProperties {
  if (typeof window === "undefined") return {};
  return {
    $screen_width: window.screen?.width,
    $screen_height: window.screen?.height,
    $viewport_width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
    $viewport_height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0),
    $current_url: getSanitizedUrl(window.location.href),
    $pathname: window.location.pathname,
    $host: window.location.host,
    $referrer: document.referrer || undefined,
    $referring_domain: document.referrer ? safeGetDomain(document.referrer) : undefined,
  };
}

function safeGetDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function getUtmProperties(search?: string): EventProperties {
  if (typeof window === "undefined" && !search) return {};
  const qs = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const params = new URLSearchParams(qs);
  const utm: EventProperties = {};
  const map: Record<string, string> = {
    utm_source: "$utm_source",
    utm_medium: "$utm_medium",
    utm_campaign: "$utm_campaign",
    utm_term: "$utm_term",
    utm_content: "$utm_content",
    gclid: "$gclid",
    fbclid: "$fbclid",
    msclkid: "$msclkid",
  };
  for (const [key, prop] of Object.entries(map)) {
    const v = params.get(key);
    if (v) utm[prop] = v;
  }
  return utm;
}

export function buildEventProperties(
  base?: EventProperties,
  ctx?: AnalyticsContext,
): EventProperties {
  return {
    ...getBrowserProperties(),
    ...getUtmProperties(ctx?.url ? new URL(ctx.url).search : undefined),
    ...base,
    ...(ctx?.locale ? { $locale: ctx.locale } : {}),
  };
}

export function buildSuperProperties(appVersion?: string): EventProperties {
  return {
    $lib: "posthog-js",
    ...(appVersion ? { app_version: appVersion, $app_version: appVersion } : {}),
    $lib_version: "custom",
  };
}

export const DefaultSuperProps = {
  env: typeof process !== "undefined" ? process.env.NODE_ENV : "production",
} as const;
`;
}
