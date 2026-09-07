import type { ProjectMode } from "../../lib/addons.js";

export function clientComponentsContent(mode: ProjectMode): string {
  const hooksImport = mode === "monorepo" ? "./hooks.js" : "./posthog-provider.js";
  const consentImport = "../shared/consent.js";
  return `"use client";

import React, { useEffect, useState } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
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
  const posthog = usePostHog();
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
    <BaseButton
      type="button"
      onClick={() => {
        try {
          posthog?.debug(true);
          // [analytics] flags logged via debug only in dev - avoid console.log in prod
        } catch {}
      }}
      className="fixed bottom-3 end-3 rounded-md bg-primary px-3 py-2 font-mono text-xs text-primary-foreground shadow-lg"
    >
      PostHog Debug
    </BaseButton>
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
  const posthog = usePostHog();

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
    <aside aria-label="Analytics consent" className="fixed inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background p-4 shadow-lg">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>
      </div>
      <div className="flex gap-2">
        <BaseButton
          type="button"
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
                posthog?.opt_in_capturing();
              } catch {}
            }
            setVisible(false);
            onAccept?.();
          }}
          className="cursor-pointer rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Accept
        </BaseButton>
        <BaseButton
          type="button"
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
                posthog?.opt_out_capturing();
              } catch {}
            }
            setVisible(false);
            onDecline?.();
          }}
          className="cursor-pointer rounded-lg bg-muted px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Decline
        </BaseButton>
      </div>
    </aside>
  );
}

export function FeatureFlagsDebug() {
  const flags = useActiveFeatureFlags();
  const posthog = usePostHog();

  if (process.env.NODE_ENV === "production") return null;

  return (
    <pre className="max-h-[200px] overflow-auto rounded-lg border border-border bg-muted p-2 font-mono text-[11px] text-foreground">
      {JSON.stringify({ flags, distinctId: posthog?.get_distinct_id() }, null, 2)}
    </pre>
  );
}
`;
}
