export function agentPageContent(
  _mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): string {
  if (framework === "nextjs")
    return 'export { AgentPage as default } from "@/features/agent/page";\n';
  return `import { createFileRoute } from "@tanstack/react-router";
import { AgentPage } from "@/features/agent/page";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";

export const Route = createFileRoute("/agent")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  // Eve output is a user-triggered stream; only the authenticated session is preloadable.
  loader: ({ context }) => loadProtectedRoute(context),
  component: AgentPage,
});
`;
}

export function agentScreenContent(): string {
  return `"use client";
import type * as React from "react";
import { AgentWorkspace } from "./components/agent-workspace";
import { useAgentConversation } from "./use-agent-conversation";

export function AgentPage(): React.JSX.Element {
  return <AgentWorkspace {...useAgentConversation()} />;
}
`;
}

export function agentWorkspaceContent(): string {
  return `"use client";
import type * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AgentHeader } from "./agent-header";
import { AgentTranscript } from "./agent-transcript";
import { AgentPrompt } from "./agent-prompt";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentConversation } from "../use-agent-conversation";

export function AgentWorkspace({ messages, streaming, busy, error, input, setInput, submit }: ReturnType<typeof useAgentConversation>): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <AgentHeader />
        <Card className="max-w-4xl">
          <CardHeader><CardTitle as="h2">{t("conversationTitle")}</CardTitle><CardDescription className="max-w-[60ch]">{t("conversationDescription")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AgentTranscript messages={messages} streaming={streaming} />
            <AgentPrompt busy={busy} input={input} onInputChange={setInput} onSend={submit} />
            {error ? <Alert variant="destructive"><AlertTitle>{t("requestError")}</AlertTitle><AlertDescription className="break-all text-xs">{String(error)}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
`;
}
