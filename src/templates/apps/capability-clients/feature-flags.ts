import { file, type TemplateFile } from "../../shared.js";
import {
  nativeI18nImportPath,
  nativeI18nTemplate,
  webSurfaceI18nTemplate,
} from "../fragments/native-i18n.js";
import {
  appRoot,
  enabledTargets,
  featureRoot,
  routeFile,
  type CapabilityClientOptions,
  type ClientTarget,
} from "./shared.js";

function queriesContent(options: CapabilityClientOptions, target: ClientTarget): string {
  const tanstackUserBootstrap =
    target === "web" && options.framework === "tanstack-start"
      ? `import { useQuery, useQueryClient } from "@tanstack/react-query";
import { currentQueryAuthScope, initialUserFeatureFlagQueryKey } from "@/lib/query-client";
`
      : "";
  const tanstackHook =
    target === "web" && options.framework === "tanstack-start"
      ? `
export function useInitialUserFeatureFlag() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  return useQuery({
    queryKey: scope
      ? initialUserFeatureFlagQueryKey(scope)
      : ["auth", "anonymous", "feature-flags", "new-dashboard"],
    queryFn: () => evaluateRemoteFeatureFlag("new-dashboard"),
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
}
`
      : "";
  return `${tanstackUserBootstrap}import { orpcClient } from "@/lib/orpc";

export function evaluateRemoteFeatureFlag(key: string) {
  return orpcClient.featureFlags.evaluate({ key });
}
${tanstackHook}
`;
}

function featureFlagTanstackRouteContent(): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { FeatureFlagsPage } from "@/features/feature-flags/page";
import { loadInitialUserFeatureFlag, resolveRouteAuth } from "@/lib/protected-route";

export const Route = createFileRoute("/feature-flags")({
  beforeLoad: ({ context }) => resolveRouteAuth(context.queryClient),
  loader: ({ context }) =>
    context.queryScope ? loadInitialUserFeatureFlag({ ...context, queryScope: context.queryScope }) : null,
  component: FeatureFlagsPage,
});
`;
}

function featureFlagNextRouteContent(
  mode: CapabilityClientOptions["mode"],
  requestApplication: boolean,
): string {
  if (!requestApplication) {
    return `import type * as React from "react";
import { FeatureFlagsPage } from "@/features/feature-flags/page";

export default function Page(): React.JSX.Element {
  return <FeatureFlagsPage initialResult={null} />;
}
`;
  }
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { Suspense } from "react";
import {
  createRequestApplicationForRequest,
  evaluateAuthenticatedFeatureFlag,
} from "${applicationModule}";
import { FeatureFlagsPage } from "@/features/feature-flags/page";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";

async function FeatureFlagData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const current = await application.me();
  const principal = application.principal;
  if (!current.user || current.user.banned || !principal) return <FeatureFlagsPage initialResult={null} />;
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  let initialResult = null;
  try {
    initialResult = await evaluateAuthenticatedFeatureFlag(current.user, "new-dashboard");
  } catch {
    // Feature flags are advisory and must never make the page unavailable.
  }
  return <RequestOwnedSnapshot scope={scope}><FeatureFlagsPage initialResult={initialResult} /></RequestOwnedSnapshot>;
}

export default function Page(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><FeatureFlagData /></Suspense>;
}
`;
}

