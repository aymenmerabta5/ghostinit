export function agentPageContent(
  _mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): string {
  const next = framework === "nextjs";
  return `"use client";
import * as React from "react";
import { useEveAgent } from "eve/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AgentHeader } from "@/features/agent/agent-header";
import { AgentTranscript } from "@/features/agent/agent-transcript";
import { AgentPrompt } from "@/features/agent/agent-prompt";
import { useSurfaceTranslations } from "@/lib/translations";
${
  next
    ? ""
    : `import { createFileRoute } from "@tanstack/react-router";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";

export const Route = createFileRoute("/agent")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  // Eve output is a user-triggered stream; only the authenticated session is preloadable.
  loader: ({ context }) => loadProtectedRoute(context),
  component: AgentPage,
});
`
}
${next ? "export default " : ""}function AgentPage(): React.JSX.Element {
  const agent = useEveAgent({ host: "/api/agent" });
  const t = useSurfaceTranslations("agent");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <AgentHeader />
        <Card className="max-w-4xl">
          <CardHeader><CardTitle as="h2">{t("conversationTitle")}</CardTitle><CardDescription className="max-w-[60ch]">{t("conversationDescription")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AgentTranscript messages={agent.data.messages} streaming={agent.status === "streaming"} />
            <AgentPrompt busy={isBusy} onSend={(input) => agent.send(input)} />
            {agent.error ? <Alert variant="destructive"><AlertTitle>{t("requestError")}</AlertTitle><AlertDescription className="break-all text-xs">{String(agent.error)}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
`;
}
