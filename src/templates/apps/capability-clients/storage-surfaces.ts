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
    ? webSurfaceI18nTemplate("storage")
    : nativeI18nTemplate(options.i18n, "storage", nativeI18nImportPath(target, options.mode));
}

function queriesContent(): string {
  return `import { orpcClient } from "@/lib/orpc";
// Binary downloads are explicit actions and are never route-dehydrated query data.
export function downloadObjectBase64(id: string) { return orpcClient.storage.downloadBase64({ id }); }
`;
}

function mutationsContent(): string {
  return `import { orpcClient } from "@/lib/orpc";
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
export function uploadTextObject(input: { originalName: string; text: string }) {
  return orpcClient.storage.uploadBase64({ base64: utf8ToBase64(input.text), mimeType: "text/plain", originalName: input.originalName });
}
export function removeStoredObject(id: string) { return orpcClient.storage.remove({ id }); }
`;
}

function workflowContent(options: CapabilityClientOptions, target: ClientTarget): string {
  const i18n = translations(options, target);
  return `"use client";
${target === "mobile" ? 'import { useForm, useStore } from "@tanstack/react-form";' : 'import { useAppForm, useStore } from "@/components/ui/form";'}
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { downloadObjectBase64 } from "./queries";
import { removeStoredObject, uploadTextObject } from "./mutations";
${i18n.importLine}

type StorageAction = { kind: "upload"; name: string; text: string } | { kind: "download" | "remove"; id: string };
function textFromBase64(value: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(value), character => character.charCodeAt(0)));
}
export function useStorageWorkspace() {
${i18n.hookLine}
  const uploadForm = ${target === "mobile" ? "useForm" : "useAppForm"}({
    defaultValues: { name: "note.txt", text: ${i18n.value("defaultText", "Stored securely by GhostInit.")} },
    onSubmit: async ({ value }): Promise<void> => { await mutation.run({ kind: "upload", ...value }); },
  });
  const objectForm = ${target === "mobile" ? "useForm" : "useAppForm"}({
    defaultValues: { objectId: "" },
    onSubmit: async ({ value }): Promise<void> => { await mutation.run({ kind: "download", id: value.objectId }); },
  });
  const { name, text } = useStore(uploadForm.store, state => state.values);
  const objectId = useStore(objectForm.store, state => state.values.objectId);
  const setName = (value: string): void => { uploadForm.setFieldValue("name", value); };
  const setText = (value: string): void => { uploadForm.setFieldValue("text", value); };
  const setObjectId = (value: string): void => { objectForm.setFieldValue("objectId", value); };
  const mutation = useAuthOwnedMutation(async (action: StorageAction) => {
    if (action.kind === "upload") return { kind: "upload" as const, stored: await uploadTextObject({ originalName: action.name, text: action.text }) };
    if (action.kind === "download") return { kind: "download" as const, text: textFromBase64((await downloadObjectBase64(action.id)).base64) };
    await removeStoredObject(action.id);
    return { kind: "remove" as const };
  }, { onSuccess: (result) => { if (result.kind === "upload") setObjectId(result.stored.id); } });
  const action = mutation.variables?.kind;
  const status = mutation.error
    ? action === "upload" ? ${i18n.value("uploadError", "Upload failed")} : action === "download" ? ${i18n.value("downloadError", "Download failed")} : ${i18n.value("removeError", "Remove failed")}
    : mutation.data?.kind === "upload" ? ${i18n.value("uploaded", "Uploaded")} : mutation.data?.kind === "download" ? ${i18n.value("downloaded", "Downloaded")} : mutation.data?.kind === "remove" ? ${i18n.value("removed", "Removed")} : null;
  return {
    objectId, setObjectId, name, setName, text, setText, status, isPending: mutation.isPending,
    downloaded: mutation.data?.kind === "download" ? mutation.data.text : "",
    upload: () => { void uploadForm.handleSubmit(); },
    download: () => { void objectForm.handleSubmit(); },
    remove: () => { void mutation.run({ kind: "remove", id: objectForm.state.values.objectId }); },
  };
}
`;
}

