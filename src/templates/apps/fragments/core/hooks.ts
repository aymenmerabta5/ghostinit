/**
 * Core fragments – client hooks (copy, billing, auth) Next + TanStack variants
 */

export function useCopyHookContent(): string {
  return `"use client";

import * as React from "react";
import { toast } from "sonner";
import type { UseCopyReturn } from "@repo/kernel";

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      toast.error("Failed to copy");
      return false;
    }
  }, []);

  return { copy, copied };
}
`;
}

export function useBillingHookContent(): string {
  return `"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.js";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";

// oRPC contract-first — L2 Transport via @repo/api (no fetch fallback)
async function fetchSubscriptions(): Promise<BillingSubscription[]> {
  const data = await (orpc as unknown as { billing: { subscriptions: () => Promise<unknown> } }).billing.subscriptions();
  if (data && typeof data === "object" && "subscriptions" in (data as Record<string, unknown>)) {
    const subs = (data as { subscriptions?: BillingSubscription[] }).subscriptions;
    if (Array.isArray(subs)) return subs;
  }
  if (Array.isArray(data)) return data as BillingSubscription[];
  return [];
}

export function useBilling(): UseBillingReturn {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["billing", "subscriptions"] as const,
    queryFn: fetchSubscriptions,
    staleTime: 1000 * 30,
    retry: 1,
  });

  const refresh = React.useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["billing", "subscriptions"] });
    await query.refetch();
  }, [queryClient, query]);

  const hasActiveSubscription = React.useMemo(() => {
    const list = query.data ?? [];
    return list.some((s) => s.status === "active" || s.status === "trialing");
  }, [query.data]);

  return {
    subscriptions: query.data ?? [],
    loading: query.isPending,
    error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    refresh,
    hasActiveSubscription,
    isLoading: query.isPending,
  };
}
`;
}

export function useAuthHookContent(): string {
  return `"use client";

import { authClient } from "../lib/auth-client.js";

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession();

  return {
    session: session ?? null,
    user: session?.user ?? null,
    isPending,
    isAuthenticated: !!session?.user,
    isPendingAuth: isPending,
    error: error ?? null,
    refetch,
  };
}
`;
}

export function tanstackUseCopyHookContent(): string {
  return `"use client"

import * as React from 'react'
import { toast } from 'sonner'
import type { UseCopyReturn } from '@repo/kernel'

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      toast.error('Failed to copy')
      return false
    }
  }, [])

  return { copy, copied }
}
`;
}

export function tanstackUseBillingHookContent(): string {
  return `"use client"

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { orpc } from '../lib/orpc.js'
import type { BillingSubscription, UseBillingReturn } from '@repo/kernel'

// oRPC contract-first — L2 Transport via @repo/api (no fetch fallback)
async function fetchSubscriptions(): Promise<BillingSubscription[]> {
  const data = await (orpc as unknown as { billing: { subscriptions: () => Promise<unknown> } }).billing.subscriptions()
  if (data && typeof data === 'object' && 'subscriptions' in (data as Record<string, unknown>)) {
    const subs = (data as { subscriptions?: BillingSubscription[] }).subscriptions
    if (Array.isArray(subs)) return subs
  }
  if (Array.isArray(data)) return data as BillingSubscription[]
  return []
}

export function useBilling(): UseBillingReturn {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['billing', 'subscriptions'] as const,
    queryFn: fetchSubscriptions,
    staleTime: 1000 * 30,
    retry: 1,
  })

  const refresh = React.useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['billing', 'subscriptions'] })
    await query.refetch()
  }, [queryClient, query])

  const hasActiveSubscription = React.useMemo(() => {
    const list = query.data ?? []
    return list.some((s) => s.status === 'active' || s.status === 'trialing')
  }, [query.data])

  return { subscriptions: query.data ?? [], loading: query.isPending, error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null, refresh, hasActiveSubscription, isLoading: query.isPending }
}
`;
}

export function tanstackUseAuthHookContent(): string {
  return `"use client"

import { authClient } from '../lib/auth-client.js'

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession()

  return {
    session: session ?? null,
    user: session?.user ?? null,
    isPending,
    isAuthenticated: !!session?.user,
    isPendingAuth: isPending,
    error: error ?? null,
    refetch,
  }
}
`;
}
