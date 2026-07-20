import type { ProjectMode } from "../../lib/addons.js";

export function clientPageViewContent(mode: ProjectMode): string {
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  return `"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogClient } from "${clientImport}";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    if (!canCapture()) return;
    const client = getPostHogClient();
    if (!client) return;
    const search = searchParams?.toString();
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
  }, [pathname, searchParams]);

  return null;
}

export default PostHogPageView;

export function usePostHogPageViewTracker(enabled = true) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled) return;
    if (!canCapture()) return;
    const client = getPostHogClient();
    if (!client) return;
    try {
      const search = searchParams?.toString();
      const fullUrl = typeof window !== "undefined" ? window.location.href : pathname + (search ? "?" + search : "");
      const sanitizedUrl = getSanitizedUrl(fullUrl);
      client.capture("$pageview", {
        $current_url: sanitizedUrl,
        $pathname: pathname,
        $host: typeof window !== "undefined" ? window.location.host : undefined,
      });
    } catch {}
  }, [pathname, searchParams, enabled]);
}
`;
}

export function singlePageViewContent(): string {
  return `"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogClient } from "../../lib/analytics.js";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastRef = useRef("");

  useEffect(() => {
    const client = getPostHogClient();
    if (!client) return;
    const search = searchParams?.toString();
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
  }, [pathname, searchParams]);

  return null;
}

export default PostHogPageView;
`;
}
