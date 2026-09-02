import { file, type TemplateFile } from "../../shared.js";
import { notificationNavigationContent } from "../fragments/lib/notifications.js";
import {
  appRoot,
  enabledTargets,
  featureRoot,
  routeFile,
  type CapabilityClientOptions,
  type ClientTarget,
} from "./shared.js";

function clientLibRoot(options: CapabilityClientOptions, target: ClientTarget): string {
  return target === "desktop" && options.mode === "single" ? "@/renderer/lib" : "@/lib";
}

function queriesContent(options: CapabilityClientOptions, target: ClientTarget): string {
  return `import { orpcClient } from "${clientLibRoot(options, target)}/orpc";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function listNotificationInbox(): Promise<NotificationItem[]> {
  const result = await orpcClient.notifications.listInbox({ limit: 50, unreadOnly: false });
  return result.items;
}
`;
}

function mutationsContent(options: CapabilityClientOptions, target: ClientTarget): string {
  if (target === "web" && options.framework === "nextjs") {
    return `import { createSelfNotificationAction, markNotificationReadAction, registerNotificationDeviceAction } from "@/app/notifications/actions";

export function publishSelfNotification(input: { title: string; body: string }) { return createSelfNotificationAction(input); }
export function markNotificationRead(notificationId: string) { return markNotificationReadAction({ notificationId }); }
export function registerNotificationDevice(platform: "web" | "ios" | "android", pushToken: string) { return registerNotificationDeviceAction({ platform, pushToken }); }
`;
  }
  return `import { orpcClient } from "${clientLibRoot(options, target)}/orpc";

export function publishSelfNotification(input: { title: string; body: string }) {
  return orpcClient.notifications.createSelf({
    kind: "user.note",
    title: input.title,
    body: input.body,
    href: "/notifications",
    data: {},
  });
}

export function markNotificationRead(notificationId: string) {
  return orpcClient.notifications.markRead({ notificationId });
}

export function registerNotificationDevice(
  platform: "web" | "ios" | "android",
  pushToken: string,
) {
  return orpcClient.notifications.registerDevice({ platform, pushToken });
}
`;
}

function nextActionsContent(mode: CapabilityClientOptions["mode"]): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "${applicationModule}";

async function application() { return createRequestApplicationForRequest(new Headers(await headers())); }
export async function createSelfNotificationAction(input: unknown) {
  const parsed = z.object({ title: z.string().trim().min(1).max(160), body: z.string().max(2000) }).safeParse(input);
  if (!parsed.success) throw new Error("Invalid notification input");
  const result = await (await application()).notifications.createSelf({ kind: "user.note", title: parsed.data.title, body: parsed.data.body, href: "/notifications", data: {} });
  revalidatePath("/notifications"); return result;
}
export async function markNotificationReadAction(input: unknown) {
  const parsed = z.object({ notificationId: z.string().min(1).max(128) }).safeParse(input);
  if (!parsed.success) throw new Error("Invalid notification id");
  const result = await (await application()).notifications.markRead(parsed.data); revalidatePath("/notifications"); return result;
}
export async function registerNotificationDeviceAction(input: unknown) {
  const parsed = z.object({ platform: z.enum(["web", "ios", "android"]), pushToken: z.string().min(1).max(4096) }).safeParse(input);
  if (!parsed.success) throw new Error("Invalid notification device");
  return (await application()).notifications.registerDevice(parsed.data);
}
`;
}

function nextRouteContent(mode: CapabilityClientOptions["mode"]): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { NotificationsPage } from "@/features/notifications/page";

async function NotificationsData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  if (!me.user) redirect("/sign-in");
  const result = await application.notifications.listInbox({ limit: 50, unreadOnly: false });
  return <NotificationsPage initialItems={result.items} />;
}

export default function Page(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><NotificationsData /></Suspense>;
}
`;
}

