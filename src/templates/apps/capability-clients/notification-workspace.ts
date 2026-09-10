import type { CapabilityClientOptions, ClientTarget } from "./shared.js";
import {
  nativeI18nImportPath,
  nativeI18nTemplate,
  webSurfaceI18nTemplate,
} from "../fragments/native-i18n.js";

function translations(options: CapabilityClientOptions, target: ClientTarget) {
  return target === "web"
    ? webSurfaceI18nTemplate("notifications")
    : nativeI18nTemplate(options.i18n, "notifications", nativeI18nImportPath(target, options.mode));
}

export function notificationScreenContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const next = target === "web" && options.framework === "nextjs";
  return `"use client";
import type * as React from "react";
import { NotificationsWorkspace } from "./components/notifications-workspace";
import { useNotificationWorkspace } from "./use-notification-workspace";
${next ? 'import type { NotificationItem, NotificationScope } from "./queries";' : ""}
export function NotificationsPage(${next ? "{ initialItems, initialScope }: { initialItems: NotificationItem[]; initialScope?: NotificationScope }" : ""}): React.JSX.Element {
  return <NotificationsWorkspace {...useNotificationWorkspace(${next ? "initialItems, initialScope" : ""})} />;
}
`;
}

export function notificationWorkflowContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const i18n = translations(options, target);
  const mobile = target === "mobile";
  const next = target === "web" && options.framework === "nextjs";
  const routerImport = mobile
    ? 'import { Platform } from "react-native";\nimport { useRouter } from "expo-router";\nimport { usePushNotifications } from "@/hooks/use-push";'
    : next
      ? 'import { useRouter } from "next/navigation";'
      : 'import { useNavigate } from "@tanstack/react-router";';
  const router = mobile || next ? "const router = useRouter();" : "const navigate = useNavigate();";
  const navigate =
    mobile || next
      ? "router.push(result.destination);"
      : "await navigate({ to: result.destination });";
  return `"use client";
${mobile ? 'import { useForm, useStore } from "@tanstack/react-form";' : 'import { useAppForm, useStore } from "@/components/ui/form";'}
${routerImport}
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { resolveNotificationDestination } from "@/lib/notifications";
import { useNotificationInbox, useInvalidateNotificationInbox, type NotificationItem, type NotificationScope } from "./queries";
import { markNotificationRead, publishSelfNotification${mobile ? ", registerNotificationDevice" : ""} } from "./mutations";
${i18n.importLine}

type NotificationAction = { kind: "publish"; title: string; body: string } | { kind: "mark"; id: string } | { kind: "open"; item: NotificationItem }${mobile ? ' | { kind: "push" }' : ""};
export function useNotificationWorkspace(initialItems?: NotificationItem[], initialScope?: NotificationScope) {
${i18n.hookLine}
  ${router}
  ${mobile ? "const push = usePushNotifications();" : ""}
  const inbox = useNotificationInbox(initialItems, initialScope);
  const invalidateInbox = useInvalidateNotificationInbox();
  const form = ${mobile ? "useForm" : "useAppForm"}({
    defaultValues: { title: ${i18n.value("defaultTitle", "Hello from GhostInit")}, body: ${i18n.value("defaultBody", "This notification is persisted for your account.")} },
    onSubmit: async ({ value }): Promise<void> => { await mutation.run({ kind: "publish", ...value }); },
  });
  const { title, body } = useStore(form.store, state => state.values);
  const setTitle = (value: string): void => { form.setFieldValue("title", value); };
  const setBody = (value: string): void => { form.setFieldValue("body", value); };
  const mutation = useAuthOwnedMutation(async (action: NotificationAction, ${target === "web" ? "_isCurrent" : "isCurrent"}) => {
    if (action.kind === "publish") {
      ${
        target === "desktop"
          ? `const created = await publishSelfNotification(action);
      if (isCurrent() && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(created.title, { body: created.body });`
          : "await publishSelfNotification(action);"
      }
    } else if (action.kind === "mark") await markNotificationRead(action.id);
    else if (action.kind === "open") {
      const destination = resolveNotificationDestination(action.item.href);
      if (destination && action.item.readAt === null) await markNotificationRead(action.item.id);
      return { destination };
    }${
      mobile
        ? ` else {
      const platform = Platform.OS;
      if (platform === "ios" || platform === "android") {
        const token = await push.requestPermission();
        if (isCurrent() && token) await registerNotificationDevice(platform, token);
      }
    }`
        : ""
    }
    return { destination: null };
  }, { onSuccess: async (result, _action, isCurrent) => {
    await invalidateInbox();
    if (isCurrent() && result.destination) { ${navigate} }
  } });
  return {
    title, setTitle, body, setBody, items: inbox.data ?? [],
    pending: mutation.isPending, loading: inbox.isPending, refreshing: inbox.isFetching, loadError: Boolean(inbox.error),
    displayedError: mutation.error?.message ?? (inbox.error ? ${i18n.value("unavailable", "Notifications unavailable")} : null),
    refresh: () => { mutation.reset(); void inbox.refetch(); },
    publish: () => { void form.handleSubmit(); },
    open: (item: NotificationItem) => { void mutation.run({ kind: "open", item }); },
    markRead: (id: string) => { void mutation.run({ kind: "mark", id }); },
    ${mobile ? 'canEnablePush: Platform.OS === "ios" || Platform.OS === "android",\n    enablePush: () => { void mutation.run({ kind: "push" }); },' : ""}
  };
}
`;
}

