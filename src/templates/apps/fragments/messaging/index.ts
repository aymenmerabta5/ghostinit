import { file, type TemplateFile } from "../../../shared.js";
import {
  realtimeNextClientContent,
  realtimeTanstackClientContent,
  realtimeExpoClientContent,
  realtimeDesktopClientContent,
} from "../realtime/index.js";

function messagingHookContent(_router: "next" | "tanstack"): string {
  return `"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { getMessagingClient, subscribeRealtime, sendTypingRealtime } from "@/lib/realtime";

export function useConversations() {
  return useQuery({
    queryKey: ["messaging", "conversations"],
    queryFn: async () => {
      const c = orpc as unknown as { messaging: { listConversations: () => Promise<{ conversations: unknown[] }> } };
      const res = await c.messaging.listConversations();
      return res.conversations as { id: string; peerName?: string }[];
    },
  });
}

export function useMessages(conversationId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging", "messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const c = orpc as unknown as { messaging: { listMessages: (o: unknown) => Promise<{ messages: unknown[] }> } };
      const res = await c.messaging.listMessages({ conversationId, limit: 50 });
      return res.messages as { id: string; body?: string | null; senderId: string; createdAt: string; attachments?: { url: string; mimeType: string }[] }[];
    },
  });

  React.useEffect(() => {
    if (!conversationId) return;
    // Ensure WS connected and subscribe to realtime
    try { getMessagingClient(); } catch {}
    const unsub = subscribeRealtime((ev: unknown) => {
      const e = ev as { type?: string; conversationId?: string; payload?: { message?: unknown } };
      if (e?.type === "message" && e.conversationId === conversationId) {
        qc.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] });
        qc.invalidateQueries({ queryKey: ["messaging", "conversations"] });
      }
      if (e?.type === "typing" && e.conversationId === conversationId) {
        // handled via typing hook
      }
    });
    return unsub;
  }, [conversationId, qc]);

  return query;
}

export function useTyping(conversationId: string) {
  const [typingUsers, setTypingUsers] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeRealtime((ev: unknown) => {
      const e = ev as { type?: string; conversationId?: string; payload?: { userId?: string; isTyping?: boolean } };
      if (e?.type === "typing" && e.conversationId === conversationId) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (e.payload?.isTyping) next.add(e.payload.userId as string);
          else next.delete(e.payload?.userId as string);
          return next;
        });
        if (e.payload?.isTyping) {
          setTimeout(() => setTypingUsers((p) => { const n = new Set(p); n.delete(e.payload?.userId as string); return n; }), 3000);
        }
      }
    });
    return unsub;
  }, [conversationId]);
  return typingUsers;
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return {
    send: async (body: string) => {
      const c = orpc as unknown as { messaging: { sendMessage: (o: unknown) => Promise<unknown> } };
      await c.messaging.sendMessage({ conversationId, body });
      qc.invalidateQueries({ queryKey: ["messaging", "messages", conversationId] });
    },
    sendTyping: (isTyping: boolean) => sendTypingRealtime(conversationId, isTyping),
  };
}
`;
}

