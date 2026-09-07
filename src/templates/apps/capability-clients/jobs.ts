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

function queriesContent(): string {
  return `import { orpcClient } from "@/lib/orpc";

// A run cannot be read until the user supplies or creates its actor-owned run id;
// there is no list-runs contract, so the route intentionally has no initial data query.

export function getOwnedJobRun(runId: string) {
  return orpcClient.jobs.getRun({ runId });
}
`;
}

function mutationsContent(): string {
  return `import { orpcClient } from "@/lib/orpc";

function requestKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  const randomUUID = cryptoValue && typeof cryptoValue === "object"
    ? Reflect.get(cryptoValue, "randomUUID")
    : undefined;
  if (typeof randomUUID === "function") {
    const value: unknown = Reflect.apply(randomUUID, cryptoValue, []);
    if (typeof value === "string") return value;
  }
  return [Date.now().toString(36), Math.random().toString(36).slice(2)].join("-");
}

export function enqueueOwnedJob(message: string) {
  return orpcClient.jobs.enqueue({
    jobId: "system.echo",
    requestKey: requestKey(),
    payload: { message },
    maxAttempts: 3,
  });
}

export function cancelOwnedJob(runId: string) {
  return orpcClient.jobs.cancelRun({ runId });
}
`;
}

function domPageContent(options: CapabilityClientOptions, target: "web" | "desktop"): string {
  const i18n =
    target === "web"
      ? webSurfaceI18nTemplate("jobs")
      : nativeI18nTemplate(options.i18n, "jobs", nativeI18nImportPath(target, options.mode));
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getOwnedJobRun } from "./queries";
import { cancelOwnedJob, enqueueOwnedJob } from "./mutations";
${i18n.importLine}

export function JobsPage(): React.JSX.Element {
${i18n.hookLine}
  const [message, setMessage] = React.useState(${i18n.value("defaultMessage", "Hello worker")});
  const [runId, setRunId] = React.useState("");
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  return <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <header><h1 className="text-2xl font-semibold">${i18n.child("title", "Background jobs")}</h1><p className="text-sm text-muted-foreground">${i18n.child("description", "Enqueue and inspect actor-owned runs through the shared scheduler.")}</p></header>
    <Card><CardHeader><CardTitle>${i18n.child("enqueue", "Enqueue system.echo")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="job-echo-payload">${i18n.child("echoPayload", "Echo payload")}</FieldLabel><Input id="job-echo-payload" value={message} onChange={(event) => setMessage(event.target.value)} /></Field><Button className="w-fit" onClick={async () => { try { const value = await enqueueOwnedJob(message); setResult(value); setRunId(value.run.id); setError(null); } catch { setError(${i18n.value("enqueueError", "Enqueue failed")}); } }}>${i18n.child("enqueue", "Enqueue system.echo")}</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>${i18n.child("refresh", "Refresh")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel htmlFor="job-run-id">${i18n.child("runId", "Run ID")}</FieldLabel><Input id="job-run-id" value={runId} onChange={(event) => setRunId(event.target.value)} /></Field><div className="flex gap-2"><Button variant="outline" onClick={async () => { try { setResult(await getOwnedJobRun(runId)); setError(null); } catch { setError(${i18n.value("lookupError", "Lookup failed")}); } }}>${i18n.child("refresh", "Refresh")}</Button><Button variant="destructive" onClick={async () => { try { setResult(await cancelOwnedJob(runId)); setError(null); } catch { setError(${i18n.value("cancelError", "Cancel failed")}); } }}>${i18n.child("cancel", "Cancel")}</Button></div></CardContent></Card>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Job result")}</CardTitle></CardHeader><CardContent><pre className="overflow-auto rounded bg-muted p-4 text-sm">{JSON.stringify(result, null, 2)}</pre></CardContent></Card> : null}
  </main>;
}
`;
}

function expoPageContent(options: CapabilityClientOptions): string {
  const i18n = nativeI18nTemplate(
    options.i18n,
    "jobs",
    nativeI18nImportPath("mobile", options.mode),
  );
  return `import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOwnedJobRun } from "./queries";
import { cancelOwnedJob, enqueueOwnedJob } from "./mutations";
${i18n.importLine}

export function JobsPage(): React.JSX.Element {
${i18n.hookLine}
  const [message, setMessage] = React.useState(${i18n.value("defaultMessage", "Hello worker")});
  const [runId, setRunId] = React.useState("");
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  return <ScrollView className="flex-1 bg-background"><View className="gap-4 p-5">
    <Text className="text-2xl font-bold">${i18n.child("title", "Background jobs")}</Text>
    <Card><CardHeader><CardTitle>${i18n.child("enqueue", "Enqueue system.echo")}</CardTitle><CardDescription>${i18n.child("echoPayload", "Echo payload")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={message} onChangeText={setMessage} placeholder={${i18n.value("echoPayload", "Echo payload")}} /><Button onPress={async () => { try { const value = await enqueueOwnedJob(message); setResult(value); setRunId(value.run.id); setError(null); } ${options.i18n ? "catch {" : "catch (cause) {"} setError(${options.i18n ? i18n.value("enqueueError", "Enqueue failed") : 'cause instanceof Error ? cause.message : "Enqueue failed"'}); } }}>${i18n.child("enqueue", "Enqueue system.echo")}</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>${i18n.child("runId", "Run ID")}</CardTitle><CardDescription>${i18n.child("refresh", "Refresh or cancel an owned run")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={runId} onChangeText={setRunId} placeholder={${i18n.value("runId", "Run ID")}} /><View className="flex-row gap-2"><Button className="flex-1" variant="outline" onPress={async () => { try { setResult(await getOwnedJobRun(runId)); setError(null); } ${options.i18n ? "catch {" : "catch (cause) {"} setError(${options.i18n ? i18n.value("lookupError", "Lookup failed") : 'cause instanceof Error ? cause.message : "Lookup failed"'}); } }}>${i18n.child("refresh", "Refresh")}</Button><Button className="flex-1" variant="destructive" onPress={async () => { try { setResult(await cancelOwnedJob(runId)); setError(null); } ${options.i18n ? "catch {" : "catch (cause) {"} setError(${options.i18n ? i18n.value("cancelError", "Cancel failed") : 'cause instanceof Error ? cause.message : "Cancel failed"'}); } }}>${i18n.child("cancel", "Cancel")}</Button></View></CardContent></Card>
    {error ? <Alert variant="destructive" accessibilityRole="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {result !== null ? <Card><CardHeader><CardTitle>${i18n.child("result", "Result")}</CardTitle></CardHeader><CardContent><Text className="font-mono">{JSON.stringify(result, null, 2)}</Text></CardContent></Card> : null}
  </View></ScrollView>;
}
`;
}

function jobFilesForTarget(options: CapabilityClientOptions, target: ClientTarget): TemplateFile[] {
  const base = featureRoot(options.mode, target, "jobs");
  return [
    file(`${base}/queries.ts`, queriesContent()),
    file(`${base}/mutations.ts`, mutationsContent()),
    file(
      `${base}/page.tsx`,
      target === "mobile" ? expoPageContent(options) : domPageContent(options, target),
    ),
    routeFile(options, target, "jobs", "JobsPage", "jobs"),
  ];
}

export function jobClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.jobs) return [];
  return enabledTargets(options).flatMap((target) => jobFilesForTarget(options, target));
}
