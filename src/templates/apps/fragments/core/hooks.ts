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
  const [error, setError] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to copy");
      toast.error("Failed to copy");
      return false;
    }
  }, []);

  return { copy, copied, error };
}
`;
}

export function useBillingHookContent(): string {
  return `"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/orpc.js";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function toBillingSubscription(value: unknown): BillingSubscription | undefined {
  if (!isRecord(value)) return undefined;
  const { id, provider, status } = value;
  if (typeof id !== "string" || typeof provider !== "string" || typeof status !== "string") {
    return undefined;
  }
  return {
    id,
    provider,
    status,
    currentPeriodEnd: optionalString(value.currentPeriodEnd),
    priceId: optionalString(value.priceId),
    customerId: optionalString(value.customerId),
  };
}

export function useBilling(): UseBillingReturn {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.billing.subscriptions.queryOptions({
      select: (data) =>
        data.subscriptions.flatMap((value) => {
          const subscription = toBillingSubscription(value);
          return subscription ? [subscription] : [];
        }),
    }),
  );

  const refresh = React.useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: orpc.billing.subscriptions.key({ type: "query" }),
    });
  }, [queryClient]);

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
  const [error, setError] = React.useState<string | null>(null)
  const timeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    setError(null)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard')
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to copy')
      toast.error('Failed to copy')
      return false
    }
  }, [])

  return { copy, copied, error }
}
`;
}

export function tanstackUseBillingHookContent(): string {
  return useBillingHookContent()
    .replace(
      'import { orpc } from "../lib/orpc.js";',
      `import { orpc } from "../lib/orpc.js";
import { authScopedQueryKey, currentQueryAuthScope } from "../lib/query-client.js";`,
    )
    .replace(
      /  const query = useQuery\([\s\S]*?\n  \);\n\n  const refresh/,
      `  const scope = currentQueryAuthScope(queryClient);
  const options = orpc.billing.subscriptions.queryOptions({
    select: (data) =>
      data.subscriptions.flatMap((value) => {
        const subscription = toBillingSubscription(value);
        return subscription ? [subscription] : [];
      }),
  });
  const query = useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "billing-subscriptions"],
    enabled: Boolean(scope) && typeof window !== "undefined",
  });

  const refresh`,
    )
    .replace(
      `    await queryClient.invalidateQueries({
      queryKey: orpc.billing.subscriptions.key({ type: "query" }),
    });`,
      `    if (!scope) return;
    await queryClient.invalidateQueries({
      queryKey: authScopedQueryKey(
        scope,
        orpc.billing.subscriptions.key({ type: "query" }),
      ),
    });`,
    )
    .replace("  }, [queryClient]);", "  }, [queryClient, scope]);");
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
