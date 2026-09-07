import { file, type TemplateFile } from "../../shared.js";

type TanstackMode = "monorepo" | "single";

export interface TanstackInitialReadSelection {
  readonly admin?: boolean;
  readonly billing?: boolean;
  readonly featureFlags?: boolean;
  readonly identity?: boolean;
  readonly messaging?: false | "convex" | "postgres";
}

function queryAuthCacheBoundaryContent(): string {
  return `"use client";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import {
  currentQueryAuthScope,
  queryAuthScopeFromSession,
  queryAuthScopeSignature,
  transitionQueryAuthScope,
} from "@/lib/query-client";

export function QueryAuthCacheBoundary({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}): React.JSX.Element {
  const session = authClient.useSession();
  const nextScope = React.useMemo(
    () =>
      session.isPending
        ? currentQueryAuthScope(queryClient)
        : queryAuthScopeFromSession(session.data),
    [queryClient, session.data, session.isPending],
  );
  const nextSignature = queryAuthScopeSignature(nextScope);
  const [appliedSignature, setAppliedSignature] = React.useState(() =>
    queryAuthScopeSignature(currentQueryAuthScope(queryClient)),
  );
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    transitionQueryAuthScope(queryClient, nextScope);
    setAppliedSignature(nextSignature);
    setMounted(true);
  }, [nextScope, nextSignature, queryClient]);

  // A fresh document cannot contain another account's cache. After mount,
  // withhold descendants for the one transition render so no stale private
  // query can paint before the old owner's cache is cleared.
  if (mounted && appliedSignature !== nextSignature) return <></>;
  return <>{children}</>;
}
`;
}

function protectedServerFunctionsContent(
  mode: TanstackMode,
  initialReads: TanstackInitialReadSelection,
): string {
  const applicationImport =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  const featureFlagServiceImport =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  const requestApplication = Object.values(initialReads).some(Boolean)
    ? `
async function requestApplication() {
  const [{ getRequestHeaders }, applicationModule] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("${applicationImport}"),
  ]);
  const headers = new Headers();
  getRequestHeaders().forEach((value, key) => headers.set(key, value));
  return {
    application: await applicationModule.createRequestApplicationForRequest(headers),
    applicationModule,
    headers,
  };
}
`
    : "";
  const adminRead = initialReads.admin
    ? `
export const getInitialAdminUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { application } = await requestApplication();
  return await application.admin.listUsers({ search: "", page: 1, limit: 20 });
});
`
    : "";
  const identityRead = initialReads.identity
    ? `
export const getInitialIdentityWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const { application } = await requestApplication();
  return await application.identity.workspace.snapshot();
});
`
    : "";
  const billingRead = initialReads.billing
    ? `
export const getInitialBillingSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { application } = await requestApplication();
  const snapshot = await application.billing.subscriptions();
  const subscriptions = snapshot.subscriptions.flatMap((value) => {
    const id = typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
    const provider = value.provider;
    const status = value.status;
    if (!id || (provider !== "stripe" && provider !== "chargily" && provider !== "paddle" && provider !== "polar") || typeof status !== "string") return [];
    const customerId = typeof value.customerId === "string" || value.customerId === null ? value.customerId : undefined;
    return [{ id, provider, status, customerId }];
  });
  const invoices = snapshot.invoices.flatMap((value) => {
    const id = typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
    const provider = value.provider;
    const status = value.status;
    if (!id || (provider !== "stripe" && provider !== "chargily" && provider !== "paddle" && provider !== "polar") || typeof status !== "string" || typeof value.amount !== "number") return [];
    const currency = typeof value.currency === "string" ? value.currency : undefined;
    return [{ id, provider, status, amount: value.amount, currency, paid: value.paid === true }];
  });
  return { subscriptions, invoices };
});
`
    : "";
  const messagingRead = initialReads.messaging
    ? `
export const getInitialConversations = createServerFn({ method: "GET" }).handler(async () => {
  const { application } = await requestApplication();
  return await application.messaging.listConversations();
});
`
    : "";
  const featureFlagRead = initialReads.featureFlags
    ? `
export const getInitialUserFeatureFlag = createServerFn({ method: "GET" }).handler(async () => {
  const [{ application }, { evaluateAuthenticatedFeatureFlag }] = await Promise.all([
    requestApplication(),
    import("${featureFlagServiceImport}"),
  ]);
  const current = await application.me();
  if (!current.user || current.user.banned) return null;
  try {
    return await evaluateAuthenticatedFeatureFlag(current.user, "new-dashboard");
  } catch {
    // Flag evaluation is advisory and must never make the route unavailable.
    return null;
  }
});
`
    : "";
  return `import { createServerFn } from "@tanstack/react-start";

export interface ProtectedQueryAuthScope {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}

export interface ProtectedRouteUser {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  banned: boolean;
}

export interface ProtectedRouteSession {
  user: ProtectedRouteUser | null;
  queryScope: ProtectedQueryAuthScope | null;
}
${requestApplication}

export const getProtectedRouteSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProtectedRouteSession> => {
    const [{ getRequestHeaders }, { createRequestApplicationForRequest }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("${applicationImport}"),
    ]);
    const headers = new Headers();
    getRequestHeaders().forEach((value, key) => headers.set(key, value));
    const application = await createRequestApplicationForRequest(headers);
    const result = await application.me();
    const queryScope = result.user && result.sessionId
      ? {
          userId: result.user.id,
          sessionId: result.sessionId,
          tenantId: result.activeOrganizationId,
          teamId: result.activeTeamId,
        }
      : null;
    if (result.user && !queryScope) {
      throw new Error("Authenticated request did not produce a private query scope");
    }
    return { user: result.user, queryScope };
  },
);
${adminRead}${identityRead}${billingRead}${messagingRead}${featureFlagRead}
`;
}

