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
  const contextImport = mode === "monorepo" ? "./context.js" : "./posthog-context.js";
  const binding = routerBinding(framework);
  return `"use client";

import { useEffect, useRef } from "react";
${binding.imports}
import { usePostHogContext } from "${contextImport}";

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
    const consent: unknown = Reflect.get(window, "__GHOSTINIT_CONSENT__");
    if (consent === false) return false;
    return true;
  } catch {
    return false;
  }
}

export function PostHogPageView() {
  usePostHogPageViewTracker();
  return null;
}

export default PostHogPageView;

export function usePostHogPageViewTracker(enabled = true) {
  const { pathname, search } = useRouteLocation();
  const { client, isLoaded, isEnabled } = usePostHogContext();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !isEnabled || !isLoaded || !client) return;
    if (!canCapture()) return;
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
  }, [client, isEnabled, isLoaded, pathname, search, enabled]);
}
`;
}

export function singlePageViewContent(framework: PageViewFramework = "nextjs"): string {
  return clientPageViewContent("single", framework);
}
