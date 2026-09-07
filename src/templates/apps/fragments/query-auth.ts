import { file, type TemplateFile } from "../../shared.js";
import { canonicalQueryAuthHookContent } from "./query-auth-hook.js";

export { canonicalQueryAuthHookContent } from "./query-auth-hook.js";

interface QueryAuthBoundaryOptions {
  hasApi?: boolean;
  rpcImport?: string;
  hookImport?: string;
  translationsImport?: string;
  nativeTranslations?: boolean;
}

export function queryAuthCacheBoundaryContent(
  authImport = "@/lib/auth-client",
  queryImport = "@/lib/query-client",
  options: QueryAuthBoundaryOptions = {},
): string {
  const hasApi = options.hasApi !== false;
  const translations = options.translationsImport ?? "@/lib/translations";
  const translationImport = translations
    ? `import { ${options.nativeTranslations ? "useTranslations as useMessages" : "useSurfaceTranslations as useMessages"} } from "${translations}";`
    : "";
  const messages = translations
    ? `const common = useMessages("common"); const errors = useMessages("errors");`
    : `const common = (key: "loading" | "retry") => ({ loading: "Loading...", retry: "Retry" })[key];
  const errors = (key: "genericTitle" | "genericDescription") => ({ genericTitle: "Something went wrong", genericDescription: "An unexpected error occurred. You can try again." })[key];`;
  const stateImports = hasApi
    ? "currentQueryAuthGeneration, type QueryAuthScope"
    : "currentQueryAuthGeneration, observeQueryAuthIdentity, queryAuthIdentityFromSession, queryAuthIdentitySignature, type QueryAuthScope";
  return `"use client";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "${authImport}";
import { ${stateImports} } from "${queryImport}";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
${translationImport}
${
  hasApi
    ? `import { orpcClient } from "${options.rpcImport ?? "@/lib/orpc"}";
import { useCanonicalQueryAuthScope } from "${options.hookImport ?? "@/lib/query-auth-scope"}";
const readCurrentRequest = () => orpcClient.me();`
    : ""
}

interface QueryAuthSession {
  scope: QueryAuthScope | null;
  currentRequest: { user: { id: string; email: string; name: string | null; role: string | null } | null } | null;
  isPending: boolean;
  error: Error | null;
  retry(): void;
  hasCanonicalApi: boolean;
}

const QueryAuthContext = React.createContext<QueryAuthSession | null>(null);
export function useQueryAuthSession(): QueryAuthSession | null { return React.useContext(QueryAuthContext); }
const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function QueryAuthStatus({ error = false, retry }: { error?: boolean; retry?(): void }): React.JSX.Element {
  ${messages}
  return <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6" aria-busy={!error}>
    {error ? <Alert variant="destructive" role="alert"><AlertTitle>{errors("genericTitle")}</AlertTitle><AlertDescription>{errors("genericDescription")}</AlertDescription></Alert> : <>
      <p role="status" className="text-sm text-muted-foreground">{common("loading")}</p>
      <div aria-hidden="true" className="flex flex-col gap-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
    </>}
    {retry ? <Button className="self-start" type="button" variant="outline" onClick={retry}>{common("retry")}</Button> : null}
  </section>;
}

export function QueryAuthCacheBoundary({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }): React.JSX.Element {
  const session = authClient.useSession();
  const hydrated = React.useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  ${
    hasApi
      ? `const canonical = useCanonicalQueryAuthScope(queryClient, session.data, session.isPending, readCurrentRequest);
  const state: QueryAuthSession = { ...canonical, hasCanonicalApi: true };`
      : `const identity = queryAuthIdentityFromSession(session.data);
  const signature = queryAuthIdentitySignature(identity);
  const [applied, setApplied] = React.useState<string | null>(null);
  React.useLayoutEffect(() => {
    if (session.isPending) return;
    observeQueryAuthIdentity(queryClient, identity);
    setApplied(signature);
  }, [queryClient, signature, session.isPending]);
  const state: QueryAuthSession = { scope: null, currentRequest: null, isPending: session.isPending || applied !== signature, error: session.error ? new Error("Session lookup failed") : null, retry: () => { void session.refetch(); }, hasCanonicalApi: false };`
  }
  const generation = currentQueryAuthGeneration(queryClient);
  return <QueryAuthContext.Provider value={state}>
    {hydrated && (state.isPending || state.error) ? <QueryAuthStatus error={Boolean(state.error)} retry={state.retry} /> : <React.Fragment key={generation}>{children}</React.Fragment>}
  </QueryAuthContext.Provider>;
}
`;
}

export function queryAuthBoundaryFile(base = "apps/web/src", hasApi = true): TemplateFile {
  return file(
    `${base}/components/query-auth-boundary.tsx`,
    queryAuthCacheBoundaryContent(undefined, undefined, { hasApi }),
  );
}

export function canonicalQueryAuthHookFile(base = "apps/web/src"): TemplateFile {
  return file(`${base}/lib/query-auth-scope.ts`, canonicalQueryAuthHookContent());
}
