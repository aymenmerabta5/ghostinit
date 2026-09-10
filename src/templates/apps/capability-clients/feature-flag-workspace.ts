import type { CapabilityClientOptions, ClientTarget } from "./shared.js";
import {
  nativeI18nImportPath,
  nativeI18nTemplate,
  webSurfaceI18nTemplate,
} from "../fragments/native-i18n.js";

function translations(options: CapabilityClientOptions, target: ClientTarget) {
  return target === "web"
    ? webSurfaceI18nTemplate("featureFlags")
    : nativeI18nTemplate(options.i18n, "featureFlags", nativeI18nImportPath(target, options.mode));
}

export function featureFlagQueriesContent(): string {
  return `import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpcClient } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthGeneration, currentQueryAuthScope, initialUserFeatureFlagQueryKey } from "@/lib/query-client";

export function evaluateRemoteFeatureFlag(key: string) { return orpcClient.featureFlags.evaluate({ key }); }
export function featureFlagQueryOptions(queryClient: QueryClient, key: string) {
  const scope = currentQueryAuthScope(queryClient);
  const generation = currentQueryAuthGeneration(queryClient);
  return {
    queryKey: scope ? key === "new-dashboard" ? initialUserFeatureFlagQueryKey(scope) : authScopedQueryKey(scope, ["feature-flags", key]) : ["auth", "anonymous", "feature-flags", key],
    queryFn: async () => {
      if (generation !== currentQueryAuthGeneration(queryClient)) throw new Error("The feature flag request owner changed");
      const result = await evaluateRemoteFeatureFlag(key);
      if (generation !== currentQueryAuthGeneration(queryClient)) throw new Error("The feature flag request owner changed");
      return result;
    },
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  };
}
export function useInitialUserFeatureFlag() { return useQuery(featureFlagQueryOptions(useQueryClient(), "new-dashboard")); }
export function useFeatureFlagQuery(key: string, bootstrap: boolean) {
  const queryClient = useQueryClient();
  const options = featureFlagQueryOptions(queryClient, key);
  const query = useQuery({ ...options, enabled: bootstrap && options.enabled });
  return {
    data: query.data, error: query.error, isFetching: query.isFetching,
    evaluate: (requestedKey: string) => queryClient.fetchQuery({ ...featureFlagQueryOptions(queryClient, requestedKey), retry: false, staleTime: 0 }),
  };
}
`;
}

export function featureFlagWorkflowContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const i18n = translations(options, target);
  const tanstack = target === "web" && options.framework === "tanstack-start";
  return `"use client";
import { useState } from "react";
${target === "mobile" ? 'import { useForm, useStore } from "@tanstack/react-form";' : 'import { useAppForm, useStore } from "@/components/ui/form";'}
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useFeatureFlagQuery } from "./queries";
${i18n.importLine}

export function useFeatureFlagEvaluation(initialResult: unknown = null) {
${i18n.hookLine}
  const captureOwner = useAuthOwnedEffect();
  const form = ${target === "mobile" ? "useForm" : "useAppForm"}({ defaultValues: { key: "new-dashboard" }, onSubmit: async ({ value }): Promise<void> => { await evaluate(value.key); } });
  const key = useStore(form.store, state => state.values.key);
  const setKey = (value: string): void => { form.setFieldValue("key", value); };
  const [selectedKey, selectKey] = useState("new-dashboard");
  const query = useFeatureFlagQuery(selectedKey, ${tanstack});
  async function evaluate(requestedKey: string): Promise<void> {
    const isCurrent = captureOwner();
    if (!isCurrent()) return;
    selectKey(requestedKey);
    try { await query.evaluate(requestedKey); }
    catch { /* The keyed query owns the lookup error; no copied result/error state. */ }
  }
  return {
    flagKey: key, setKey, evaluate: () => { void form.handleSubmit(); }, isPending: query.isFetching,
    error: query.error ? ${i18n.value("error", "Flag evaluation failed")} : null,
    result: query.data ?? (selectedKey === "new-dashboard" ? initialResult : null),
  };
}
`;
}

export function featureFlagScreenContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const next = target === "web" && options.framework === "nextjs";
  return `"use client";
import type * as React from "react";
import { FeatureFlagWorkspace } from "./components/feature-flag-workspace";
import { useFeatureFlagEvaluation } from "./use-feature-flag-evaluation";
export function FeatureFlagsPage(${next ? "{ initialResult }: { initialResult: unknown }" : ""}): React.JSX.Element { return <FeatureFlagWorkspace {...useFeatureFlagEvaluation(${next ? "initialResult" : ""})} />; }
`;
}

export function featureFlagWorkspaceContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const i18n = translations(options, target);
  const mobile = target === "mobile";
  return `"use client";
import type * as React from "react";
${mobile ? 'import { ScrollView, View } from "react-native";\nimport { Text } from "@/components/ui/text";' : 'import { Alert, AlertDescription } from "@/components/ui/alert";\nimport { Field, FieldLabel } from "@/components/ui/field";'}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { useFeatureFlagEvaluation } from "../use-feature-flag-evaluation";
${i18n.importLine}

export function FeatureFlagWorkspace({ flagKey, setKey, evaluate, isPending, error, result }: ReturnType<typeof useFeatureFlagEvaluation>): React.JSX.Element {
${i18n.hookLine}
${
  mobile
    ? `  return <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Remote feature flags")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("description", "Check how a feature is configured for your account. Feature flags do not change permissions.")}</Text></View>
    {isPending ? <Text accessibilityRole="alert">${i18n.child("pending", "Working…")}</Text> : null}
    <Card><CardHeader><CardTitle>${i18n.child("evaluate", "Evaluate")}</CardTitle></CardHeader><CardContent className="gap-3"><Text>${i18n.child("keyLabel", "Flag key")}</Text><Input editable={!isPending} value={flagKey} onChangeText={setKey} maxLength={128} accessibilityLabel={${i18n.value("keyLabel", "Flag key")}} /><Button disabled={isPending} onPress={evaluate}><Text>${i18n.child("evaluate", "Evaluate")}</Text></Button></CardContent></Card>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    {result !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Evaluation result")}</CardTitle></CardHeader><CardContent><Text selectable>{JSON.stringify(result, null, 2)}</Text></CardContent></Card> : null}
  </View></ScrollView>;`
    : `  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("title", "Remote feature flags")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${i18n.child("description", "Check how a feature is configured for your account. Feature flags do not change permissions.")}</p></header>
    {isPending ? <p role="status">${i18n.child("pending", "Working…")}</p> : null}
    <Card className="max-w-3xl"><CardHeader><CardTitle as="h2">${i18n.child("evaluate", "Evaluate")}</CardTitle></CardHeader><CardContent>
      <form className="flex flex-col items-start gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); evaluate(); }}><Field className="w-full min-w-0 sm:flex-1"><FieldLabel htmlFor="feature-flag-key">${i18n.child("keyLabel", "Flag key")}</FieldLabel><Input disabled={isPending} id="feature-flag-key" value={flagKey} onChange={(event) => setKey(event.target.value)} maxLength={128} required /></Field><Button className="shrink-0" disabled={isPending} aria-busy={isPending} type="submit">${i18n.child("evaluate", "Evaluate")}</Button></form>
    </CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result !== null ? <Card className="max-w-3xl"><CardHeader><CardTitle as="h2">${i18n.child("result", "Evaluation result")}</CardTitle></CardHeader><CardContent><pre dir="ltr" className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 text-xs leading-6">{JSON.stringify(result, null, 2)}</pre></CardContent></Card> : null}
  </main>;`
}
}
`;
}
