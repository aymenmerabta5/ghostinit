import { file, type TemplateFile } from "../../shared.js";
import {
  nativeI18nImportPath,
  nativeI18nTemplate,
  webSurfaceI18nTemplate,
} from "../fragments/native-i18n.js";
import {
  enabledTargets,
  featureRoot,
  routeFile,
  type CapabilityClientOptions,
  type ClientTarget,
} from "./shared.js";

function translations(options: CapabilityClientOptions, target: ClientTarget) {
  return target === "web"
    ? webSurfaceI18nTemplate("jobs")
    : nativeI18nTemplate(options.i18n, "jobs", nativeI18nImportPath(target, options.mode));
}

function queriesContent(): string {
  return `import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpcClient } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthGeneration, currentQueryAuthScope } from "@/lib/query-client";

export function getOwnedJobRun(runId: string) { return orpcClient.jobs.getRun({ runId }); }
export function ownedJobRunQueryOptions(queryClient: QueryClient, runId: string) {
  const scope = currentQueryAuthScope(queryClient);
  const generation = currentQueryAuthGeneration(queryClient);
  return {
    queryKey: scope ? authScopedQueryKey(scope, ["jobs", "run", runId]) : ["auth", "anonymous", "jobs", runId],
    queryFn: async () => {
      if (!scope || generation !== currentQueryAuthGeneration(queryClient)) throw new Error("The job request owner changed");
      const result = await getOwnedJobRun(runId);
      if (generation !== currentQueryAuthGeneration(queryClient)) throw new Error("The job request owner changed");
      return result;
    },
    // This surface has an explicit lookup action and no collection/list contract.
    enabled: false,
    staleTime: 0,
    retry: false,
  };
}
export function useOwnedJobRun(runId: string) {
  const queryClient = useQueryClient();
  const query = useQuery(ownedJobRunQueryOptions(queryClient, runId));
  return {
    data: query.data, error: query.error, isFetching: query.isFetching,
    read: (id: string) => queryClient.fetchQuery(ownedJobRunQueryOptions(queryClient, id)),
    accept: (snapshot: Awaited<ReturnType<typeof getOwnedJobRun>>) => {
      queryClient.setQueryData(ownedJobRunQueryOptions(queryClient, snapshot.id).queryKey, snapshot);
    },
  };
}
`;
}

function mutationsContent(): string {
  return `import { orpcClient } from "@/lib/orpc";
function requestKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  const randomUUID = cryptoValue && typeof cryptoValue === "object" ? Reflect.get(cryptoValue, "randomUUID") : undefined;
  if (typeof randomUUID === "function") { const value: unknown = Reflect.apply(randomUUID, cryptoValue, []); if (typeof value === "string") return value; }
  return [Date.now().toString(36), Math.random().toString(36).slice(2)].join("-");
}
export function enqueueOwnedJob(message: string) {
  return orpcClient.jobs.enqueue({ jobId: "system.echo", requestKey: requestKey(), payload: { message }, maxAttempts: 3 });
}
export function cancelOwnedJob(runId: string) { return orpcClient.jobs.cancelRun({ runId }); }
`;
}

function workflowContent(options: CapabilityClientOptions, target: ClientTarget): string {
  const i18n = translations(options, target);
  return `"use client";
import { useState } from "react";
${target === "mobile" ? 'import { useForm, useStore } from "@tanstack/react-form";' : 'import { useAppForm, useStore } from "@/components/ui/form";'}
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { useOwnedJobRun } from "./queries";
import { cancelOwnedJob, enqueueOwnedJob } from "./mutations";
${i18n.importLine}

type JobAction = { kind: "enqueue"; message: string } | { kind: "cancel" | "lookup"; runId: string };
export function useJobWorkspace() {
${i18n.hookLine}
  const messageForm = ${target === "mobile" ? "useForm" : "useAppForm"}({
    defaultValues: { message: ${i18n.value("defaultMessage", "Hello worker")} },
    onSubmit: async ({ value }): Promise<void> => { await mutation.run({ kind: "enqueue", message: value.message }); },
  });
  const lookupForm = ${target === "mobile" ? "useForm" : "useAppForm"}({
    defaultValues: { runId: "" },
    onSubmit: async ({ value }): Promise<void> => { await mutation.run({ kind: "lookup", runId: value.runId }); },
  });
  const message = useStore(messageForm.store, state => state.values.message);
  const runId = useStore(lookupForm.store, state => state.values.runId);
  const setMessage = (value: string): void => { messageForm.setFieldValue("message", value); };
  const setRunId = (value: string): void => { lookupForm.setFieldValue("runId", value); };
  const [selectedRunId, selectRunId] = useState("");
  const runQuery = useOwnedJobRun(selectedRunId);
  const mutation = useAuthOwnedMutation(async (action: JobAction) => {
    if (action.kind === "lookup") {
      selectRunId(action.runId);
      try { await runQuery.read(action.runId); }
      catch { /* The query owns lookup errors and its selected result. */ }
      return null;
    }
    return action.kind === "enqueue" ? enqueueOwnedJob(action.message) : cancelOwnedJob(action.runId);
  }, {
    onSuccess: (value) => {
      if (value === null) return;
      runQuery.accept(value.run);
      setRunId(value.run.id); selectRunId(value.run.id);
    },
  });
  const error = mutation.error ? mutation.variables?.kind === "enqueue" ? ${i18n.value("enqueueError", "Enqueue failed")} : mutation.variables?.kind === "cancel" ? ${i18n.value("cancelError", "Cancel failed")} : ${i18n.value("lookupError", "Lookup failed")} : runQuery.error ? ${i18n.value("lookupError", "Lookup failed")} : null;
  return {
    message, setMessage, runId, setRunId, result: runQuery.data ?? null, error,
    isPending: mutation.isPending || runQuery.isFetching,
    enqueue: () => { void messageForm.handleSubmit(); },
    cancel: () => { void mutation.run({ kind: "cancel", runId: lookupForm.state.values.runId }); },
    refresh: () => { void lookupForm.handleSubmit(); },
  };
}
`;
}