function protectedRouteContent(initialReads: TanstackInitialReadSelection): string {
  const initialServerFunctions = [
    initialReads.admin ? "getInitialAdminUsers" : "",
    initialReads.billing ? "getInitialBillingSnapshot" : "",
    initialReads.featureFlags ? "getInitialUserFeatureFlag" : "",
    initialReads.identity ? "getInitialIdentityWorkspace" : "",
    initialReads.messaging ? "getInitialConversations" : "",
  ].filter(Boolean);
  const serverFunctionImports = ["getProtectedRouteSession", ...initialServerFunctions].join(
    ",\n  ",
  );
  const initialQueryKeyImports = [
    initialReads.admin ? "adminUsersQueryKey" : "",
    initialReads.billing ? "billingSnapshotQueryKey" : "",
    initialReads.featureFlags ? "initialUserFeatureFlagQueryKey" : "",
    initialReads.identity ? "identityWorkspaceInitialQueryKey" : "",
    initialReads.messaging ? "messagingConversationsQueryKey" : "",
  ].filter(Boolean);
  const queryKeyImports = [
    "authScopedQueryKey",
    ...initialQueryKeyImports,
    "transitionQueryAuthScope",
  ].join(",\n  ");
  const adminLoader = initialReads.admin
    ? `
export function loadInitialAdminUsers(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}) {
  return context.queryClient.ensureQueryData(queryOptions({
    queryKey: adminUsersQueryKey(context.queryScope, { search: "", page: 1, limit: 20 }),
    queryFn: () => getInitialAdminUsers(),
    staleTime: 30_000,
  }));
}
`
    : "";
  const identityLoader = initialReads.identity
    ? `
export function loadInitialIdentityWorkspace(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}) {
  return context.queryClient.ensureQueryData(queryOptions({
    queryKey: identityWorkspaceInitialQueryKey(context.queryScope),
    queryFn: () => getInitialIdentityWorkspace(),
    staleTime: 30_000,
  }));
}
`
    : "";
  const billingLoader = initialReads.billing
    ? `
export function loadInitialBillingSnapshot(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}) {
  return context.queryClient.ensureQueryData(queryOptions({
    queryKey: billingSnapshotQueryKey(context.queryScope),
    queryFn: () => getInitialBillingSnapshot(),
    staleTime: 30_000,
  }));
}
`
    : "";
  const messagingLoader = initialReads.messaging
    ? `
export function loadInitialConversations(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}) {
  return context.queryClient.ensureQueryData(queryOptions({
    queryKey: messagingConversationsQueryKey(context.queryScope),
    queryFn: () => getInitialConversations(),
    staleTime: 30_000,
  }));
}
`
    : "";
  const featureFlagLoader = initialReads.featureFlags
    ? `
export function loadInitialUserFeatureFlag(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}) {
  return context.queryClient.ensureQueryData(queryOptions({
    queryKey: initialUserFeatureFlagQueryKey(context.queryScope),
    queryFn: () => getInitialUserFeatureFlag(),
    staleTime: 30_000,
  }));
}
`
    : "";
  return `import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import {
  ${queryKeyImports},
  type QueryAuthScope,
} from "@/lib/query-client";
import {
  ${serverFunctionImports},
  type ProtectedRouteSession,
} from "@/lib/server-functions";

const PROTECTED_SESSION_KEY = ["protected-route", "session"] as const;

export function protectedRouteSessionQueryOptions(scope: QueryAuthScope) {
  return queryOptions({
    queryKey: authScopedQueryKey(scope, PROTECTED_SESSION_KEY),
    queryFn: () => getProtectedRouteSession(),
    staleTime: 30_000,
  });
}

export async function requireProtectedRoute(queryClient: QueryClient): Promise<{
  protectedSession: ProtectedRouteSession;
  queryScope: QueryAuthScope;
}> {
  const result = await resolveRouteAuth(queryClient);
  if (!result.protectedSession.user || result.protectedSession.user.banned || !result.queryScope) {
    throw redirect({ to: "/sign-in" });
  }
  return { protectedSession: result.protectedSession, queryScope: result.queryScope };
}

export async function resolveRouteAuth(queryClient: QueryClient): Promise<{
  protectedSession: ProtectedRouteSession;
  queryScope: QueryAuthScope | null;
}> {
  const protectedSession = await getProtectedRouteSession();
  transitionQueryAuthScope(queryClient, protectedSession.queryScope);
  if (protectedSession.queryScope) {
    const options = protectedRouteSessionQueryOptions(protectedSession.queryScope);
    queryClient.setQueryData(options.queryKey, protectedSession);
  }
  return { protectedSession, queryScope: protectedSession.queryScope };
}

export function loadProtectedRoute(context: {
  queryClient: QueryClient;
  queryScope: QueryAuthScope;
}): Promise<ProtectedRouteSession> {
  return context.queryClient.ensureQueryData(protectedRouteSessionQueryOptions(context.queryScope));
}
${adminLoader}${identityLoader}${billingLoader}${messagingLoader}${featureFlagLoader}
`;
}

export function tanstackServerFoundationFiles(
  mode: TanstackMode,
  hasAuth: boolean,
  hasApi: boolean,
  initialReads: TanstackInitialReadSelection = {},
): TemplateFile[] {
  if (!hasAuth) return [];
  const root = mode === "monorepo" ? "apps/web/" : "";
  const files = [
    file(`${root}src/components/query-auth-boundary.tsx`, queryAuthCacheBoundaryContent()),
  ];
  if (!hasApi) return files;
  files.push(
    file(`${root}src/lib/server-functions.ts`, protectedServerFunctionsContent(mode, initialReads)),
    file(`${root}src/lib/protected-route.ts`, protectedRouteContent(initialReads)),
  );
  return files;
}

export function tanstackProtectedRouteDefinition(
  route: string,
  componentName: string,
  componentImport: string,
): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
import { ${componentName} } from "${componentImport}";

export const Route = createFileRoute("/${route}")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => loadProtectedRoute(context),
  component: ${componentName},
});
`;
}