export function notificationWorkspaceContent(
  options: CapabilityClientOptions,
  target: ClientTarget,
): string {
  const i18n = translations(options, target);
  const mobile = target === "mobile";
  return `"use client";
import type * as React from "react";
${mobile ? 'import { ScrollView, View, Text } from "react-native";\nimport { Input } from "@/components/ui/input";' : 'import { NotificationComposer } from "./notification-composer";\nimport { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";'}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveNotificationDestination } from "@/lib/notifications";
import type { useNotificationWorkspace } from "../use-notification-workspace";
${i18n.importLine}

export function NotificationsWorkspace({ title, setTitle, body, setBody, items, pending, loading, refreshing, loadError, displayedError, refresh, publish, open, markRead${mobile ? ", canEnablePush, enablePush" : ""} }: ReturnType<typeof useNotificationWorkspace>): React.JSX.Element {
${i18n.hookLine}
${
  mobile
    ? `  return <ScrollView className="flex-1 bg-background"><View className="gap-4 p-5">
    <Text className="text-2xl font-bold">${i18n.child("title", "Notifications")}</Text>
    <Card><CardHeader><CardTitle>${i18n.child("create", "Create notification")}</CardTitle><CardDescription>${i18n.child("description", "Updates and activity for your account.")}</CardDescription></CardHeader><CardContent className="gap-3">
      <Input value={title} onChangeText={setTitle} placeholder={${i18n.value("titleLabel", "Title")}} maxLength={160} />
      <Input className="min-h-24 py-3" value={body} onChangeText={setBody} placeholder={${i18n.value("bodyLabel", "Body")}} multiline maxLength={2000} />
      <Button disabled={pending || !title.trim()} isLoading={pending} onPress={publish}>${i18n.child("create", "Create notification")}</Button>
      {canEnablePush ? <Button variant="outline" disabled={pending} onPress={enablePush}>${i18n.child("enablePush", "Enable push notifications")}</Button> : null}
    </CardContent></Card>
    {displayedError ? <Alert variant="destructive"><AlertTitle>${i18n.child("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription>{displayedError}</AlertDescription>{loadError ? <Button variant="outline" size="sm" disabled={pending || refreshing} onPress={refresh}>${i18n.child("retry", "Retry")}</Button> : null}</Alert> : null}
    {loading && items.length === 0 ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? loadError ? null : <Card><CardHeader><CardTitle>${i18n.child("empty", "No notifications yet.")}</CardTitle><CardDescription>${i18n.child("description", "Updates and activity for your account.")}</CardDescription></CardHeader></Card> : items.map((item) => <Card key={item.id}><CardHeader><CardTitle>{item.title}</CardTitle><CardDescription>{item.body}</CardDescription></CardHeader><CardContent className="flex-row gap-2">{resolveNotificationDestination(item.href) ? <Button size="sm" variant="outline" disabled={pending} onPress={() => open(item)}>${i18n.child("open", "Open")}</Button> : null}<Button size="sm" variant="outline" disabled={pending || item.readAt !== null} onPress={() => markRead(item.id)}>{item.readAt ? ${i18n.value("read", "Read")} : ${i18n.value("markRead", "Mark read")}}</Button></CardContent></Card>)}
  </View></ScrollView>;`
    : `  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <header className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("title", "Notifications")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${i18n.child("description", "Updates and activity for your account.")}</p></header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <NotificationComposer title={title} body={body} pending={pending} onTitleChange={setTitle} onBodyChange={setBody} onSubmit={publish} />
      <div className="flex min-w-0 flex-col gap-4">
        {displayedError ? <Alert variant="destructive"><AlertTitle>${i18n.child("unavailable", "Notifications unavailable")}</AlertTitle><AlertDescription className="flex flex-col items-start gap-3">{displayedError}{loadError ? <Button type="button" size="sm" variant="outline" disabled={refreshing || pending} onClick={refresh}>${i18n.child("retry", "Retry")}</Button> : null}</AlertDescription></Alert> : null}
        <section aria-label={${i18n.value("title", "Notifications")}} className="flex flex-col gap-2" aria-busy={refreshing}>{loading && items.length === 0 ? <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></> : items.length === 0 ? loadError ? null : <Empty><EmptyHeader><EmptyTitle>${i18n.child("empty", "No notifications yet.")}</EmptyTitle><EmptyDescription>${i18n.child("description", "Updates and activity for your account.")}</EmptyDescription></EmptyHeader></Empty> : items.map((item) => <Card key={item.id}><CardHeader className="p-4 sm:p-5"><CardTitle as="h2" dir="auto" className="break-words text-base">{item.title}</CardTitle><CardDescription dir="auto" className="whitespace-pre-wrap break-words">{item.body}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5 sm:pb-5">{resolveNotificationDestination(item.href) ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => open(item)}>${i18n.child("open", "Open")}</Button> : null}<Button type="button" size="sm" variant="outline" disabled={pending || item.readAt !== null} onClick={() => markRead(item.id)}>{item.readAt ? ${i18n.value("read", "Read")} : ${i18n.value("markRead", "Mark read")}}</Button></CardContent></Card>)}</section>
      </div>
    </div>
  </main>;`
}
}
`;
}

export function notificationBellScreenContent(): string {
  return `"use client";
import type * as React from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotificationBell } from "./use-notification-bell";
export function NotificationInboxBell(): React.JSX.Element { return <NotificationBell {...useNotificationBell()} />; }
`;
}

export function notificationBellWorkflowContent(
  framework: CapabilityClientOptions["framework"],
): string {
  const next = framework === "nextjs";
  return `"use client";
${next ? 'import { useRouter } from "next/navigation";' : 'import { useNavigate } from "@tanstack/react-router";'}
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { getNotificationHref, type NotificationItem } from "@/lib/notifications";
import { useNotificationInbox, useInvalidateNotificationInbox } from "./queries";
import { markNotificationRead } from "./mutations";

export function useNotificationBell() {
  ${next ? "const router = useRouter();" : "const navigate = useNavigate();"}
  const inbox = useNotificationInbox();
  const invalidateInbox = useInvalidateNotificationInbox();
  const mutation = useAuthOwnedMutation(async (item: NotificationItem, isCurrent) => {
    if (item.readAt === null) await markNotificationRead(item.id);
    if (isCurrent()) await invalidateInbox();
    const destination = getNotificationHref(item.type, item.payload);
    if (isCurrent() && destination) ${next ? "router.push(destination.href);" : "await navigate({ to: destination.href });"}
    return item.id;
  });
  return {
    notifications: (inbox.data ?? []).map((item) => ({ id: item.id, type: item.kind, payload: { title: item.title, message: item.body, href: item.href }, readAt: item.readAt, createdAt: item.createdAt })),
    loading: inbox.isPending, loadError: Boolean(inbox.error), actionError: Boolean(mutation.error),
    pendingId: mutation.isPending ? mutation.variables?.id ?? null : null,
    onRetry: () => { mutation.reset(); void inbox.refetch(); },
    onActivate: (item: NotificationItem) => { void mutation.run(item); },
  };
}
`;
}