function domPageContent(
  target: Extract<ClientTarget, "web" | "desktop">,
  options: CapabilityClientOptions,
): string {
  const desktop = target === "desktop";
  const next = target === "web" && options.framework === "nextjs";
  const i18nImport = !options.i18n
    ? ""
    : target === "web"
      ? 'import { useSurfaceTranslations } from "@/lib/translations";'
      : `import { useTranslations } from "${options.mode === "single" ? "@/renderer/lib/i18n" : "@/lib/i18n"}";`;
  const i18nState = !options.i18n
    ? ""
    : target === "web"
      ? '  const t = useSurfaceTranslations("notifications");\n'
      : '  const t = useTranslations("notifications");\n';
  const label = (key: string, fallback: string): string =>
    options.i18n ? `{t("${key}")}` : fallback;
  const routerImport = next
    ? 'import { useRouter } from "next/navigation";'
    : 'import { useNavigate } from "@tanstack/react-router";';
  const routerState = next ? "  const router = useRouter();" : "  const navigate = useNavigate();";
  const navigate = next
    ? "    router.push(destination);"
    : "    await navigate({ to: destination });";
  const componentParameters = next ? "{ initialItems }: { initialItems: NotificationItem[] }" : "";
  const initialItems = next ? "initialItems" : "[]";
  const initialLoading = next ? "false" : "true";
  const initialRefresh = next ? "" : "  React.useEffect(() => { void refresh(); }, [refresh]);";
  const publish = desktop
    ? `const created = await publishSelfNotification({ title, body });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(created.title, { body: created.body });
      }`
    : "await publishSelfNotification({ title, body });";
  return `"use client";
import * as React from "react";
${routerImport}
${i18nImport}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { resolveNotificationDestination } from "${clientLibRoot(options, target)}/notifications";
import { listNotificationInbox, type NotificationItem } from "./queries";
import { markNotificationRead, publishSelfNotification } from "./mutations";

export function NotificationsPage(${componentParameters}): React.JSX.Element {
${i18nState}${routerState}
  const [items, setItems] = React.useState<NotificationItem[]>(${initialItems});
  const [title, setTitle] = React.useState(${options.i18n ? 't("defaultTitle")' : '"Hello from GhostInit"'});
  const [body, setBody] = React.useState(${options.i18n ? 't("defaultBody")' : '"This notification is persisted for your account."'});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(${initialLoading});
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try { setItems(await listNotificationInbox()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("unavailable")' : '"Notifications unavailable"'}); }
    finally { setLoading(false); }
  }, []);
${initialRefresh}
  async function openNotification(item: NotificationItem): Promise<void> {
    const destination = resolveNotificationDestination(item.href);
    if (!destination) return;
    if (item.readAt === null) await markNotificationRead(item.id);
${navigate}
  }
  return <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <header><h1 className="text-2xl font-semibold">${label("title", "Notifications")}</h1><p className="text-sm text-muted-foreground">${label("description", "Account-owned inbox shared across your apps.")}</p></header>
    <Card><CardHeader><CardTitle>${label("create", "Create notification")}</CardTitle><CardDescription>${label("description", "Account-owned inbox shared across your apps.")}</CardDescription></CardHeader><CardContent><form onSubmit={async (event) => {
      event.preventDefault();
      try {
        ${publish}
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("createError")' : '"Notification could not be created"'}); }
    }}><FieldGroup>
      <Field><FieldLabel htmlFor="notification-title">${label("titleLabel", "Title")}</FieldLabel><Input id="notification-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></Field>
      <Field><FieldLabel htmlFor="notification-body">${label("bodyLabel", "Body")}</FieldLabel><Textarea id="notification-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} /></Field>
      <Button className="w-fit" type="submit">${label("create", "Create notification")}</Button>
    </FieldGroup></form></CardContent></Card>
    {error ? <Alert variant="destructive"><AlertTitle>${label("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <section aria-label=${options.i18n ? '{t("title")}' : '"Notifications"'} className="flex flex-col gap-2">{loading ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? <Empty><EmptyHeader><EmptyTitle>${label("empty", "No notifications yet.")}</EmptyTitle><EmptyDescription>${label("description", "Account-owned inbox shared across your apps.")}</EmptyDescription></EmptyHeader></Empty> : items.map((item) => {
      const destination = resolveNotificationDestination(item.href);
      return <Card key={item.id}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.body}</CardDescription></CardHeader><CardContent className="flex gap-2">{destination ? <Button type="button" size="sm" variant="outline" onClick={() => void openNotification(item)}>${label("open", "Open")}</Button> : null}<Button type="button" size="sm" variant="outline" disabled={item.readAt !== null} onClick={async () => { await markNotificationRead(item.id); await refresh(); }}>{item.readAt ? ${options.i18n ? 't("read")' : '"Read"'} : ${options.i18n ? 't("markRead")' : '"Mark read"'}}</Button></CardContent></Card>})}</section>
  </main>;
}
`;
}

