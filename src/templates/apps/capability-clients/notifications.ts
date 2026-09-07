import { file, type TemplateFile } from "../../shared.js";
import { notificationNavigationContent } from "../fragments/lib/notifications.js";
import { notificationComposerContent } from "./notifications-composer.js";
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
  const next = target === "web" && options.framework === "nextjs";
  return `import { useCallback${next ? ", useSyncExternalStore" : ""} } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { orpcClient } from "${clientLibRoot(options, target)}/orpc";
import { authScopedQueryKey, currentQueryAuthScope, queryAuthScopeSignature, type QueryAuthScope } from "${clientLibRoot(options, target)}/query-client";

export type NotificationScope = QueryAuthScope;

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

export function notificationInboxQueryOptions(queryClient: QueryClient, initialItems?: NotificationItem[], initialScope?: NotificationScope${next ? ", hydrating = false" : ""}) {
  ${next ? "const canonicalScope = currentQueryAuthScope(queryClient);\n  const scope = canonicalScope ?? (hydrating ? initialScope ?? null : null);" : "const scope = currentQueryAuthScope(queryClient);"}
  const initialData = initialScope && queryAuthScopeSignature(scope) === queryAuthScopeSignature(initialScope) ? initialItems : undefined;
  return {
    queryKey: scope ? authScopedQueryKey(scope, ["notifications", "inbox"]) : ["auth", "anonymous", "notifications"],
    queryFn: listNotificationInbox,
    enabled: ${next ? "canonicalScope" : "scope"} !== null,
    ...(initialData === undefined ? {} : { initialData }),
  };
}

export async function invalidateNotificationInbox(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: notificationInboxQueryOptions(queryClient).queryKey });
}

${next ? "const subscribeToHydration = () => () => undefined;\nconst clientSnapshot = () => true;\nconst serverSnapshot = () => false;\n\n" : ""}export function useNotificationInbox(initialItems?: NotificationItem[], initialScope?: NotificationScope) {
  ${next ? "const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);\n  " : ""}return useQuery(notificationInboxQueryOptions(useQueryClient(), initialItems, initialScope${next ? ", !hydrated" : ""}));
}

export function useInvalidateNotificationInbox(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => invalidateNotificationInbox(queryClient), [queryClient]);
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
  const initialScope = me.sessionId ? { userId: me.user.id, sessionId: me.sessionId, tenantId: me.activeOrganizationId, teamId: me.activeTeamId } : undefined;
  return <NotificationsPage initialItems={result.items} initialScope={initialScope} />;
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
  const componentParameters = next
    ? "{ initialItems, initialScope }: { initialItems: NotificationItem[]; initialScope?: NotificationScope }"
    : "";
  const initialQuery = next ? "initialItems, initialScope" : "";
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
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationComposer } from "./components/notification-composer";
import { useAuthOwnedEffect } from "${desktop && options.mode === "single" ? "@/renderer/hooks" : "@/hooks"}/use-auth-owned-effect";
import { resolveNotificationDestination } from "${clientLibRoot(options, target)}/notifications";
import { useInvalidateNotificationInbox, useNotificationInbox, type NotificationItem${next ? ", type NotificationScope" : ""} } from "./queries";
import { markNotificationRead, publishSelfNotification } from "./mutations";

export function NotificationsPage(${componentParameters}): React.JSX.Element {
${i18nState}${routerState}
  const captureEffect = useAuthOwnedEffect();
  const invalidateInbox = useInvalidateNotificationInbox();
  const actionInFlight = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const inbox = useNotificationInbox(${initialQuery});
  const items = inbox.data ?? [];
  const [title, setTitle] = React.useState(${options.i18n ? 't("defaultTitle")' : '"Hello from GhostInit"'});
  const [body, setBody] = React.useState(${options.i18n ? 't("defaultBody")' : '"This notification is persisted for your account."'});
  const [error, setError] = React.useState<string | null>(null);
  const displayedError = error ?? (inbox.error ? ${options.i18n ? 't("unavailable")' : '"Notifications unavailable"'} : null);
  const refresh = React.useCallback(async () => {
    setError(null);
    await inbox.refetch();
  }, [inbox.refetch]);
  async function runAction(action: () => Promise<void>): Promise<void> {
    const isCurrent = captureEffect();
    if (actionInFlight.current || !isCurrent()) return;
    actionInFlight.current = true;
    setPending(true);
    setError(null);
    try { await action(); if (isCurrent()) await invalidateInbox(); }
    catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("unavailable")' : '"Notification action failed"'}); }
    finally { actionInFlight.current = false; if (isCurrent()) setPending(false); }
  }
  async function openNotification(item: NotificationItem): Promise<void> {
    const isCurrent = captureEffect();
    const destination = resolveNotificationDestination(item.href);
    if (!destination || !isCurrent()) return;
    if (item.readAt === null) await markNotificationRead(item.id);
    if (!isCurrent()) return;
${navigate}
  }
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${label("title", "Notifications")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${label("description", "Updates and activity for your account.")}</p></header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
    <NotificationComposer title={title} body={body} pending={pending} onTitleChange={setTitle} onBodyChange={setBody} onSubmit={() => {
      void runAction(async () => {
        ${publish}
      });
    }} />
    <div className="flex min-w-0 flex-col gap-4">
    {displayedError ? <Alert variant="destructive"><AlertTitle>${label("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription className="flex flex-col items-start gap-3">{displayedError}{inbox.error ? <Button type="button" size="sm" variant="outline" disabled={inbox.isFetching || pending} onClick={() => void refresh()}>${label("retry", "Retry")}</Button> : null}</AlertDescription></Alert> : null}
    <section aria-label=${options.i18n ? '{t("title")}' : '"Notifications"'} className="flex flex-col gap-2" aria-busy={inbox.isFetching}>{inbox.isPending && items.length === 0 ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? inbox.error ? null : <Empty><EmptyHeader><EmptyTitle>${label("empty", "No notifications yet.")}</EmptyTitle><EmptyDescription>${label("description", "Updates and activity for your account.")}</EmptyDescription></EmptyHeader></Empty> : items.map((item) => {
      const destination = resolveNotificationDestination(item.href);
      return <Card key={item.id}><CardHeader className="p-4 sm:p-5"><CardTitle as="h2" className="break-words text-base">{item.title}</CardTitle><CardDescription className="whitespace-pre-wrap break-words">{item.body}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5 sm:pb-5">{destination ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void runAction(() => openNotification(item))}>${label("open", "Open")}</Button> : null}<Button type="button" size="sm" variant="outline" disabled={pending || item.readAt !== null} onClick={() => void runAction(async () => { await markNotificationRead(item.id); })}>{item.readAt ? ${options.i18n ? 't("read")' : '"Read"'} : ${options.i18n ? 't("markRead")' : '"Mark read"'}}</Button></CardContent></Card>})}</section>
    </div></div>
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
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { resolveNotificationDestination } from "@/lib/notifications";
${i18nImport}
import { useInvalidateNotificationInbox, useNotificationInbox, type NotificationItem } from "./queries";
import { markNotificationRead, publishSelfNotification, registerNotificationDevice } from "./mutations";

export function NotificationsPage(): React.JSX.Element {
${i18nState}  const router = useRouter();
  const captureEffect = useAuthOwnedEffect();
  const invalidateInbox = useInvalidateNotificationInbox();
  const actionInFlight = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const inbox = useNotificationInbox();
  const items = inbox.data ?? [];
  const loading = inbox.isPending;
  const [title, setTitle] = React.useState(${options.i18n ? 't("defaultTitle")' : '"Hello from GhostInit"'});
  const [body, setBody] = React.useState(${options.i18n ? 't("defaultBody")' : '"This notification is persisted for your account."'});
  const [error, setError] = React.useState<string | null>(null);
  const displayedError = error ?? (inbox.error ? ${options.i18n ? 't("unavailable")' : '"Notifications unavailable"'} : null);
  const push = usePushNotifications();
  const refresh = React.useCallback(async () => {
    setError(null);
    await inbox.refetch();
  }, [inbox.refetch]);
  async function runAction(action: () => Promise<void>): Promise<void> {
    const isCurrent = captureEffect();
    if (actionInFlight.current || !isCurrent()) return;
    actionInFlight.current = true;
    setPending(true);
    setError(null);
    try { await action(); if (isCurrent()) await invalidateInbox(); }
    catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : ${options.i18n ? 't("unavailable")' : '"Notification action failed"'}); }
    finally { actionInFlight.current = false; if (isCurrent()) setPending(false); }
  }
  async function openNotification(item: NotificationItem): Promise<void> {
    const isCurrent = captureEffect();
    const destination = resolveNotificationDestination(item.href);
    if (!destination || !isCurrent()) return;
    if (item.readAt === null) await markNotificationRead(item.id);
    if (!isCurrent()) return;
    router.push(destination);
  }
  return <ScrollView className="flex-1 bg-background"><View className="gap-4 p-5">
    <Text className="text-2xl font-bold">${label("title", "Notifications")}</Text>
    <Card><CardHeader><CardTitle>${label("create", "Create notification")}</CardTitle><CardDescription>${label("description", "Updates and activity for your account.")}</CardDescription></CardHeader><CardContent className="gap-3"><Input value={title} onChangeText={setTitle} placeholder=${options.i18n ? '{t("titleLabel")}' : '"Title"'} maxLength={160} /><Input className="min-h-24 py-3" value={body} onChangeText={setBody} placeholder=${options.i18n ? '{t("bodyLabel")}' : '"Body"'} multiline maxLength={2000} /><Button disabled={pending || !title.trim()} isLoading={pending} onPress={() => void runAction(async () => { await publishSelfNotification({ title, body }); })}>${label("create", "Create notification")}</Button>{Platform.OS === "ios" || Platform.OS === "android" ? <Button variant="outline" disabled={pending} onPress={() => void runAction(async () => { const platform = Platform.OS; if (platform !== "ios" && platform !== "android") return; const token = await push.requestPermission(); if (token) await registerNotificationDevice(platform, token); })}>${label("enablePush", "Enable push notifications")}</Button> : null}</CardContent></Card>
    {displayedError ? <Alert variant="destructive"><AlertTitle>${label("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription>{displayedError}</AlertDescription>{inbox.error ? <Button variant="outline" size="sm" disabled={pending || inbox.isFetching} onPress={() => void refresh()}>${label("retry", "Retry")}</Button> : null}</Alert> : null}
    {loading && items.length === 0 ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? inbox.error ? null : <Card><CardHeader><CardTitle>${label("empty", "No notifications yet.")}</CardTitle><CardDescription>${label("description", "Updates and activity for your account.")}</CardDescription></CardHeader></Card> : items.map((item) => { const destination = resolveNotificationDestination(item.href); return <Card key={item.id}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.body}</CardDescription></CardHeader><CardContent className="flex-row gap-2">{destination ? <Button size="sm" variant="outline" disabled={pending} onPress={() => void runAction(() => openNotification(item))}>${label("open", "Open")}</Button> : null}<Button size="sm" variant="outline" disabled={pending || item.readAt !== null} onPress={() => void runAction(async () => { await markNotificationRead(item.id); })}>{item.readAt ? ${options.i18n ? 't("read")' : '"Read"'} : ${options.i18n ? 't("markRead")' : '"Mark read"'}}</Button></CardContent></Card>; })}
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
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import type { NotificationDestination } from "@/lib/notifications";
import { useInvalidateNotificationInbox, useNotificationInbox } from "./queries";
import { markNotificationRead } from "./mutations";

export function NotificationInboxBell(): React.JSX.Element {
${routerState}
  const captureEffect = useAuthOwnedEffect();
  const invalidateInbox = useInvalidateNotificationInbox();
  const inbox = useNotificationInbox();
  const items = inbox.data ?? [];
  return <NotificationBell
    captureAction={captureEffect}
    notifications={items.map((item) => ({ id: item.id, type: item.kind, payload: { title: item.title, message: item.body, href: item.href }, readAt: item.readAt, createdAt: item.createdAt }))}
    loading={inbox.isPending}
    loadError={Boolean(inbox.error)}
    onRetry={() => void inbox.refetch()}
    onMarkRead={async (notificationId) => { const isCurrent = captureEffect(); await markNotificationRead(notificationId); if (isCurrent()) await invalidateInbox(); }}
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
    ...(target === "mobile"
      ? []
      : [
          file(
            `${base}/components/notification-composer.tsx`,
            notificationComposerContent(target, options),
          ),
        ]),
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
