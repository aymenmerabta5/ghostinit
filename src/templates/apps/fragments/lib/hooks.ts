import { file, type TemplateFile } from "../../../shared.js";

// Generic hooks — scaffolder starter, not domain copy. No Stagio skill/pipeline logic.
export function hooksLibFiles(base = "apps/web/src"): TemplateFile[] {
  const debounce = `import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
`;

  const infinite = `import { useCallback, useRef } from "react";

export function useInfiniteScroll(onIntersect: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !enabled) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onIntersect();
        },
        { threshold: 0.1 },
      );
      observerRef.current.observe(node);
      ref.current = node;
    },
    [onIntersect, enabled],
  );

  return setRef;
}
`;

  const groupBy = `import { useMemo } from "react";

export function useGroupBy<T extends Record<string, unknown>>(items: T[], getKey: (item: T) => string, order?: string[]) {
  return useMemo(() => {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
      const key = getKey(item) || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const keys = Object.keys(groups);
    const sortedKeys = order ? [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))] : keys.sort();
    return { groups, order: sortedKeys };
  }, [items, getKey, order]);
}
`;

  const logout = `"use client";
import { useCallback, useState } from "react";

export function useLogout() {
  const [loading, setLoading] = useState(false);
  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      // Works for Next.js (next/navigation) and TanStack Start (window) — avoid framework-specific router import.
      window.location.href = "/sign-in";
    } finally {
      setLoading(false);
    }
  }, []);
  return { logout, loading };
}
`;

  const files: TemplateFile[] = [
    file(`${base}/hooks/use-debounce.ts`, debounce),
    file(`${base}/hooks/use-infinite-scroll.ts`, infinite),
    file(`${base}/hooks/use-group-by.ts`, groupBy),
    file(`${base}/hooks/use-logout.ts`, logout),
    file(
      `${base}/components/skeletons.tsx`,
      `"use client";
import { Skeleton } from "@/components/ui/skeleton";
export function PageSkeleton() { return <div className="space-y-4 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-24 w-full" /></div>; }
export function CardSkeleton() { return <Skeleton className="h-40 w-full" />; }
export function ListSkeleton({ count = 3 }: { count?: number }) { return <div className="space-y-3">{Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>; }
`,
    ),
  ];

  // Tanstack variant for use-logout (duplicate path but conditional — include both and dedupe by filter)
  // We emit the next version as default; tanstack router will override via its own composer if needed.
  // For safety, also emit tanstack alternative under same path but it will be deduped — so we keep next as primary.
  return files;
}
