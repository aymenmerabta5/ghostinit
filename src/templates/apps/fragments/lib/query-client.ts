import { file, type TemplateFile } from "../../../shared.js";
import { queryAuthRegressionFile } from "../query-auth-tests.js";
import { authOwnedEffectFile } from "../auth-owned-effect.js";

import { queryAuthStateContent } from "./query-auth-state.js";
export { queryAuthStateContent } from "./query-auth-state.js";

export function queryClientContent(): string {
  return `import { QueryClient } from "@tanstack/react-query";

export interface ResolvedRpcError {
  applicationCode: string;
  transportCode: string;
  status: number;
  message: string;
  meta?: Record<string, unknown>;
}

${queryAuthStateContent()}

interface RpcErrorShape {
  code: string;
  status: number;
  message: string;
  data?: unknown;
}

function readRpcError(value: unknown): RpcErrorShape | undefined {
  if (!isRecord(value)) return undefined;
  const code = value.code;
  const status = value.status;
  const message = value.message;
  if (typeof code !== "string" || typeof status !== "number" || typeof message !== "string") {
    return undefined;
  }
  return { code, status, message, data: value.data };
}

function findRpcError(error: unknown): RpcErrorShape | undefined {
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const rpcError = readRpcError(current);
    if (rpcError) return rpcError;
    if (current instanceof Error && current.cause !== undefined) {
      current = current.cause;
      continue;
    }
    return undefined;
  }
  return undefined;
}

export function resolveRpcError(error: unknown): ResolvedRpcError | undefined {
  const rpcError = findRpcError(error);
  if (!rpcError) return undefined;
  const data = isRecord(rpcError.data) ? rpcError.data : undefined;
  const applicationCode = typeof data?.code === "string" ? data.code : rpcError.code;
  const meta = isRecord(data?.meta) ? data.meta : undefined;
  return {
    applicationCode,
    transportCode: rpcError.code,
    status: rpcError.status,
    message: rpcError.message,
    ...(meta ? { meta } : {}),
  };
}

export function hasRpcErrorCode(error: unknown, ...codes: readonly string[]): boolean {
  const rpcError = resolveRpcError(error);
  return (
    rpcError !== undefined &&
    (codes.includes(rpcError.applicationCode) || codes.includes(rpcError.transportCode))
  );
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const rpcError = resolveRpcError(error);
  if (!rpcError) return true;
  return rpcError.status === 408 || rpcError.status === 429 || rpcError.status >= 500;
}

export function makeQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 30_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
  queryAuthScopes.set(queryClient, null);
  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
`;
}

export function queryClientLibFiles(base = "apps/web/src"): TemplateFile[] {
  return [
    file(`${base}/lib/query-client.ts`, queryClientContent()),
    authOwnedEffectFile(base),
    queryAuthRegressionFile(base === "src" ? "" : base.replace(/\/src$/, "")),
  ];
}
