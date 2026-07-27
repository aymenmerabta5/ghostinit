import type { ProjectMode } from "../../lib/addons.js";

export type PageViewFramework = "nextjs" | "tanstack-start";

/**
 * Router binding for the pageview tracker.
 *
 * The component only needs a pathname and a search string. Emitting the Next.js
 * hooks unconditionally put a hard `next/navigation` import inside
 * `packages/analytics` — a package that TanStack Start projects also consume but
 * which never depends on next. Isolating the binding keeps one implementation.
 */
function routerBinding(framework: PageViewFramework): { imports: string; hook: string } {
  if (framework === "tanstack-start") {
    return {
      imports: `import { useLocation } from "@tanstack/react-router";`,
      hook: `function useRouteLocation(): { pathname: string; search: string } {
  const location = useLocation();
  return {
    pathname: location.pathname ?? "",
    search: (location.searchStr ?? "").replace(/^\\?/, ""),
  };
}`,
    };
  }
  return {
    imports: `import { usePathname, useSearchParams } from "next/navigation";`,
    hook: `function useRouteLocation(): { pathname: string; search: string } {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return { pathname: pathname ?? "", search: searchParams?.toString() ?? "" };
}`,
  };
}

export function clientPageViewContent(
  mode: ProjectMode,
  framework: PageViewFramework = "nextjs",
): string {
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  const binding = routerBinding(framework);
  return `"use client";

import { useEffect, useRef } from "react";
${binding.imports}
import { getPostHogClient } from "${clientImport}";

${binding.hook}

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
    for (const k of SENSITIVE_PARAMS) {
      url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function canCapture(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { __GHOSTINIT_CONSENT__?: boolean };
    if (w.__GHOSTINIT_CONSENT__ === false) return false;
    return true;
  } catch {
    return false;
  }
}

export function PostHogPageView() {
  const { pathname, search } = useRouteLocation();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (!canCapture()) return;
    const client = getPostHogClient();
    if (!client) return;
    const url = pathname + (search ? "?" + search : "");
    const fullUrl = typeof window !== "undefined" ? window.location.href : url;
    const sanitizedUrl = getSanitizedUrl(fullUrl);

    if (lastPathRef.current === sanitizedUrl) return;
    lastPathRef.current = sanitizedUrl;

    try {
      client.capture("$pageview", {
        $current_url: sanitizedUrl,
        $pathname: pathname,
        $host: typeof window !== "undefined" ? window.location.host : undefined,
      });
    } catch (err) {
      console.debug("[analytics] $pageview capture failed", err);
    }
  }, [pathname, search]);

  return null;
}

export default PostHogPageView;

export function usePostHogPageViewTracker(enabled = true) {
  const { pathname, search } = useRouteLocation();

  useEffect(() => {
    if (!enabled) return;
    if (!canCapture()) return;
    const client = getPostHogClient();
    if (!client) return;
    try {
      const fullUrl = typeof window !== "undefined" ? window.location.href : pathname + (search ? "?" + search : "");
      const sanitizedUrl = getSanitizedUrl(fullUrl);
      client.capture("$pageview", {
        $current_url: sanitizedUrl,
        $pathname: pathname,
        $host: typeof window !== "undefined" ? window.location.host : undefined,
      });
    } catch {}
  }, [pathname, search, enabled]);
}
`;
}

export function singlePageViewContent(framework: PageViewFramework = "nextjs"): string {
  const binding = routerBinding(framework);
  return `"use client";

import { useEffect, useRef } from "react";
${binding.imports}
import { getPostHogClient } from "../../lib/analytics.js";

${binding.hook}

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
    for (const k of SENSITIVE_PARAMS) {
      url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export function PostHogPageView() {
  const { pathname, search } = useRouteLocation();
  const lastRef = useRef("");

  useEffect(() => {
    const client = getPostHogClient();
    if (!client) return;
    const url = pathname + (search ? "?" + search : "");
    const fullUrl = typeof window !== "undefined" ? window.location.href : url;
    const sanitizedUrl = getSanitizedUrl(fullUrl);
    if (lastRef.current === sanitizedUrl) return;
    lastRef.current = sanitizedUrl;
    try {
      client.capture("$pageview", {
        $current_url: sanitizedUrl,
        $pathname: pathname,
        $host: typeof window !== "undefined" ? window.location.host : undefined,
      });
    } catch {}
  }, [pathname, search]);

  return null;
}

export default PostHogPageView;
`;
}
