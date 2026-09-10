import { file, type TemplateFile } from "../../../shared.js";
import { messagingWebModelsContent } from "./web-models.js";
import { messagingWebQueriesContent, messagingWebMutationsContent } from "./web-postgres-data.js";
import {
  messagingWorkspaceWorkflowContent,
  messageThreadWorkflowContent,
  messageTypingWorkflowContent,
  messageComposerWorkflowContent,
} from "./web-postgres-workflows.js";
import {
  messagingWorkspaceViewContent,
  messageThreadViewContent,
  messageComposerViewContent,
} from "./web-postgres-views.js";

export function postgresWebMessagingFeatureFiles(
  router: "next" | "tanstack",
  messageList: string,
  nextRoute: string,
): TemplateFile[] {
  const root = "apps/web/src";
  const base = `${root}/features/messaging`;
  const next = router === "next";
  return [
    file(`${base}/model.ts`, messagingWebModelsContent()),
    file(`${base}/queries.ts`, messagingWebQueriesContent(router)),
    file(`${base}/mutations.ts`, messagingWebMutationsContent()),
    file(`${base}/use-messaging-workspace.ts`, messagingWorkspaceWorkflowContent(next)),
    file(`${base}/use-message-thread.ts`, messageThreadWorkflowContent()),
    file(`${base}/use-message-typing.ts`, messageTypingWorkflowContent()),
    file(`${base}/use-message-composer.ts`, messageComposerWorkflowContent()),
    file(`${base}/components/messaging-workspace-view.tsx`, messagingWorkspaceViewContent()),
    file(`${base}/components/message-thread-view.tsx`, messageThreadViewContent()),
    file(`${base}/components/message-composer-view.tsx`, messageComposerViewContent()),
    file(`${base}/components/message-list.tsx`, messageList),
    file(
      `${base}/page.tsx`,
      `"use client";
import type * as React from "react";
import { MessagingWorkspaceView } from "./components/messaging-workspace-view";
import { MessageThread } from "./message-thread";
import { useMessagingWorkspace } from "./use-messaging-workspace";
${next ? 'import type { ConversationSummary } from "./model";' : ""}
export function MessagesPage(${next ? "{ initialConversations }: { initialConversations: ConversationSummary[] }" : ""}): React.JSX.Element {
  const workspace = useMessagingWorkspace(${next ? "initialConversations" : ""});
  return <MessagingWorkspaceView {...workspace}>{workspace.selected ? <MessageThread key={workspace.selected} conversationId={workspace.selected} /> : null}</MessagingWorkspaceView>;
}
`,
    ),
    file(
      `${base}/message-thread.tsx`,
      `"use client";
import type * as React from "react";
import { MessageThreadView } from "./components/message-thread-view";
import { MessageComposer } from "./message-composer";
import { useMessageThread } from "./use-message-thread";
function OwnedMessageThread({ conversationId }: { conversationId: string }): React.JSX.Element {
  return <MessageThreadView {...useMessageThread(conversationId)}><MessageComposer conversationId={conversationId} /></MessageThreadView>;
}
export function MessageThread({ conversationId }: { conversationId: string }): React.JSX.Element {
  return <OwnedMessageThread key={conversationId} conversationId={conversationId} />;
}
`,
    ),
    file(
      `${base}/message-composer.tsx`,
      `"use client";
import type * as React from "react";
import { MessageComposerView } from "./components/message-composer-view";
import { useMessageComposer } from "./use-message-composer";
export function MessageComposer({ conversationId }: { conversationId: string }): React.JSX.Element { return <MessageComposerView {...useMessageComposer(conversationId)} />; }
`,
    ),
    ...(next
      ? [
          file(
            `${root}/app/(app)/messages/client.tsx`,
            'export { MessagesPage as default } from "@/features/messaging/page";\n',
          ),
          file(`${root}/app/(app)/messages/page.tsx`, nextRoute),
        ]
      : [
          file(
            `${root}/routes/messages.tsx`,
            `import { createFileRoute } from "@tanstack/react-router";
import { loadInitialConversations, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
import { MessagesPage } from "@/features/messaging/page";
export const Route = createFileRoute("/messages")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([loadProtectedRoute(context), loadInitialConversations(context)]),
  component: MessagesPage,
});
`,
          ),
        ]),
  ];
}