function domPageContent(options: CapabilityClientOptions, target: "web" | "desktop"): string {
  const tanstack = target === "web" && options.framework === "tanstack-start";
  const i18n =
    target === "web"
      ? webSurfaceI18nTemplate("featureFlags")
      : nativeI18nTemplate(
          options.i18n,
          "featureFlags",
          nativeI18nImportPath(target, options.mode),
        );
  const initialImport = tanstack ? ", useInitialUserFeatureFlag" : "";
  const initialState = tanstack ? "  const initial = useInitialUserFeatureFlag();\n" : "";
  const displayedResult = tanstack
    ? "  const displayedResult = result ?? initial.data ?? null;\n"
    : target === "web" && options.framework === "nextjs"
      ? "  const displayedResult = result ?? initialResult;\n"
      : "  const displayedResult = result;\n";
  const componentParameters =
    target === "web" && options.framework === "nextjs"
      ? "{ initialResult }: { initialResult: unknown }"
      : "";
  return `"use client";
import * as React from "react";
import { useAuthOwnedAction } from "@/hooks/use-auth-owned-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { evaluateRemoteFeatureFlag${initialImport} } from "./queries";
${i18n.importLine}

export function FeatureFlagsPage(${componentParameters}): React.JSX.Element {
${i18n.hookLine}${initialState}
  const [key, setKey] = React.useState("new-dashboard");
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { isPending, run } = useAuthOwnedAction();
  function evaluate(): void {
    void run(() => evaluateRemoteFeatureFlag(key), (value) => {
      setResult(value); setError(null);
    }, () => setError(${i18n.value("error", "Flag evaluation failed")}));
  }

${displayedResult}
  return <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <header><h1 className="text-2xl font-semibold">${i18n.child("title", "Remote feature flags")}</h1><p className="text-sm text-muted-foreground">${i18n.child("description", "Resolve provider-backed flags through the typed application boundary. Flags never grant authorization.")}</p></header>
    {isPending ? <p role="status">${i18n.child("pending", "Working…")}</p> : null}
    <Card><CardHeader><CardTitle>${i18n.child("evaluate", "Evaluate")}</CardTitle></CardHeader><CardContent>
      <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); evaluate(); }}>
        <Field className="flex-1"><FieldLabel htmlFor="feature-flag-key">${i18n.child("keyLabel", "Flag key")}</FieldLabel><Input disabled={isPending} id="feature-flag-key" value={key} onChange={(event) => setKey(event.target.value)} maxLength={128} required /></Field>
        <Button disabled={isPending} aria-busy={isPending} type="submit">${i18n.child("evaluate", "Evaluate")}</Button>
      </form>
    </CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {displayedResult !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Evaluation result")}</CardTitle></CardHeader><CardContent><pre className="overflow-auto rounded bg-muted p-4 text-sm">{JSON.stringify(displayedResult, null, 2)}</pre></CardContent></Card> : null}
  </main>;
}
`;
}

function expoPageContent(options: CapabilityClientOptions): string {
  const i18n = nativeI18nTemplate(
    options.i18n,
    "featureFlags",
    nativeI18nImportPath("mobile", options.mode),
  );
  return `import * as React from "react";
import { useAuthOwnedAction } from "@/hooks/use-auth-owned-action";
import { Text, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { evaluateRemoteFeatureFlag } from "./queries";
${i18n.importLine}

export function FeatureFlagsPage(): React.JSX.Element {
${i18n.hookLine}
  const [key, setKey] = React.useState("new-dashboard");
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { isPending, run } = useAuthOwnedAction();
  function evaluate(): void {
    void run(() => evaluateRemoteFeatureFlag(key), (value) => {
      setResult(value); setError(null);
    }, () => setError(${i18n.value("error", "Flag evaluation failed")}));
  }

  return <View className="flex-1 gap-4 bg-background p-5">
    <Text className="text-2xl font-bold">${i18n.child("title", "Remote feature flags")}</Text>
    <Text className="text-muted-foreground">${i18n.child("shortDescription", "Provider-backed evaluation. Flags never grant authorization.")}</Text>
    {isPending ? <Text accessibilityLiveRegion="polite">${i18n.child("pending", "Working…")}</Text> : null}
    <Card><CardHeader><CardTitle>${i18n.child("keyLabel", "Flag key")}</CardTitle><CardDescription>${i18n.child("shortDescription", "Provider-backed evaluation. Flags never grant authorization.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input editable={!isPending} value={key} onChangeText={setKey} placeholder={${i18n.value("keyLabel", "Flag key")}} maxLength={128} /><Button disabled={isPending} accessibilityState={{ busy: isPending }} onPress={evaluate}>${i18n.child("evaluate", "Evaluate")}</Button></CardContent></Card>
    {error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Evaluation result")}</CardTitle></CardHeader><CardContent><Text className="font-mono">{JSON.stringify(result, null, 2)}</Text></CardContent></Card> : null}
  </View>;
}
`;
}

function featureFlagFilesForTarget(
  options: CapabilityClientOptions,
  target: ClientTarget,
): TemplateFile[] {
  const base = featureRoot(options.mode, target, "feature-flags");
  const tanstackWeb = target === "web" && options.framework === "tanstack-start";
  return [
    file(`${base}/queries.ts`, queriesContent(options, target)),
    file(
      `${base}/page.tsx`,
      target === "mobile" ? expoPageContent(options) : domPageContent(options, target),
    ),
    tanstackWeb
      ? file(
          `${appRoot(options.mode, target)}src/routes/feature-flags.tsx`,
          featureFlagTanstackRouteContent(),
        )
      : target === "web" && options.framework === "nextjs"
        ? file(
            `${appRoot(options.mode, target)}src/app/feature-flags/page.tsx`,
            featureFlagNextRouteContent(options.mode, options.requestApplication),
          )
        : routeFile(options, target, "feature-flags", "FeatureFlagsPage", "feature-flags"),
  ];
}

export function featureFlagClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.featureFlags) return [];
  return enabledTargets(options).flatMap((target) => featureFlagFilesForTarget(options, target));
}
