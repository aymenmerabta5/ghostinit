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

function mutationsContent(): string {
  return `import { orpcClient } from "@/lib/orpc";

// This surface has no collection/list use case to preload. Uploads and owned-object
// downloads are explicit binary/base64 HTTP operations and stay outside Query dehydration.

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function uploadTextObject(input: { originalName: string; text: string }) {
  return orpcClient.storage.uploadBase64({
    base64: utf8ToBase64(input.text),
    mimeType: "text/plain",
    originalName: input.originalName,
  });
}

export function downloadObjectBase64(id: string) {
  return orpcClient.storage.downloadBase64({ id });
}

export function removeStoredObject(id: string) {
  return orpcClient.storage.remove({ id });
}

export function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
`;
}

function domPageContent(options: CapabilityClientOptions, target: "web" | "desktop"): string {
  const i18n =
    target === "web"
      ? webSurfaceI18nTemplate("storage")
      : nativeI18nTemplate(options.i18n, "storage", nativeI18nImportPath(target, options.mode));
  return `"use client";
import * as React from "react";
import { useAuthOwnedAction } from "@/hooks/use-auth-owned-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { base64ToUtf8, downloadObjectBase64, removeStoredObject, uploadTextObject } from "./mutations";
${i18n.importLine}

export function StoragePage(): React.JSX.Element {
${i18n.hookLine}
  const [objectId, setObjectId] = React.useState("");
  const [name, setName] = React.useState("note.txt");
  const [text, setText] = React.useState(${i18n.value("defaultText", "Stored securely by GhostInit.")});
  const [downloaded, setDownloaded] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const { isPending, run } = useAuthOwnedAction();
  function upload(): void {
    void run(() => uploadTextObject({ originalName: name, text }), (stored) => {
      setObjectId(stored.id); setStatus(${i18n.value("uploaded", "Uploaded")});
    }, () => setStatus(${i18n.value("uploadError", "Upload failed")}));
  }
  function download(): void {
    void run(() => downloadObjectBase64(objectId), (value) => {
      setDownloaded(base64ToUtf8(value.base64)); setStatus(${i18n.value("downloaded", "Downloaded")});
    }, () => setStatus(${i18n.value("downloadError", "Download failed")}));
  }
  function remove(): void {
    void run(() => removeStoredObject(objectId), () => {
      setDownloaded(""); setStatus(${i18n.value("removed", "Removed")});
    }, () => setStatus(${i18n.value("removeError", "Remove failed")}));
  }

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("title", "Storage")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${i18n.child("description", "Upload, download, and manage your files.")}</p></header>
    {isPending ? <p role="status">${i18n.child("pending", "Working…")}</p> : null}
    <div className="grid items-start gap-6 xl:grid-cols-2">
    <Card>
      <CardHeader><CardTitle as="h2">${i18n.child("upload", "Upload")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field><FieldLabel htmlFor="storage-file-name">${i18n.child("fileName", "File name")}</FieldLabel><Input disabled={isPending} id="storage-file-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} /></Field>
        <Field><FieldLabel htmlFor="storage-text-content">${i18n.child("textContent", "Text content")}</FieldLabel><Textarea disabled={isPending} id="storage-text-content" value={text} onChange={(event) => setText(event.target.value)} /></Field>
        <Button disabled={isPending} aria-busy={isPending} className="w-fit" onClick={upload}>${i18n.child("upload", "Upload")}</Button>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle as="h2">${i18n.child("download", "Download")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field><FieldLabel htmlFor="storage-object-id">${i18n.child("objectId", "Object ID")}</FieldLabel><Input disabled={isPending} id="storage-object-id" value={objectId} onChange={(event) => setObjectId(event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2"><Button disabled={isPending} aria-busy={isPending} variant="outline" onClick={download}>${i18n.child("download", "Download")}</Button><Button disabled={isPending} aria-busy={isPending} variant="destructive" onClick={remove}>${i18n.child("remove", "Remove")}</Button></div>
        {downloaded ? <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-4 text-xs leading-6">{downloaded}</pre> : null}
      </CardContent>
    </Card>
    </div>
    {status ? <Alert><AlertDescription role="status">{status}</AlertDescription></Alert> : null}
  </main>;
}
`;
}