function presentationContent(options: CapabilityClientOptions, target: ClientTarget): string {
  const i18n = translations(options, target);
  const mobile = target === "mobile";
  return `"use client";
import type * as React from "react";
${mobile ? 'import { ScrollView, View } from "react-native";\nimport { Text } from "@/components/ui/text";' : 'import { Alert, AlertDescription } from "@/components/ui/alert";\nimport { Field, FieldLabel } from "@/components/ui/field";'}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { useJobWorkspace } from "../use-job-workspace";
${i18n.importLine}

export function JobWorkspace({ message, setMessage, runId, setRunId, result, error, isPending, enqueue, refresh, cancel }: ReturnType<typeof useJobWorkspace>): React.JSX.Element {
${i18n.hookLine}
${
  mobile
    ? `  return <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Background jobs")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("description", "Run background work and check its progress.")}</Text></View>
    {isPending ? <Text accessibilityRole="alert">${i18n.child("pending", "Working…")}</Text> : null}
    <Card><CardHeader><CardTitle>${i18n.child("runTitle", "Start a sample job")}</CardTitle></CardHeader><CardContent className="gap-3"><Text>${i18n.child("echoPayload", "Message")}</Text><Input editable={!isPending} value={message} onChangeText={setMessage} accessibilityLabel={${i18n.value("echoPayload", "Message")}} /><Button disabled={isPending} onPress={enqueue}><Text>${i18n.child("enqueue", "Run sample job")}</Text></Button></CardContent></Card>
    <Card><CardHeader><CardTitle>${i18n.child("statusTitle", "Job status")}</CardTitle></CardHeader><CardContent className="gap-3"><Text>${i18n.child("runId", "Run ID")}</Text><Input editable={!isPending} value={runId} onChangeText={setRunId} accessibilityLabel={${i18n.value("runId", "Run ID")}} /><View className="flex-row flex-wrap gap-2"><Button disabled={isPending} variant="outline" onPress={refresh}><Text>${i18n.child("refresh", "Refresh")}</Text></Button><Button disabled={isPending} variant="destructive" onPress={cancel}><Text>${i18n.child("cancel", "Cancel")}</Text></Button></View></CardContent></Card>
    {error ? <Text accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    {result !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Job result")}</CardTitle></CardHeader><CardContent><Text selectable>{JSON.stringify(result, null, 2)}</Text></CardContent></Card> : null}
  </View></ScrollView>;`
    : `  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("title", "Background jobs")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${i18n.child("description", "Run background work and check its progress.")}</p></header>
    {isPending ? <p role="status">${i18n.child("pending", "Working…")}</p> : null}
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle as="h2">${i18n.child("runTitle", "Start a sample job")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="job-echo-payload">${i18n.child("echoPayload", "Message")}</FieldLabel><Input disabled={isPending} id="job-echo-payload" value={message} onChange={(event) => setMessage(event.target.value)} /></Field><Button disabled={isPending} aria-busy={isPending} className="w-fit" onClick={enqueue}>${i18n.child("enqueue", "Run sample job")}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle as="h2">${i18n.child("statusTitle", "Job status")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="job-run-id">${i18n.child("runId", "Run ID")}</FieldLabel><Input disabled={isPending} id="job-run-id" value={runId} onChange={(event) => setRunId(event.target.value)} /></Field><div className="flex flex-wrap gap-2"><Button disabled={isPending} aria-busy={isPending} variant="outline" onClick={refresh}>${i18n.child("refresh", "Refresh")}</Button><Button disabled={isPending} aria-busy={isPending} variant="destructive" onClick={cancel}>${i18n.child("cancel", "Cancel")}</Button></div></CardContent></Card>
    </div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result !== null ? <Card><CardHeader><CardTitle as="h2">${i18n.child("result", "Job result")}</CardTitle></CardHeader><CardContent><pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 text-xs leading-6">{JSON.stringify(result, null, 2)}</pre></CardContent></Card> : null}
  </main>;`
}
}
`;
}

export function jobClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.jobs) return [];
  return enabledTargets(options).flatMap((target) => {
    const base = featureRoot(options.mode, target, "jobs");
    return [
      file(`${base}/queries.ts`, queriesContent()),
      file(`${base}/mutations.ts`, mutationsContent()),
      file(`${base}/use-job-workspace.ts`, workflowContent(options, target)),
      file(`${base}/components/job-workspace.tsx`, presentationContent(options, target)),
      file(
        `${base}/page.tsx`,
        `"use client";
import type * as React from "react";
import { JobWorkspace } from "./components/job-workspace";
import { useJobWorkspace } from "./use-job-workspace";
export function JobsPage(): React.JSX.Element { return <JobWorkspace {...useJobWorkspace()} />; }
`,
      ),
      routeFile(options, target, "jobs", "JobsPage", "jobs"),
    ];
  });
}
