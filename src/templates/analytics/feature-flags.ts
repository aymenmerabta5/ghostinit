import type { ProjectMode } from "../../lib/addons.js";

export function serverBootstrapContent(mode: ProjectMode): string {
  const serverImport = mode === "monorepo" ? "./posthog-server.js" : "./posthog-server.js";
  return `/**
 * Server-side bootstrap for PostHog feature flags.
 */

import { getAllFlags, getFeatureFlagPayload, getPostHogServer } from "${serverImport}";

export interface BootstrapPayload {
  distinctId: string;
  flags: Record<string, string | boolean>;
  payloads: Record<string, unknown>;
}

export async function getBootstrapFeatureFlags(
  distinctId: string,
  options?: {
    groups?: Record<string, string>;
    personProperties?: Record<string, string>;
    evaluatePayloads?: string[];
  },
): Promise<BootstrapPayload> {
  const client = getPostHogServer();
  if (!client) {
    return { distinctId, flags: {}, payloads: {} };
  }

  try {
    const flags = await getAllFlags(distinctId, {
      groups: options?.groups,
      personProperties: options?.personProperties,
    });

    const payloads: Record<string, unknown> = {};
    const toEvaluate = options?.evaluatePayloads ?? Object.keys(flags);

    await Promise.all(
      toEvaluate.map(async (key) => {
        try {
          const p = await getFeatureFlagPayload(key, distinctId, {
            groups: options?.groups,
            personProperties: options?.personProperties,
          });
          if (p !== undefined) payloads[key] = p;
        } catch {}
      }),
    );

    return { distinctId, flags, payloads };
  } catch (err) {
    console.warn("[analytics:bootstrap] getBootstrapFeatureFlags failed", err);
    return { distinctId, flags: {}, payloads: {} };
  }
}

export async function getBootstrapForUser(
  distinctId: string,
  groups?: Record<string, string>,
): Promise<BootstrapPayload> {
  return getBootstrapFeatureFlags(distinctId, { groups });
}

export async function getBootstrapForAnonymous(): Promise<BootstrapPayload> {
  const anonId = \`anon_\${Date.now()}_\${Math.random().toString(36).slice(2, 10)}\`;
  return getBootstrapFeatureFlags(anonId);
}
`;
}

export function singleFeatureFlagGateContent(): string {
  return `"use client";

import React from "react";
import { useFeatureFlag, useExperiment } from "./posthog-provider.js";
import type { FeatureFlagKey, ExperimentKey } from "../../server/analytics/types.js";

export interface FeatureFlagGateProps {
  flag: FeatureFlagKey;
  match?: string | boolean | Array<string | boolean>;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export function FeatureFlagGate({ flag, match = true, fallback = null, children, loadingFallback = null }: FeatureFlagGateProps) {
  const value = useFeatureFlag(flag);
  if (value === undefined) return <>{loadingFallback}</>;
  const matches = Array.isArray(match) ? match : [match];
  const doesMatch = matches.some((m) => m === value || (m === true && value !== false && value !== undefined));
  if (!doesMatch) return <>{fallback}</>;
  return <>{children}</>;
}

export interface ExperimentGateProps {
  experiment: ExperimentKey;
  variant?: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode | ((v: string) => React.ReactNode);
  loadingFallback?: React.ReactNode;
}

export function ExperimentGate({ experiment, variant, fallback = null, children, loadingFallback = null }: ExperimentGateProps) {
  const { variant: activeVariant, isLoading } = useExperiment(experiment);
  if (isLoading) return <>{loadingFallback}</>;
  if (!activeVariant) return <>{fallback}</>;
  if (variant) {
    const allowed = Array.isArray(variant) ? variant : [variant];
    if (!allowed.includes(activeVariant)) return <>{fallback}</>;
  }
  if (typeof children === "function") return <>{(children as (v: string) => React.ReactNode)(activeVariant)}</>;
  return <>{children}</>;
}

export function PostHogToolbar() {
  if (process.env.NODE_ENV === "production") return null;
  return null;
}
`;
}
