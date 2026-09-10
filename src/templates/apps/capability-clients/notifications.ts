import {
  notificationScreenContent,
  notificationWorkflowContent,
  notificationWorkspaceContent,
  notificationBellScreenContent,
  notificationBellWorkflowContent,
} from "./notification-workspace.js";
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
  return notificationScreenContent(options, target);
}

function expoPageContent(options: CapabilityClientOptions): string {
  return notificationScreenContent(options, "mobile");
}

function webBellContent(_framework: CapabilityClientOptions["framework"]): string {
  return notificationBellScreenContent();
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
    file(`${base}/use-notification-workspace.ts`, notificationWorkflowContent(options, target)),
    file(
      `${base}/components/notifications-workspace.tsx`,
      notificationWorkspaceContent(options, target),
    ),
    ...(target === "web"
      ? [
          file(
            `${base}/use-notification-bell.ts`,
            notificationBellWorkflowContent(options.framework),
          ),
        ]
      : []),
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
