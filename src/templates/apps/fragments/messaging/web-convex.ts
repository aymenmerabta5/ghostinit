import { file, type TemplateFile } from "../../../shared.js";
import {
  convexWebModelContent,
  convexWebMutationsContent,
  convexWebQueriesContent,
} from "./web-convex-data.js";
import {
  convexComposerHookContent,
  convexInboxHookContent,
  convexStartFormHookContent,
} from "./web-convex-workflows.js";
import {
  convexComposerViewContent,
  convexScreenContent,
  convexSidebarViewContent,
  convexStartFormViewContent,
  convexThreadViewContent,
} from "./web-convex-views.js";

export function convexWebMessagingFeatureFiles(
  mode: "monorepo" | "single",
  router: "next" | "tanstack",
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  const feature = root + "/features/messaging";
  const generated =
    mode === "monorepo" ? "../../../../../convex/_generated" : "../../../convex/_generated";
  const next = router === "next";
  return [
    file(
      root + (next ? "/app/(app)/messages/page.tsx" : "/routes/messages.tsx"),
      next ? convexNextRouteContent(mode) : convexTanstackRouteContent(),
    ),
    file(feature + "/model.ts", convexWebModelContent(generated)),
    file(feature + "/queries.ts", convexWebQueriesContent(generated, next)),
    file(feature + "/mutations.ts", convexWebMutationsContent(generated, !next)),
    file(feature + "/use-convex-inbox.ts", convexInboxHookContent()),
    file(feature + "/use-start-conversation-form.ts", convexStartFormHookContent()),
    file(feature + "/use-convex-message-form.ts", convexComposerHookContent(!next)),
    file(
      feature + "/types.ts",
      `import type { useStartConversationForm } from "./use-start-conversation-form";
import type { useConvexMessageForm } from "./use-convex-message-form";
export type StartConversationFormState = ReturnType<typeof useStartConversationForm>;
export type ConvexMessageFormState = ReturnType<typeof useConvexMessageForm>;
`,
    ),
    file(feature + "/screen.tsx", convexScreenContent()),
    file(feature + "/components/conversation-sidebar.tsx", convexSidebarViewContent()),
    file(feature + "/components/start-conversation-form.tsx", convexStartFormViewContent()),
    file(feature + "/components/message-thread.tsx", convexThreadViewContent()),
    file(feature + "/components/message-composer.tsx", convexComposerViewContent(!next)),
    file(
      feature + "/start-conversation-form.tsx",
      `"use client";
import type * as React from "react";
import type { ConversationId } from "./model";
import { useStartConversationForm } from "./use-start-conversation-form";
import { StartConversationFormView } from "./components/start-conversation-form";
export function StartConversationForm({ onStarted }: { onStarted(id: ConversationId): void }): React.JSX.Element { const state = useStartConversationForm(onStarted); return <StartConversationFormView state={state} />; }
`,
    ),
    file(
      feature + "/message-composer.tsx",
      `"use client";
import type * as React from "react";
import type { ConversationId } from "./model";
import { useConvexMessageForm } from "./use-convex-message-form";
import { ConvexMessageComposerView } from "./components/message-composer";
export function ConvexMessageComposer({ conversationId }: { conversationId: ConversationId }): React.JSX.Element { const state = useConvexMessageForm(conversationId); return <ConvexMessageComposerView state={state} />; }
`,
    ),
    file(
      feature + "/message-thread.tsx",
      `"use client";
import type * as React from "react";
import type { ConversationId } from "./model";
import { useConvexThread } from "./use-convex-inbox";
import { ConvexMessageComposer } from "./message-composer";
import { ConvexMessageThreadView } from "./components/message-thread";
export function ConvexMessageThread({ conversationId }: { conversationId: ConversationId }): React.JSX.Element { const state = useConvexThread(conversationId); return <ConvexMessageThreadView {...state}><ConvexMessageComposer conversationId={conversationId} /></ConvexMessageThreadView>; }
`,
    ),
  ];
}

function convexNextRouteContent(mode: "monorepo" | "single"): string {
  const application =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${application}";
import { ConvexMessagesPage } from "@/features/messaging/screen";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
async function MessagesData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const current = await application.me();
  const principal = application.principal;
  if (!current.user || !principal) redirect("/sign-in");
  const result = await application.messaging.listConversations();
  const scope = { userId: principal.identityUserId, sessionId: principal.sessionId, tenantId: principal.activeOrganizationId, teamId: principal.activeTeamId };
  return <RequestOwnedSnapshot scope={scope}><ConvexMessagesPage initialConversations={result.conversations.map((conversation) => ({ id: conversation.id }))} /></RequestOwnedSnapshot>;
}
export default function Page(): React.JSX.Element { return <Suspense fallback={<QueryAuthStatus />}><MessagesData /></Suspense>; }
`;
}

function convexTanstackRouteContent(): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { loadInitialConversations, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
import { ConvexMessagesPage } from "@/features/messaging/screen";
export const Route = createFileRoute("/messages")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([loadProtectedRoute(context), loadInitialConversations(context)]),
  component: ConvexMessagesPage,
});
`;
}