function messagingPageContent(router: "next" | "tanstack"): string {
  const isNext = router === "next";
  const header = isNext
    ? `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConversations, useMessages, useTyping, useSendMessage } from "./hooks/use-messaging";
`
    : `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConversations, useMessages, useTyping, useSendMessage } from "./hooks/use-messaging";
`;

  const body = `
function ConversationList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const { data, isLoading } = useConversations();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading conversations…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No conversations yet. Start one by peer ID.</p>;
  return (
    <div className="flex flex-col gap-2">
      {data.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)} className={\`flex items-center justify-between rounded-md border px-3 py-2 text-left \${selectedId===c.id?"bg-accent":""}\`}>
          <span className="font-mono text-xs truncate">{c.id.slice(0,8)}</span>
          <Badge variant="secondary">DM</Badge>
        </button>
      ))}
    </div>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const { data: messages, isLoading } = useMessages(conversationId);
  const typing = useTyping(conversationId);
  const { send, sendTyping } = useSendMessage(conversationId);
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const isTyping = typing.size > 0;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Thread <span className="font-mono text-xs">{conversationId.slice(0,8)}</span></CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-auto">
            {(messages ?? []).map((m) => (
              <div key={m.id} className="rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">{m.senderId.slice(0,6)} • {new Date(m.createdAt).toLocaleTimeString()}</div>
                {m.body && <div className="text-sm">{m.body}</div>}
                {m.attachments?.map((a, i) => a.mimeType.startsWith("image/") ? <img key={i} src={a.url} alt="attachment" className="mt-2 max-w-[200px] rounded" loading="lazy" /> : <a key={i} href={a.url} className="text-xs underline">{a.url}</a>)}
              </div>
            ))}
          </div>
        )}
        {isTyping && <div className="text-xs text-muted-foreground animate-pulse">Someone is typing… <span className="inline-flex gap-1"><span>•</span><span>•</span><span>•</span></span></div>}
        <div className="flex gap-2">
          <Input value={body} onChange={(e) => { setBody(e.target.value); sendTyping(e.target.value.length>0); }} placeholder="Type a message…" onKeyDown={(e) => { if (e.key==="Enter" && body.trim()) { void send(body.trim()); setBody(""); sendTyping(false); } }} />
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-[160px]" />
          <Button onClick={async () => {
            if (!body.trim() && !file) return;
            let attachmentIds: string[] | undefined;
            if (file) {
              const fd = new FormData(); fd.append("file", file); fd.append("conversationId", conversationId);
              const res = await fetch("/api/messaging/attachments", { method: "POST", body: fd });
              if (res.ok) { const j = await res.json() as { attachmentId: string }; attachmentIds = [j.attachmentId]; }
            }
            const { orpc } = await import("@/lib/orpc");
            const c = orpc as unknown as { messaging: { sendMessage: (o: unknown)=>Promise<unknown> } };
            await c.messaging.sendMessage({ conversationId, body: body.trim() || undefined, attachmentIds });
            setBody(""); setFile(null); sendTyping(false);
          }}>Send</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MessagesPage(): React.JSX.Element {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [peerId, setPeerId] = React.useState("");
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
        <Card><CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">
          <ConversationList onSelect={setSelected} selectedId={selected} />
          <div className="flex gap-2">
            <Input value={peerId} onChange={(e)=>setPeerId(e.target.value)} placeholder="Peer user ID (uuid)" />
            <Button variant="outline" onClick={async()=> {
              const { orpc } = await import("@/lib/orpc");
              const c = orpc as unknown as { messaging: { getOrCreateConversation: (o: unknown)=>Promise<{ id:string }> } };
              const conv = await c.messaging.getOrCreateConversation({ peerUserId: peerId });
              setSelected(conv.id);
            }}>Start DM</Button>
          </div>
        </CardContent></Card>
        <div>{selected ? <Thread conversationId={selected} /> : <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a conversation or start a DM.</CardContent></Card>}</div>
      </div>
    </main>
  );
}
`;

  if (!isNext) {
    return `${header}
${body}
export const Route = createFileRoute('/messages')({ component: MessagesPage })
`;
  }
  return header + body;
}

export function messagingNextFiles(): TemplateFile[] {
  return [
    file("apps/web/src/lib/realtime.ts", realtimeNextClientContent()),
    file("apps/web/src/app/(app)/messages/hooks/use-messaging.ts", messagingHookContent("next")),
    file("apps/web/src/app/(app)/messages/page.tsx", messagingPageContent("next")),
  ];
}

export function messagingTanstackFiles(): TemplateFile[] {
  return [
    file("apps/web/src/lib/realtime.ts", realtimeTanstackClientContent()),
    file("apps/web/src/routes/messages.tsx", messagingPageContent("tanstack")),
    file("apps/web/src/routes/messages/hooks/use-messaging.ts", messagingHookContent("tanstack")),
  ];
}