function expoPageContent(options: CapabilityClientOptions): string {
  const i18n = nativeI18nTemplate(
    options.i18n,
    "storage",
    nativeI18nImportPath("mobile", options.mode),
  );
  return `import * as React from "react";
import { useAuthOwnedAction } from "@/hooks/use-auth-owned-action";
import { ScrollView, Text, View } from "react-native";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { base64ToUtf8, downloadObjectBase64, removeStoredObject, uploadTextObject } from "./mutations";
${i18n.importLine}

export function StoragePage(): React.JSX.Element {
${i18n.hookLine}
  const [objectId, setObjectId] = React.useState("");
  const [name, setName] = React.useState("note.txt");
  const [text, setText] = React.useState(${i18n.value("defaultText", "Stored securely by GhostInit.")});
  const [downloaded, setDownloaded] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const { isPending, run } = useAuthOwnedAction();
  function upload(): void {
    void run(() => uploadTextObject({ originalName: name, text }), (stored) => {
      setObjectId(stored.id); setStatus(${i18n.value("uploaded", "Uploaded")});
    }, () => setStatus(${i18n.value("uploadError", "Upload failed")}));
  }
  function download(): void {
    void run(() => downloadObjectBase64(objectId), (value) => {
      setDownloaded(base64ToUtf8(value.base64)); setStatus(${i18n.value("downloaded", "Downloaded")});
    }, () => setStatus(${i18n.value("downloadError", "Download failed")}));
  }
  function remove(): void {
    void run(() => removeStoredObject(objectId), () => {
      setDownloaded(""); setStatus(${i18n.value("removed", "Removed")});
    }, () => setStatus(${i18n.value("removeError", "Remove failed")}));
  }

  return <ScrollView className="flex-1 bg-background"><View className="gap-4 p-5">
    <Text className="text-2xl font-bold">${i18n.child("title", "Storage")}</Text>
    {isPending ? <Text accessibilityLiveRegion="polite">${i18n.child("pending", "Working…")}</Text> : null}
    <Card><CardHeader><CardTitle>${i18n.child("upload", "Upload")}</CardTitle><CardDescription>${i18n.child("textContent", "Text content")}</CardDescription></CardHeader><CardContent className="gap-3"><Input editable={!isPending} value={name} onChangeText={setName} placeholder={${i18n.value("fileName", "File name")}} /><Input editable={!isPending} className="min-h-28 py-3" value={text} onChangeText={setText} multiline placeholder={${i18n.value("textContent", "Text content")}} /><Button disabled={isPending} accessibilityState={{ busy: isPending }} onPress={upload}>${i18n.child("upload", "Upload")}</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>${i18n.child("objectId", "Object ID")}</CardTitle><CardDescription>${i18n.child("download", "Download or remove an owned object")}</CardDescription></CardHeader><CardContent className="gap-3"><Input editable={!isPending} value={objectId} onChangeText={setObjectId} placeholder={${i18n.value("objectId", "Object ID")}} /><View className="flex-row gap-2"><Button disabled={isPending} accessibilityState={{ busy: isPending }} className="flex-1" variant="outline" onPress={download}>${i18n.child("download", "Download")}</Button><Button disabled={isPending} accessibilityState={{ busy: isPending }} className="flex-1" variant="destructive" onPress={remove}>${i18n.child("remove", "Remove")}</Button></View>{downloaded ? <Text className="font-mono text-sm">{downloaded}</Text> : null}</CardContent></Card>
    {status ? <Alert accessibilityRole="alert"><AlertDescription>{status}</AlertDescription></Alert> : null}
  </View></ScrollView>;
}
`;
}

function storageFilesForTarget(
  options: CapabilityClientOptions,
  target: ClientTarget,
): TemplateFile[] {
  const base = featureRoot(options.mode, target, "storage");
  return [
    file(`${base}/mutations.ts`, mutationsContent()),
    file(
      `${base}/page.tsx`,
      target === "mobile" ? expoPageContent(options) : domPageContent(options, target),
    ),
    routeFile(options, target, "storage", "StoragePage", "storage"),
  ];
}

export function storageClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.storage) return [];
  return enabledTargets(options).flatMap((target) => storageFilesForTarget(options, target));
}
