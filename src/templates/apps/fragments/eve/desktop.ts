import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import type { EvePlatformMode } from "./protocol.js";
import { nativeEveFeatureFiles, nativeEveRouteContent } from "./native-feature.js";

export function desktopEveMainHelpers(): string {
  return `type DesktopEveRequest = { readonly body?: string; readonly method: "GET" | "POST"; readonly path: string };
type DesktopEveResponse = { readonly body: string; readonly headers: Readonly<Record<string, string>>; readonly status: number };
const MAX_DESKTOP_EVE_BODY_BYTES = 2 * 1024 * 1024;
const EVE_SESSION_ID = "[A-Za-z0-9][A-Za-z0-9._:-]{0,255}";
const EVE_POST_PATH = new RegExp("^/api/agent/eve/v1/session(?:/" + EVE_SESSION_ID + ")?$");
const EVE_STREAM_PATH = new RegExp("^/api/agent/eve/v1/session/" + EVE_SESSION_ID + "/stream$");

function configuredDesktopEveOrigin(): string {
  const configured = env.DESKTOP_API_URL?.trim();
  if (!configured) throw new Error("Configure DESKTOP_API_URL before using Eve");
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("DESKTOP_API_URL is invalid"); }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("DESKTOP_API_URL must be HTTPS or a loopback development origin");
  }
  return url.origin;
}

function desktopEveRequest(value: unknown): DesktopEveRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Eve request");
  const method = Reflect.get(value, "method");
  const path = Reflect.get(value, "path");
  const body = Reflect.get(value, "body");
  if ((method !== "GET" && method !== "POST") || typeof path !== "string") throw new Error("Invalid Eve request");
  if (body !== undefined && typeof body !== "string") throw new Error("Invalid Eve request body");
  if (body && new TextEncoder().encode(body).byteLength > MAX_DESKTOP_EVE_BODY_BYTES) throw new Error("Eve request body is too large");
  const parsed = new URL(path, "https://ghostinit.invalid");
  if (parsed.origin !== "https://ghostinit.invalid" || parsed.hash) throw new Error("Invalid Eve request path");
  if (method === "POST") {
    if (!EVE_POST_PATH.test(parsed.pathname) || parsed.search) throw new Error("Invalid Eve request path");
  } else {
    if (!EVE_STREAM_PATH.test(parsed.pathname)) throw new Error("Invalid Eve request path");
    const keys = [...parsed.searchParams.keys()];
    if (keys.some((key) => key !== "startIndex" && key !== "includeTailIndex")) throw new Error("Invalid Eve stream cursor");
    if (parsed.searchParams.getAll("startIndex").length !== 1 || !/^[0-9]+$/.test(parsed.searchParams.get("startIndex") ?? "")) throw new Error("Invalid Eve stream cursor");
    if (parsed.searchParams.getAll("includeTailIndex").length !== 1 || parsed.searchParams.get("includeTailIndex") !== "1") throw new Error("Invalid Eve stream cursor");
  }
  return { method, path: parsed.pathname + parsed.search, ...(body === undefined ? {} : { body }) };
}

async function boundedDesktopEveBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_DESKTOP_EVE_BODY_BYTES) throw new Error("Eve response is too large");
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_DESKTOP_EVE_BODY_BYTES) throw new Error("Eve response is too large");
  return body;
}
`;
}

export function desktopEveMainHandler(): string {
  return `  ipcMain.handle("desktop:eve-request", async (event, value: unknown): Promise<DesktopEveResponse> => {
    assertTrustedIpc(event);
    const input = desktopEveRequest(value);
    const origin = configuredDesktopEveOrigin();
    const headers = new Headers({
      Accept: "application/json, application/x-ndjson",
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
    });
    if (input.method === "POST") headers.set("Content-Type", "application/json");
    const response = await session.defaultSession.fetch(new URL(input.path, origin).toString(), {
      method: input.method,
      headers,
      ...(input.body === undefined ? {} : { body: input.body }),
      credentials: "include",
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) throw new Error("Eve facade redirects are not allowed");
    const responseHeaders: Record<string, string> = {};
    for (const name of ["content-length", "content-type", "x-eve-session-id", "x-eve-stream-tail-index"]) {
      const header = response.headers.get(name);
      if (header !== null) responseHeaders[name] = header;
    }
    return { body: await boundedDesktopEveBody(response), headers: responseHeaders, status: response.status };
  });
`;
}

export function desktopEvePreloadType(): string {
  return `  eveRequest: (input: { body?: string; method: "GET" | "POST"; path: string }) => Promise<{ body: string; headers: Readonly<Record<string, string>>; status: number }>;
`;
}

export function desktopEvePreloadBridge(): string {
  return `  eveRequest: (input) => ipcRenderer.invoke("desktop:eve-request", input),
`;
}

export function desktopEveClientContent(): string {
  return `import { createEveClient, EveClientError, type EveTransport } from "./eve-protocol";

function abortError(): EveClientError {
  return new EveClientError("The Eve request was cancelled.");
}

async function withAbort<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return await pending;
  if (signal.aborted) throw abortError();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

const transport: EveTransport = {
  async request(path, input) {
    const pending = window.desktopBridge.eveRequest({
      method: input.method,
      path,
      ...(input.body === undefined ? {} : { body: input.body }),
    });
    const result = await withAbort(pending, input.signal);
    return new Response(result.body, { status: result.status, headers: result.headers });
  },
};

export const eveClient = createEveClient(transport);
export type { EveInvokeOptions, EveInvokeResult, EveSessionCursor } from "./eve-protocol";
`;
}