export function messagingExpoFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/lib/realtime.ts", realtimeExpoClientContent()),
    file(
      "apps/mobile/src/app/(app)/messages.tsx",
      `"use client";
import * as React from "react";
import { View, Text, TextInput, Pressable, ScrollView, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { getMessagingClient } from "@/lib/realtime";

export default function MessagesScreen(): React.JSX.Element {
  const [selected, setSelected] = React.useState<string | null>(null);
  const { data: convs } = useQuery({ queryKey: ["messaging","conversations"], queryFn: async () => {
    const c = orpc as unknown as { messaging: { listConversations: () => Promise<{ conversations: { id:string }[] }> } };
    const r = await c.messaging.listConversations(); return r.conversations;
  }});
  const { data: msgs } = useQuery({ queryKey: ["messaging","messages",selected], enabled: !!selected, queryFn: async () => {
    const c = orpc as unknown as { messaging: { listMessages: (o: unknown)=>Promise<{ messages: unknown[] }> } };
    const r = await c.messaging.listMessages({ conversationId: selected as string, limit: 30 }); return r.messages as { id:string; body?:string; attachments?:{url:string;mimeType:string}[] }[];
  }});
  const [body, setBody] = React.useState("");
  return (
    <View style={{ flex:1, padding:16, gap:12 }}>
      <Text style={{ fontSize:18, fontWeight:"600" }}>Messages (Expo)</Text>
      <ScrollView style={{ maxHeight:120 }}>
        {(convs ?? []).map((c) => (
          <Pressable key={c.id} onPress={()=>setSelected(c.id)} style={{ padding:8, borderWidth:1, borderRadius:8, marginBottom:6 }}>
            <Text>{c.id.slice(0,8)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {selected && (
        <View style={{ flex:1, gap:8 }}>
          <ScrollView style={{ flex:1 }}>
            {(msgs ?? []).map((m) => (
              <View key={m.id} style={{ padding:8, borderWidth:1, borderRadius:8, marginBottom:8 }}>
                {m.body ? <Text>{m.body}</Text> : null}
                {m.attachments?.map((a,i)=> a.mimeType.startsWith("image/") ? <Image key={i} source={{ uri: a.url }} style={{ width:120, height:120, marginTop:6 }} /> : <Text key={i}>{a.url}</Text>)}
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection:"row", gap:8 }}>
            <TextInput value={body} onChangeText={setBody} placeholder="Type a message…" style={{ flex:1, borderWidth:1, borderRadius:8, padding:8 }} />
            <Pressable onPress={async()=>{ if(!body.trim()||!selected) return; const c=orpc as unknown as { messaging:{ sendMessage:(o:unknown)=>Promise<unknown>}}; await c.messaging.sendMessage({ conversationId:selected, body:body.trim() }); setBody(""); }} style={{ backgroundColor:"black", paddingHorizontal:16, justifyContent:"center", borderRadius:8 }}><Text style={{ color:"white" }}>Send</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
`,
    ),
  ];
}

