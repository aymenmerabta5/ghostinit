import { file, type TemplateFile } from "../../../shared.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../native-i18n.js";
import { desktopPath, mobilePath, type IdentityWorkspaceMode } from "./model.js";

function expoEmailFlowContent(
  kind: "magic-link" | "verify-email",
  mode: IdentityWorkspaceMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth", nativeI18nImportPath("mobile", mode));
  const key = kind === "magic-link" ? "emailFlow.magicLink" : "emailFlow.verifyEmail";
  const title = kind === "magic-link" ? "Magic-link sign in" : "Verify your email";
  const description =
    kind === "magic-link"
      ? "Receive a short-lived link that signs you in without a password."
      : "Request a fresh verification link for your account.";
  const operation =
    kind === "magic-link"
      ? 'identityClient.requestMagicLink({ email: email.trim(), callbackURL: "/dashboard" })'
      : 'identityClient.requestEmailVerification({ email: email.trim(), callbackURL: "/dashboard" })';
  const catchParameter = hasI18n ? "" : " (cause)";
  return `import * as React from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { identityClient } from "@/lib/auth-client";
${i18n.importLine}

export default function EmailFlowScreen(): React.JSX.Element {
${i18n.hookLine}
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(): Promise<void> {
    if (!email.includes("@")) { setError(${i18n.value("emailFlow.invalidEmail", "Enter a valid email address")}); return; }
    setPending(true); setError(null); setMessage(null);
    try {
      const result = await ${operation};
      if (result.error) { setError(${hasI18n ? i18n.value("emailFlow.sendError", "Unable to send email") : 'result.error.message ?? "Unable to send email"'}); return; }
      setMessage(${i18n.value("emailFlow.success", "If the address can receive this email, check your inbox.")});
    } catch${catchParameter} { setError(${hasI18n ? i18n.value("emailFlow.sendError", "Unable to send email") : 'cause instanceof Error ? cause.message : "Unable to send email"'}); }
    finally { setPending(false); }
  }
  return <View className="flex-1 items-center justify-center bg-background p-5"><Card className="w-full max-w-[460px]"><CardHeader><Text className="text-xs font-semibold uppercase tracking-widest text-primary">${i18n.child("emailFlow.kicker", "Secure email flow")}</Text><CardTitle>${i18n.child(`${key}.title`, title)}</CardTitle><CardDescription>${i18n.child(`${key}.description`, description)}</CardDescription></CardHeader><CardContent className="gap-4">{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{message ? <Alert accessibilityRole="alert"><AlertDescription>{message}</AlertDescription></Alert> : null}<Input accessibilityLabel={${i18n.value("emailFlow.emailLabel", "Email")}} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={${i18n.value("emailFlow.emailPlaceholder", "you@example.com")}} /><Button disabled={pending} isLoading={pending} onPress={() => void submit()}>${i18n.child("emailFlow.sendLink", "Send link")}</Button><Link href="/(auth)/sign-in" asChild><Button variant="outline">${i18n.child("emailFlow.backSignIn", "Back to sign in")}</Button></Link></CardContent></Card></View>;
}
`;
}

function desktopEmailFlowContent(
  kind: "magic-link" | "verify-email",
  mode: IdentityWorkspaceMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth", nativeI18nImportPath("desktop", mode));
  const key = kind === "magic-link" ? "emailFlow.magicLink" : "emailFlow.verifyEmail";
  const title = kind === "magic-link" ? "Magic-link sign in" : "Verify your email";
  const operation =
    kind === "magic-link"
      ? 'identityClient.requestMagicLink({ email: email.trim(), callbackURL: "/dashboard" })'
      : 'identityClient.requestEmailVerification({ email: email.trim(), callbackURL: "/dashboard" })';
  const catchParameter = hasI18n ? "" : " (cause)";
  return `import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { identityClient } from "../lib/auth";
${i18n.importLine}

export const Route = createFileRoute("/${kind}")({ component: EmailFlowPage });

function EmailFlowPage(): React.JSX.Element {
${i18n.hookLine}
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(): Promise<void> {
    if (!email.includes("@")) { setError(${i18n.value("emailFlow.invalidEmail", "Enter a valid email address")}); return; }
    setPending(true); setError(null); setMessage(null);
    try { const result = await ${operation}; if (result.error) { setError(${hasI18n ? i18n.value("emailFlow.sendError", "Unable to send email") : 'result.error.message ?? "Unable to send email"'}); return; } setMessage(${i18n.value("emailFlow.success", "If the address can receive this email, check your inbox.")}); }
    catch${catchParameter} { setError(${hasI18n ? i18n.value("emailFlow.sendError", "Unable to send email") : 'cause instanceof Error ? cause.message : "Unable to send email"'}); }
    finally { setPending(false); }
  }
  return <main className="grid min-h-[calc(100vh-4rem)] place-items-center p-6"><Card className="w-full max-w-md"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">${i18n.child("emailFlow.kicker", "Secure email flow")}</p><CardTitle>${i18n.child(`${key}.title`, title)}</CardTitle><CardDescription>${i18n.child("emailFlow.deliveryDescription", "Delivery is handled by the configured server email capability.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{message ? <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}<Field><FieldLabel htmlFor="email-flow-address">${i18n.child("emailFlow.emailLabel", "Email")}</FieldLabel><Input id="email-flow-address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={${i18n.value("emailFlow.emailPlaceholder", "you@example.com")}} /></Field><Button disabled={pending} onClick={() => void submit()}>{pending ? ${i18n.value("emailFlow.sending", "Sending…")} : ${i18n.value("emailFlow.sendLink", "Send link")}}</Button><Button render={<Link to="/sign-in" />} nativeButton={false} variant="outline">${i18n.child("emailFlow.backSignIn", "Back to sign in")}</Button></CardContent></Card></main>;
}
`;
}

export function expoEmailFlowFiles(mode: IdentityWorkspaceMode, hasI18n = false): TemplateFile[] {
  return [
    file(
      mobilePath(mode, "app/(auth)/magic-link.tsx"),
      expoEmailFlowContent("magic-link", mode, hasI18n),
    ),
    file(
      mobilePath(mode, "app/(auth)/verify-email.tsx"),
      expoEmailFlowContent("verify-email", mode, hasI18n),
    ),
  ];
}

export function desktopEmailFlowFiles(
  mode: IdentityWorkspaceMode,
  hasI18n = false,
): TemplateFile[] {
  return [
    file(
      desktopPath(mode, "routes/magic-link.tsx"),
      desktopEmailFlowContent("magic-link", mode, hasI18n),
    ),
    file(
      desktopPath(mode, "routes/verify-email.tsx"),
      desktopEmailFlowContent("verify-email", mode, hasI18n),
    ),
  ];
}

export { desktopEmailFlowContent, expoEmailFlowContent };
