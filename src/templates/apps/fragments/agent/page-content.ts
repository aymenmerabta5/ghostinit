export function agentPageContent(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): string {
  const next = framework === "nextjs";
  const agentRoot = mode === "single" ? "agent/" : "apps/eve/agent/";
  return `"use client";
import * as React from "react";
import { useEveAgent } from "eve/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 md:p-8 lg:p-10">
        <AgentHeader agentRoot="${agentRoot}" />
        <Separator />
        <Card className="flex flex-col gap-4 p-4">
          <CardHeader className="p-0"><CardTitle className="text-base">{t("conversationTitle")}</CardTitle><CardDescription${next ? ' className="max-w-[60ch]"' : ""}>{t("conversationDescription")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
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