export function messagingDesktopFiles(): TemplateFile[] {
  return [
    file("apps/desktop/src/renderer/lib/realtime.ts", realtimeDesktopClientContent()),
    file(
      "apps/desktop/src/renderer/routes/messages.tsx",
      `import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { getMessagingClient, subscribeRealtime, sendTypingRealtime } from "@/lib/realtime";

function MessagesPage(): React.JSX.Element {
  const [selected, setSelected] = React.useState<string | null>(null);
  const { data: convs } = useQuery({ queryKey: ["messaging","conversations"], queryFn: async () => {
    const c = orpc as unknown as { messaging: { listConversations: () => Promise<{ conversations: { id:string }[] }> } };
    const r = await c.messaging.listConversations(); return r.conversations;
  }});
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Messages (Desktop)</h1>
      <div className="grid grid-cols-[260px_1fr] gap-4 mt-4">
        <Card><CardHeader><CardTitle className="text-sm">Conversations</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">
          {(convs ?? []).map((c) => (
            <button key={c.id} onClick={()=>setSelected(c.id)} className={\`border rounded px-3 py-2 text-left \${selected===c.id?"bg-accent":""}\`}>{c.id.slice(0,8)}</button>
          ))}
        </CardContent></Card>
        <Card><CardContent className="p-4">{selected ? <Thread conversationId={selected} /> : <p className="text-sm text-muted-foreground">Select a conversation.</p>}</CardContent></Card>
      </div>
    </main>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data: msgs } = useQuery({ queryKey: ["messaging","messages",conversationId], queryFn: async () => {
    const c = orpc as unknown as { messaging: { listMessages: (o: unknown)=>Promise<{ messages: { id:string; body?:string; attachments?:{url:string;mimeType:string}[]}[] }> } };
    const r = await c.messaging.listMessages({ conversationId, limit: 50 }); return r.messages;
  }});
  const [body, setBody] = React.useState("");
  React.useEffect(()=>{ try{ getMessagingClient(); }catch{} const unsub=subscribeRealtime((ev: unknown)=>{ const e=ev as { type?:string; conversationId?:string }; if(e?.type==="message"&&e.conversationId===conversationId) qc.invalidateQueries({queryKey:["messaging","messages",conversationId]});}); return unsub; },[conversationId, qc]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 max-h-[360px] overflow-auto">
        {(msgs ?? []).map((m)=> (<div key={m.id} className="border rounded px-3 py-2"><div className="text-sm">{m.body}</div>{m.attachments?.map((a,i)=> a.mimeType.startsWith("image/") ? <img key={i} src={a.url} className="mt-2 max-w-[180px] rounded" /> : <a key={i} href={a.url} className="text-xs underline">{a.url}</a>)}</div>))}
      </div>
      <div className="flex gap-2">
        <Input value={body} onChange={(e)=>{ setBody(e.target.value); sendTypingRealtime(conversationId, e.target.value.length>0); }} placeholder="Type a message…" />
        <Button onClick={async()=>{ if(!body.trim()) return; const c=orpc as unknown as { messaging:{ sendMessage:(o:unknown)=>Promise<unknown>}}; await c.messaging.sendMessage({ conversationId, body:body.trim() }); setBody(""); }}>Send</Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/messages")({ component: MessagesPage });
`,
    ),
  ];
}

export function messagingConvexNextFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/app/(app)/messages/page.tsx",
      `"use client";
import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function MessagesPage(): React.JSX.Element {
  const convs = useQuery(api.messaging.listConversations) as unknown as { _id: string }[] | undefined;
  const [selected, setSelected] = React.useState<string | null>(null);
  const msgs = useQuery(api.messaging.listMessages, selected ? { conversationId: selected as never, limit: 30 } : "skip") as unknown as { messages: { _id: string; body?: string; attachments?: { url: string | null }[] }[] } | undefined;
  const typing = useQuery(api.messaging.listTyping, selected ? { conversationId: selected as never } : "skip") as unknown as { userId: string }[] | undefined;
  const sendMessage = useMutation(api.messaging.sendMessage);
  const getOrCreate = useMutation(api.messaging.getOrCreateConversation);
  const sendTyping = useMutation(api.messaging.sendTyping);
  const [body, setBody] = React.useState("");
  const [peerId, setPeerId] = React.useState("");
  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl grid grid-cols-[300px_1fr] gap-6">
        <Card><CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader><CardContent className="flex flex-col gap-2">
          {(convs ?? []).map((c) => (
            <button key={c._id} onClick={()=>setSelected(c._id)} className={\`border rounded px-3 py-2 text-left \${selected===c._id?"bg-accent":""}\`}>{c._id.slice(0,8)}</button>
          ))}
          <div className="flex gap-2">
            <Input value={peerId} onChange={(e)=>setPeerId(e.target.value)} placeholder="Peer user ID" />
            <Button variant="outline" onClick={async()=>{ const conv = await getOrCreate({ peerUserId: peerId as never }); setSelected((conv as { _id:string })._id); }}>Start DM</Button>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-3">
          {selected ? <>
            <div className="flex flex-col gap-2 max-h-[400px] overflow-auto">
              {(msgs?.messages ?? []).map((m) => (
                <div key={m._id} className="border rounded px-3 py-2">
                  {m.body && <div className="text-sm">{m.body}</div>}
                  {m.attachments?.map((a,i)=> a.url && a.url.match(/\\.(png|jpg|jpeg|webp|gif)$/i) ? <img key={i} src={a.url} className="mt-2 max-w-[180px] rounded" /> : a.url ? <a key={i} href={a.url} className="text-xs underline">{a.url}</a> : null)}
                </div>
              ))}
            </div>
            {(typing?.length ?? 0) > 0 && <div className="text-xs text-muted-foreground animate-pulse">Someone is typing…</div>}
            <div className="flex gap-2">
              <Input value={body} onChange={(e)=>{ setBody(e.target.value); void sendTyping({ conversationId: selected as never, isTyping: e.target.value.length>0 }); }} placeholder="Type a message…" onKeyDown={(e)=>{ if(e.key==="Enter"){ void sendMessage({ conversationId: selected as never, body: body.trim() }); setBody(""); } }} />
              <Button onClick={async()=>{ if(!body.trim()) return; await sendMessage({ conversationId: selected as never, body: body.trim() }); setBody(""); }}>Send</Button>
            </div>
          </> : <p className="text-sm text-muted-foreground">Select a conversation.</p>}
        </CardContent></Card>
      </div>
    </main>
  );
}
`,
    ),
  ];
}

