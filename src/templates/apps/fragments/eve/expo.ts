import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import type { EvePlatformMode } from "./protocol.js";

export function expoEveClientContent(mode: EvePlatformMode): string {
  const configImport = mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo";
  return `import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { createEveClient, EveClientError, type EveTransport } from "./eve-protocol";
import { env } from "${configImport}";

function configuredApplicationOrigin(): string {
  const configured = env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL;
  if (!configured) throw new EveClientError("Configure EXPO_PUBLIC_API_URL before using Eve.");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new EveClientError("EXPO_PUBLIC_API_URL is invalid.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new EveClientError("EXPO_PUBLIC_API_URL must be HTTPS or a loopback development origin.");
  }
  return url.origin;
}

function nativeHeaders(origin: string, method: "GET" | "POST"): Headers {
  const headers = new Headers({ Accept: "application/json, application/x-ndjson" });
  if (method === "POST") headers.set("Content-Type", "application/json");
  if (Platform.OS !== "web") {
    const cookie = authClient.getCookie();
    if (!cookie) throw new EveClientError("Sign in before using Eve.", 401);
    headers.set("Cookie", cookie);
    // Native fetch has no browser origin. Assert the configured application
    // origin so the Next-hosted facade can apply the same CSRF boundary.
    headers.set("Origin", origin);
    headers.set("Sec-Fetch-Site", "same-origin");
  }
  return headers;
}

const transport: EveTransport = {
  async request(path, input) {
    const origin = configuredApplicationOrigin();
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location.origin !== origin) {
      throw new EveClientError("Expo web must use the same origin as EXPO_PUBLIC_API_URL.");
    }
    return await fetch(new URL(path, origin).toString(), {
      method: input.method,
      headers: nativeHeaders(origin, input.method),
      ...(input.body === undefined ? {} : { body: input.body }),
      credentials: "include",
      redirect: "manual",
      signal: input.signal,
    });
  },
};

export const eveClient = createEveClient(transport);
export type { EveInvokeOptions, EveInvokeResult, EveSessionCursor } from "./eve-protocol";
`;
}

export function expoEveRouteContent(mode: EvePlatformMode = "monorepo", hasI18n = false): string {
  const i18n = nativeI18nTemplate(hasI18n, "agent", nativeI18nImportPath("mobile", mode));
  return `import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/hooks/use-auth";
import { eveClient, type EveSessionCursor } from "@/lib/eve-client";
${i18n.importLine}

type ChatMessage = { readonly id: number; readonly role: "assistant" | "user"; readonly text: string };

export default function AgentScreen(): React.JSX.Element {
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
        onText: (text) => {
          setMessages((current) => {
            const existing = current.some(({ id }) => id === assistantId);
            return existing
              ? current.map((item) => item.id === assistantId ? { ...item, text } : item)
              : [...current, { id: assistantId, role: "assistant", text }];
          });
        },
      });
      setSession(result.session);
      if (!result.message) {
        setMessages((current) => [...current, { id: assistantId, role: "assistant", text: ${i18n.value("waiting", "Eve is waiting for your next action.")} }]);
      }
    } ${hasI18n ? "catch {" : "catch (cause) {"}
      setError(${hasI18n ? i18n.value("requestError", "Eve request failed.") : 'cause instanceof Error ? cause.message : "Eve request failed."'});
    } finally {
      if (controller.current === nextController) controller.current = null;
      setSubmitting(false);
    }
  }

  if (isPending) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!isAuthenticated) {
    return (
      <View className="flex-1 justify-center bg-background p-6">
        <Card><CardHeader><CardTitle>${i18n.child("signInTitle", "Sign in to use Eve")}</CardTitle><CardDescription>${i18n.child("signInDescription", "The durable agent is available only through the authenticated application boundary.")}</CardDescription></CardHeader><CardContent><Link href="/(auth)/sign-in" asChild><Button><Text>${i18n.child("signIn", "Sign in")}</Text></Button></Link></CardContent></Card>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background p-4">
      <Card className="flex-1">
        <CardHeader><CardTitle>${i18n.child("title", "Eve durable agent")}</CardTitle><CardDescription>${i18n.child("mobileDescription", "Messages use the application-owned /api/agent facade; the mobile client never receives Eve service credentials.")}</CardDescription></CardHeader>
        <CardContent className="flex-1 gap-3">
          <ScrollView accessibilityLabel={${i18n.value("conversationLabel", "Conversation with Eve")}} accessibilityLiveRegion="polite" className="flex-1 rounded-xl border p-3">
            {messages.length === 0 ? <Text className="py-8 text-center text-muted-foreground">${i18n.child("empty", "Ask Eve to inspect architecture, scaffold a module, or run a workflow.")}</Text> : messages.map((message) => <View key={message.id} className={message.role === "user" ? "mb-2 items-end" : "mb-2 items-start"}><Card className={message.role === "user" ? "max-w-[85%] border-primary bg-primary" : "max-w-[85%] bg-muted"}><CardContent className="p-3"><Text className={message.role === "user" ? "text-primary-foreground" : "text-foreground"}>{message.text}</Text></CardContent></Card></View>)}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
          <View className="flex-row items-center gap-2">
            <Input accessibilityLabel={${i18n.value("messageLabel", "Message Eve")}} className="flex-1" editable={!submitting} value={input} onChangeText={setInput} onSubmitEditing={() => void send()} placeholder={submitting ? ${i18n.value("workingPlaceholder", "Eve is working…")} : ${i18n.value("messagePlaceholder", "Message Eve")}} />
            <Button disabled={submitting || !input.trim()} onPress={() => void send()}><Text>{submitting ? ${i18n.value("working", "Working…")} : ${i18n.value("send", "Send")}}</Text></Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}
`;
}

export function expoEveFiles(mode: EvePlatformMode, hasI18n = false): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/mobile/" : "";
  return [
    file(`${root}src/lib/eve-client.ts`, expoEveClientContent(mode)),
    file(`${root}app/agent.tsx`, expoEveRouteContent(mode, hasI18n)),
  ];
}
