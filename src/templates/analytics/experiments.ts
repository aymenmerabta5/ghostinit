import type { ProjectMode } from "../../lib/addons.js";

export function clientComponentsContent(mode: ProjectMode): string {
  const hooksImport = mode === "monorepo" ? "./hooks.js" : "./posthog-provider.js";
  const consentImport = "../shared/consent.js";
  return `"use client";

import React, { useEffect, useState } from "react";
import {
  useFeatureFlag,
  useExperiment,
  usePostHog,
  useActiveFeatureFlags,
} from "${hooksImport}";
import type { FeatureFlagKey, ExperimentKey } from "../types.js";
import { optIn, optOut } from "${consentImport}";

export interface FeatureFlagGateProps {
  flag: FeatureFlagKey;
  match?: string | boolean | Array<string | boolean>;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export function FeatureFlagGate({
  flag,
  match = true,
  fallback = null,
  children,
  loadingFallback = null,
}: FeatureFlagGateProps) {
  const value = useFeatureFlag(flag);

  if (value === undefined) {
    return <>{loadingFallback}</>;
  }

  const matches = Array.isArray(match) ? match : [match];
  const doesMatch = matches.some((m) => m === value || (m === true && value !== false && value !== undefined));

  if (!doesMatch) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export interface ExperimentGateProps {
  experiment: ExperimentKey;
  variant?: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode | ((variant: string) => React.ReactNode);
  loadingFallback?: React.ReactNode;
}

export function ExperimentGate({
  experiment,
  variant,
  fallback = null,
  children,
  loadingFallback = null,
}: ExperimentGateProps) {
  const { variant: activeVariant, isLoading, isEnrolled } = useExperiment(experiment);

  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  if (!isEnrolled || !activeVariant) {
    return <>{fallback}</>;
  }

  if (variant) {
    const allowed = Array.isArray(variant) ? variant : [variant];
    if (!allowed.includes(activeVariant)) {
      return <>{fallback}</>;
    }
  }

  if (typeof children === "function") {
    return <>{(children as (v: string) => React.ReactNode)(activeVariant)}</>;
  }

  return <>{children}</>;
}

export function PostHogToolbar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("__posthog_toolbar") || localStorage.getItem("ph_toolbar") === "1") {
        setShow(true);
      }
    } catch {}
  }, []);

  if (!show) return null;
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] rounded-lg bg-primary px-2.5 py-1.5 font-mono text-[11px] text-primary-foreground shadow-lg">
      PostHog Debug —{" "}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          try {
            const c = (window as unknown as { posthog?: { debug?: (v: boolean) => void; getFeatureFlags?: () => Record<string, string | boolean>; opt_in_capturing?: () => void; opt_out_capturing?: () => void; get_distinct_id?: () => string } }).posthog;
            c?.debug?.(true);
            // [analytics] flags logged via debug only in dev - avoid console.log in prod
          } catch {}
        }}
        className="text-primary-foreground underline underline-offset-2 hover:opacity-80"
      >
        debug
      </a>
    </div>
  );
}

export interface ConsentBannerProps {
  onAccept?: () => void;
  onDecline?: () => void;
  title?: string;
  description?: string;
}

export function ConsentBanner({
  onAccept,
  onDecline,
  title = "We use cookies for analytics",
  description = "We use PostHog to improve your experience. You can opt-out of analytics tracking.",
}: ConsentBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ghostinit:consent");
      if (!raw) setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[10000] flex items-center justify-between gap-3 border-t border-border bg-background p-4 shadow-lg">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            try {
              optIn(["analytics"]);
            } catch {
              try {
                localStorage.setItem(
                  "ghostinit:consent",
                  JSON.stringify({
                    status: "granted",
                    categories: { necessary: true, analytics: true, marketing: false, preferences: false },
                    version: 1,
                    timestamp: new Date().toISOString(),
                  }),
                );
                (window as unknown as { posthog?: { opt_in_capturing?: () => void } }).posthog?.opt_in_capturing?.();
              } catch {}
            }
            setVisible(false);
            onAccept?.();
          }}
          className="cursor-pointer rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Accept
        </button>
        <button
          onClick={() => {
            try {
              optOut(["analytics", "marketing"]);
            } catch {
              try {
                localStorage.setItem(
                  "ghostinit:consent",
                  JSON.stringify({
                    status: "denied",
                    categories: { necessary: true, analytics: false, marketing: false, preferences: false },
                    version: 1,
                    timestamp: new Date().toISOString(),
                  }),
                );
                (window as unknown as { posthog?: { opt_out_capturing?: () => void } }).posthog?.opt_out_capturing?.();
              } catch {}
            }
            setVisible(false);
            onDecline?.();
          }}
          className="cursor-pointer rounded-lg bg-muted px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export function FeatureFlagsDebug() {
  const flags = useActiveFeatureFlags();
  const posthog = usePostHog();

  if (process.env.NODE_ENV === "production") return null;

  return (
    <pre className="max-h-[200px] overflow-auto rounded-lg border border-border bg-muted p-2 font-mono text-[11px] text-foreground">
      {JSON.stringify({ flags, distinctId: (posthog as unknown as { get_distinct_id?: () => string })?.get_distinct_id?.() }, null, 2)}
    </pre>
  );
}
`;
}