function desktopEveViewSource(mode: EvePlatformMode = "monorepo", hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "agent", nativeI18nImportPath("desktop", mode));
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "../hooks/useAuth";
import { eveClient, type EveSessionCursor } from "../lib/eve-client";
${i18n.importLine}

type ChatMessage = { readonly id: number; readonly role: "assistant" | "user"; readonly text: string };

export const Route = createFileRoute("/agent")({ component: AgentPage });

function AgentPage(): React.JSX.Element {
${i18n.hookLine}
  const { isAuthenticated, isPending } = useAuth();
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [session, setSession] = React.useState<EveSessionCursor | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const sequence = React.useRef(0);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);

  async function send(): Promise<void> {
    const message = input.trim();
    if (!message || submitting) return;
    const userId = ++sequence.current;
    const assistantId = ++sequence.current;
    setInput("");
    setError(null);
    setSubmitting(true);
    setMessages((current) => [...current, { id: userId, role: "user", text: message }]);
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const result = await eveClient.invoke(message, session, {
        signal: nextController.signal,
        onText: (text) => setMessages((current) => current.some(({ id }) => id === assistantId)
          ? current.map((item) => item.id === assistantId ? { ...item, text } : item)
          : [...current, { id: assistantId, role: "assistant", text }]),
      });
      setSession(result.session);
      if (!result.message) setMessages((current) => [...current, { id: assistantId, role: "assistant", text: ${i18n.value("waiting", "Eve is waiting for your next action.")} }]);
    } ${hasI18n ? "catch {" : "catch (cause) {"}
      setError(${hasI18n ? i18n.value("requestError", "Eve request failed.") : 'cause instanceof Error ? cause.message : "Eve request failed."'});
    } finally {
      if (controller.current === nextController) controller.current = null;
      setSubmitting(false);
    }
  }

  if (isPending) return <main className="mx-auto flex max-w-xl flex-col gap-3 p-6" aria-label={${i18n.value("loadingAccount", "Loading account…")}}><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></main>;
  if (!isAuthenticated) return <Empty className="mx-auto max-w-xl"><EmptyHeader><EmptyTitle>${i18n.child("signInTitle", "Sign in to use Eve")}</EmptyTitle><EmptyDescription>${i18n.child("signInDescription", "The durable agent is available only through the authenticated application boundary.")}</EmptyDescription></EmptyHeader><EmptyContent><Button render={<Link to="/sign-in" />} nativeButton={false}>${i18n.child("signIn", "Sign in")}</Button></EmptyContent></Empty>;

  return (
    <Card className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <CardHeader><CardTitle>${i18n.child("title", "Eve durable agent")}</CardTitle><CardDescription>${i18n.child("desktopDescription", "The preload bridge forwards only authenticated /api/agent requests; Eve credentials never enter the renderer.")}</CardDescription></CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <MessageScrollerProvider autoScroll><MessageScroller><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite" aria-label={${i18n.value("conversationLabel", "Conversation with Eve")}}>
          {messages.length === 0 ? <Empty><EmptyHeader><EmptyTitle>${i18n.child("empty", "Ask Eve to inspect architecture, scaffold a module, or run a workflow.")}</EmptyTitle><EmptyDescription>${i18n.child("desktopDescription", "The preload bridge forwards only authenticated agent requests.")}</EmptyDescription></EmptyHeader></Empty> : messages.map((message) => <MessageScrollerItem key={String(message.id)} messageId={String(message.id)} scrollAnchor={message.role === "user"}><Message align={message.role === "user" ? "end" : "start"}><MessageContent><MessageHeader>{message.role}</MessageHeader><Bubble align={message.role === "user" ? "end" : "start"} variant={message.role === "user" ? "default" : "muted"}><BubbleContent dir="auto">{message.text}</BubbleContent></Bubble></MessageContent></Message></MessageScrollerItem>)}{submitting ? <MessageScrollerItem messageId="streaming"><Marker><MarkerContent className="shimmer">${i18n.child("working", "Working…")}</MarkerContent></Marker></MessageScrollerItem> : null}
        </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>
        {error ? <Alert variant="destructive"><AlertTitle>${i18n.child("requestError", "Eve request failed.")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form onSubmit={(event) => { event.preventDefault(); void send(); }}><FieldGroup><Field><FieldLabel className="sr-only" htmlFor="desktop-agent-message">${i18n.child("messageLabel", "Message Eve")}</FieldLabel><div className="flex gap-2"><Input id="desktop-agent-message" className="min-h-11 flex-1" disabled={submitting} value={input} onChange={(event) => setInput(event.target.value)} placeholder={submitting ? ${i18n.value("workingPlaceholder", "Eve is working…")} : ${i18n.value("messagePlaceholder", "Message Eve")}} /><Button type="submit" className="min-h-11" disabled={submitting || !input.trim()}>{submitting ? ${i18n.value("working", "Working…")} : ${i18n.value("send", "Send")}}</Button></div></Field></FieldGroup></form>
      </CardContent>
    </Card>
  );
}
`;
}

export function desktopEveFiles(mode: EvePlatformMode, hasI18n = false): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/desktop/" : "";
  return [
    file(`${root}src/renderer/lib/eve-client.ts`, desktopEveClientContent()),
    ...nativeEveFeatureFiles("desktop", mode, hasI18n, desktopEveViewSource(mode, hasI18n)),
  ];
}

export function desktopEveRouteContent(
  mode: EvePlatformMode = "monorepo",
  _hasI18n = false,
): string {
  return nativeEveRouteContent("desktop", mode);
}