export function messagingFilesFor(
  framework: string,
  database: string,
  apps: string[],
): TemplateFile[] {
  const hasWeb = apps.includes("web");
  const hasMobile = apps.includes("mobile");
  const hasDesktop = apps.includes("desktop");
  const isConvex = database === "convex";
  const isTanstack = framework === "tanstack-start";
  const files: TemplateFile[] = [];
  if (!hasWeb && !hasMobile && !hasDesktop) return files;
  if (isConvex) {
    if (hasWeb) files.push(...messagingConvexNextFiles());
    // For convex tanstack/mobile/desktop also use convex hooks (same page but TanStack route differs)
    // Simplified: reuse convex next files for tanstack as well (route file path differs but content is Next-style; tanstack will still typecheck via convex client)
    if (hasMobile) {
      files.push(
        file(
          "apps/mobile/src/app/(app)/messages.tsx",
          `"use client";
import { View, Text } from "react-native";
export default function MessagesScreen(){ return <View style={{flex:1,padding:16}}><Text>Messages (Convex) — use web for now</Text></View>; }
`,
        ),
      );
    }
    if (hasDesktop) {
      files.push(
        file(
          "apps/desktop/src/renderer/routes/messages.tsx",
          `"use client";
import { View, Text } from "react-native";
export default function MessagesScreen(){ return <View style={{flex:1,padding:16}}><Text>Messages (Convex)</Text></View>; }
`,
        ),
      );
    }
    return files;
  }
  // Postgres (oRPC+WS)
  if (hasWeb) {
    if (isTanstack) files.push(...messagingTanstackFiles());
    else files.push(...messagingNextFiles());
  }
  if (hasMobile) files.push(...messagingExpoFiles());
  if (hasDesktop) files.push(...messagingDesktopFiles());

  // Postgres WS + attachment HTTP handlers (Docker primary, Bun.serve)
  if (isTanstack && hasWeb) {
    files.push(
      file(
        "apps/web/src/routes/api/ws.ts",
        `import { createFileRoute } from '@tanstack/react-router'
import { experimental_RPCHandler } from '@orpc/server/crossws'
import { appRouter } from '@repo/api'
const handler = new experimental_RPCHandler(appRouter as never)
export const Route = createFileRoute('/api/ws')({
  server: { handlers: { GET: async ({ request }: { request: Request }) => {
    const upgrade = request.headers.get('upgrade')
    if (upgrade?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
    return new Response('Switching Protocols', { status: 101 })
  } } }
})
export const wsHandler = handler
`,
      ),
    );
  } else if (hasWeb) {
    files.push(
      file(
        "apps/web/src/app/api/ws/route.ts",
        `import { appRouter } from "@repo/api";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  const upgrade = request.headers.get("upgrade");
  if (upgrade?.toLowerCase() !== "websocket") return new Response("Expected WebSocket — use ws:// + /api/ws (Docker primary)", { status: 426 });
  try {
    const { RPCHandler } = await import("@orpc/server/ws");
    const rpc = new (RPCHandler as unknown as new (r: unknown) => { upgrade: (ws: unknown, opts: unknown) => void })(appRouter as never);
    return new Response(null, { status: 101, headers: { Upgrade: "websocket", Connection: "Upgrade" } });
  } catch {
    return new Response("WebSocket not supported — deploy via Docker with Bun.serve server.ts", { status: 501 });
  }
}
export const dynamic = "force-dynamic";
`,
      ),
      file(
        "apps/web/server.ts",
        `// Custom Bun server for Next.js + oRPC WS (Docker primary)
import { createServer } from "node:http";
import next from "next";
import { appRouter, createContext } from "@repo/api";
const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: "./apps/web" });
const handle = app.getRequestHandler();
await app.prepare();
let wsHandler: { upgrade: (ws: unknown, opts: unknown) => void; message: (ws: unknown, data: unknown, opts: unknown) => Promise<void>; close: (ws: unknown) => void } | null = null;
try {
  const mod = await import("@orpc/server/ws");
  const RPCHandler = (mod as unknown as { RPCHandler: new (r: unknown) => typeof wsHandler }).RPCHandler;
  wsHandler = new RPCHandler(appRouter as never) as never;
} catch {}
const server = createServer(async (req, res) => { await handle(req, res); });
server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "/", \`http://\${req.headers.host ?? "localhost"}\`);
  if (url.pathname === "/api/ws" && wsHandler) {
    const { WebSocketServer } = await import("ws");
    const wss = new (WebSocketServer as unknown as new (o: unknown) => { handleUpgrade: (...a: unknown[]) => void })({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws: unknown) => {
      const ctxPromise = createContext(req.headers as unknown as Headers);
      ctxPromise.then((ctx) => { (wsHandler as { upgrade: (ws: unknown, opts: unknown) => void }).upgrade(ws, { context: ctx }); });
      (ws as unknown as { on: (e: string, cb: (...a: unknown[])=>void)=>void }).on("message", async (data: unknown) => {
        const ctx = await createContext(req.headers as unknown as Headers);
        await wsHandler!.message(ws, data as string, { context: ctx });
      });
      (ws as unknown as { on: (e: string, cb: (...a: unknown[])=>void)=>void }).on("close", () => wsHandler!.close(ws));
    });
    return;
  }
  socket.destroy();
});
server.listen(port, () => { console.log(\`> Ready on http://localhost:\${port} (WS at ws://localhost:\${port}/api/ws)\`); });
`,
      ),
    );
  }
  if (hasWeb) {
    files.push(
      file(
        "apps/web/src/app/api/messaging/attachments/route.ts",
        `import { NextResponse } from "next/server";
import { auth } from "@repo/auth";
import { putFile } from "@repo/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file") as File | null;
  const conversationId = form.get("conversationId") as string | null;
  if (!file || !conversationId) return NextResponse.json({ error: "file and conversationId required" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await putFile(buf, file.name, file.type || "application/octet-stream");
  return NextResponse.json({ attachmentId: stored.storageKey, url: stored.url });
}
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });
  const { getFile } = await import("@repo/storage");
  const data = await getFile(key);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data as unknown as BodyInit, { headers: { "Content-Type": "application/octet-stream" } });
}
`,
      ),
    );
  }
  files.push(file("data/uploads/.gitkeep", ""));
  return files;
}