function screenContent(): string {
  return `"use client";
import type * as React from "react";
import { StorageWorkspace } from "./components/storage-workspace";
import { useStorageWorkspace } from "./use-storage-workspace";
export function StoragePage(): React.JSX.Element { return <StorageWorkspace {...useStorageWorkspace()} />; }
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
${mobile ? "" : 'import { Textarea } from "@/components/ui/textarea";'}
import type { useStorageWorkspace } from "../use-storage-workspace";
${i18n.importLine}

export function StorageWorkspace({ objectId, setObjectId, name, setName, text, setText, downloaded, status, isPending, upload, download, remove }: ReturnType<typeof useStorageWorkspace>): React.JSX.Element {
${i18n.hookLine}
${
  mobile
    ? `  return <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Storage")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("description", "Upload, download, and manage your files.")}</Text></View>
    {isPending ? <Text accessibilityRole="alert">${i18n.child("pending", "Working…")}</Text> : null}
    <Card><CardHeader><CardTitle>${i18n.child("upload", "Upload")}</CardTitle></CardHeader><CardContent className="gap-3">
      <Text>${i18n.child("fileName", "File name")}</Text><Input editable={!isPending} value={name} onChangeText={setName} maxLength={255} />
      <Text>${i18n.child("textContent", "Text content")}</Text><Input multiline className="min-h-24 py-3" editable={!isPending} value={text} onChangeText={setText} />
      <Button disabled={isPending} onPress={upload}><Text>${i18n.child("upload", "Upload")}</Text></Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>${i18n.child("download", "Download")}</CardTitle></CardHeader><CardContent className="gap-3">
      <Text>${i18n.child("objectId", "Object ID")}</Text><Input editable={!isPending} value={objectId} onChangeText={setObjectId} />
      <View className="flex-row flex-wrap gap-2"><Button disabled={isPending} variant="outline" onPress={download}><Text>${i18n.child("download", "Download")}</Text></Button><Button disabled={isPending} variant="destructive" onPress={remove}><Text>${i18n.child("remove", "Remove")}</Text></Button></View>
    </CardContent></Card>
    {status ? <Text accessibilityRole="alert">{status}</Text> : null}
    {downloaded ? <Card><CardHeader><CardTitle>${i18n.child("downloaded", "Downloaded")}</CardTitle></CardHeader><CardContent><Text selectable>{downloaded}</Text></CardContent></Card> : null}
  </View></ScrollView>;`
    : `  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("title", "Storage")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${i18n.child("description", "Upload, download, and manage your files.")}</p></header>
    {isPending ? <p role="status">${i18n.child("pending", "Working…")}</p> : null}
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle as="h2">${i18n.child("upload", "Upload")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
        <Field><FieldLabel htmlFor="storage-file-name">${i18n.child("fileName", "File name")}</FieldLabel><Input disabled={isPending} id="storage-file-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} /></Field>
        <Field><FieldLabel htmlFor="storage-text-content">${i18n.child("textContent", "Text content")}</FieldLabel><Textarea disabled={isPending} id="storage-text-content" value={text} onChange={(event) => setText(event.target.value)} /></Field>
        <Button disabled={isPending} aria-busy={isPending} className="w-fit" onClick={upload}>${i18n.child("upload", "Upload")}</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle as="h2">${i18n.child("download", "Download")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
        <Field><FieldLabel htmlFor="storage-object-id">${i18n.child("objectId", "Object ID")}</FieldLabel><Input disabled={isPending} id="storage-object-id" value={objectId} onChange={(event) => setObjectId(event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2"><Button disabled={isPending} aria-busy={isPending} variant="outline" onClick={download}>${i18n.child("download", "Download")}</Button><Button disabled={isPending} aria-busy={isPending} variant="destructive" onClick={remove}>${i18n.child("remove", "Remove")}</Button></div>
      </CardContent></Card>
    </div>
    {status ? <Alert><AlertDescription>{status}</AlertDescription></Alert> : null}
    {downloaded ? <Card><CardHeader><CardTitle as="h2">${i18n.child("downloaded", "Downloaded")}</CardTitle></CardHeader><CardContent><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-sm">{downloaded}</pre></CardContent></Card> : null}
  </main>;`
}
}
`;
}

export function storageClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.storage) return [];
  return enabledTargets(options).flatMap((target) => {
    const base = featureRoot(options.mode, target, "storage");
    return [
      file(`${base}/queries.ts`, queriesContent()),
      file(`${base}/mutations.ts`, mutationsContent()),
      file(`${base}/use-storage-workspace.ts`, workflowContent(options, target)),
      file(`${base}/components/storage-workspace.tsx`, presentationContent(options, target)),
      file(`${base}/page.tsx`, screenContent()),
      routeFile(options, target, "storage", "StoragePage", "storage"),
    ];
  });
}
