import { file, type TemplateFile } from "../../../shared.js";
export function agentPage(): TemplateFile {
  return file(
    "apps/web/src/app/agent/page.tsx",
    `"use client";
import * as React from "react";
import { useState } from "react";
import { useEveAgent } from "eve/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export default function AgentPage(): React.JSX.Element {
  const agent = useEveAgent();
  const [input, setInput] = useState("");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">Eve Durable Agent</h1><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> durable</span></Badge></div>
          <p className="text-sm text-muted-foreground max-w-[65ch] leading-relaxed">This chat uses the eve agent in <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">apps/eve/</code> — filesystem-first durable backend. Tools: scaffold_module, check_architecture, sync_registries, list_modules, db_migrate. Skills: ghostinit-workflow, module-design loaded via load_skill. Durable sessions stream NDJSON, pause for approval, resume, crash-safe via Workflow SDK.</p>
        </div>
        <Separator />
        <Card className="flex flex-col gap-4 p-4">
          <CardHeader className="p-0"><CardTitle className="text-base">Conversation</CardTitle><CardDescription className="max-w-[60ch]">Mounted same-origin via withEve. Cookie auth flows, zero CORS.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 p-0">
            <div role="log" aria-live="polite" aria-label="Conversation with the agent" className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
              {agent.data.messages.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No messages yet. Ask to scaffold a module or check architecture.</p> : agent.data.messages.map((m: { id: string; role: string; content?: string }) => (<div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}><span className={m.role === "user" ? "inline-block max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "inline-block max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"}>{m.content ?? ""}</span></div>))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (!input.trim() || isBusy) return; agent.send({ message: input }); setInput(""); }} className="flex gap-2">
              <Input aria-label="Message the agent" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isBusy ? "Agent working..." : "Ask to scaffold a module, check architecture, sync registries..."} disabled={isBusy} className="flex-1 bg-background" />
              <Button type="submit" disabled={isBusy || !input.trim()}>{isBusy ? "Working…" : "Send"}</Button>
            </form>
            {agent.status === "streaming" ? <p className="text-xs text-muted-foreground">Streaming durable workflow...</p> : null}
            {agent.error ? <Alert variant="destructive"><AlertTitle>Agent error</AlertTitle><AlertDescription className="break-all text-xs">{String(agent.error)}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
`,
  );
}