function expoPageContent(options: CapabilityClientOptions): string {
  const i18nImport = options.i18n ? 'import { useTranslations } from "@/lib/i18n";' : "";
  const i18nState = options.i18n ? '  const t = useTranslations("notifications");\n' : "";
  const label = (key: string, fallback: string): string =>
    options.i18n ? `{t("${key}")}` : fallback;
  return `import * as React from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePushNotifications } from "@/hooks/use-push";
import { resolveNotificationDestination } from "@/lib/notifications";
${i18nImport}
import { listNotificationInbox, type NotificationItem } from "./queries";
import { markNotificationRead, publishSelfNotification, registerNotificationDevice } from "./mutations";

export function NotificationsPage(): React.JSX.Element {
${i18nState}  const router = useRouter();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [title, setTitle] = React.useState(${options.i18n ? 't("defaultTitle")' : '"Hello from GhostInit"'});
  const [body, setBody] = React.useState(${options.i18n ? 't("defaultBody")' : '"This notification is persisted for your account."'});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const push = usePushNotifications();
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try { setItems(await listNotificationInbox()); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("unavailable")' : '"Notifications unavailable"'}); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  async function openNotification(item: NotificationItem): Promise<void> {
    const destination = resolveNotificationDestination(item.href);
    if (!destination) return;
    if (item.readAt === null) await markNotificationRead(item.id);
    router.push(destination);
  }
  return <ScrollView className="flex-1 bg-background"><View className="gap-4 p-5">
    <Text className="text-2xl font-bold">${label("title", "Notifications")}</Text>
    <Card><CardHeader><CardTitle>${label("create", "Create notification")}</CardTitle><CardDescription>${label("description", "Account-owned inbox shared across your apps.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={title} onChangeText={setTitle} placeholder=${options.i18n ? '{t("titleLabel")}' : '"Title"'} maxLength={160} /><Input className="min-h-24 py-3" value={body} onChangeText={setBody} placeholder=${options.i18n ? '{t("bodyLabel")}' : '"Body"'} multiline maxLength={2000} /><Button onPress={async () => { try { await publishSelfNotification({ title, body }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("createError")' : '"Create failed"'}); } }}>${label("create", "Create notification")}</Button>{Platform.OS === "ios" || Platform.OS === "android" ? <Button variant="outline" onPress={async () => { const platform = Platform.OS; if (platform !== "ios" && platform !== "android") return; const token = await push.requestPermission(); if (token) await registerNotificationDevice(platform, token); }}>${label("enablePush", "Enable push notifications")}</Button> : null}</CardContent></Card>
    {error ? <Alert variant="destructive"><AlertTitle>${label("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {loading ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? <Card><CardHeader><CardTitle>${label("empty", "No notifications yet.")}</CardTitle><CardDescription>${label("description", "Account-owned inbox shared across your apps.")}</CardDescription></CardHeader></Card> : items.map((item) => { const destination = resolveNotificationDestination(item.href); return <Card key={item.id}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.body}</CardDescription></CardHeader><CardContent className="flex-row gap-2">{destination ? <Button size="sm" variant="outline" onPress={() => void openNotification(item)}>${label("open", "Open")}</Button> : null}<Button size="sm" variant="outline" disabled={item.readAt !== null} onPress={async () => { await markNotificationRead(item.id); await refresh(); }}>{item.readAt ? ${options.i18n ? 't("read")' : '"Read"'} : ${options.i18n ? 't("markRead")' : '"Mark read"'}}</Button></CardContent></Card>; })}
  </View></ScrollView>;
}
`;
}

function webBellContent(framework: CapabilityClientOptions["framework"]): string {
  const routerImport =
    framework === "nextjs"
      ? 'import { useRouter } from "next/navigation";'
      : 'import { useNavigate } from "@tanstack/react-router";';
  const routerState =
    framework === "nextjs" ? "  const router = useRouter();" : "  const navigate = useNavigate();";
  const navigate =
    framework === "nextjs" ? "router.push(destination)" : "void navigate({ to: destination })";
  return `"use client";
import * as React from "react";
${routerImport}
import { NotificationBell } from "@/components/NotificationBell";
import type { NotificationDestination } from "@/lib/notifications";
import { listNotificationInbox, type NotificationItem } from "./queries";
import { markNotificationRead } from "./mutations";

export function NotificationInboxBell(): React.JSX.Element {
${routerState}
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const refresh = React.useCallback(async () => { setItems(await listNotificationInbox()); }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return <NotificationBell
    notifications={items.map((item) => ({ id: item.id, type: item.kind, payload: { title: item.title, message: item.body, href: item.href }, readAt: item.readAt, createdAt: item.createdAt }))}
    onMarkRead={async (notificationId) => { await markNotificationRead(notificationId); await refresh(); }}
    onNavigate={(destination: NotificationDestination) => { ${navigate}; }}
  />;
}
`;
}

function notificationFilesForTarget(
  options: CapabilityClientOptions,
  target: ClientTarget,
): TemplateFile[] {
  const base = featureRoot(options.mode, target, "notifications");
  return [
    ...(target === "web"
      ? []
      : [
          file(
            `${target === "desktop" ? appRoot(options.mode, target) + "src/renderer" : appRoot(options.mode, target) + "src"}/lib/notifications.ts`,
            notificationNavigationContent(),
          ),
        ]),
    file(`${base}/queries.ts`, queriesContent(options, target)),
    file(`${base}/mutations.ts`, mutationsContent(options, target)),
    ...(target === "web" && options.framework === "nextjs"
      ? [
          file(
            `${appRoot(options.mode, target)}src/app/notifications/actions.ts`,
            nextActionsContent(options.mode),
          ),
        ]
      : []),
    file(
      `${base}/page.tsx`,
      target === "mobile" ? expoPageContent(options) : domPageContent(target, options),
    ),
    ...(target === "web" ? [file(`${base}/bell.tsx`, webBellContent(options.framework))] : []),
    ...(target === "web" && options.framework === "nextjs"
      ? [
          file(
            `${appRoot(options.mode, target)}src/app/notifications/page.tsx`,
            nextRouteContent(options.mode),
          ),
        ]
      : [routeFile(options, target, "notifications", "NotificationsPage", "notifications")]),
  ];
}

export function notificationClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.notifications) return [];
  return enabledTargets(options).flatMap((target) => notificationFilesForTarget(options, target));
}
