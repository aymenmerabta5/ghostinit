import type { CapabilityClientOptions, ClientTarget } from "./shared.js";

export function notificationComposerContent(
  target: Extract<ClientTarget, "web" | "desktop">,
  options: CapabilityClientOptions,
): string {
  const i18nImport = !options.i18n
    ? ""
    : target === "web"
      ? 'import { useSurfaceTranslations } from "@/lib/translations";'
      : `import { useTranslations } from "${options.mode === "single" ? "@/renderer/lib/i18n" : "@/lib/i18n"}";`;
  const i18nState = !options.i18n
    ? ""
    : `  const t = ${target === "web" ? "useSurfaceTranslations" : "useTranslations"}("notifications");\n`;
  const label = (key: string, fallback: string): string =>
    options.i18n ? `{t("${key}")}` : fallback;
  return `"use client";
import type * as React from "react";
${i18nImport}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface NotificationComposerProps {
  title: string;
  body: string;
  pending: boolean;
  onTitleChange(value: string): void;
  onBodyChange(value: string): void;
  onSubmit(): void;
}

export function NotificationComposer({ title, body, pending, onTitleChange, onBodyChange, onSubmit }: NotificationComposerProps): React.JSX.Element {
${i18nState}  return <Card><CardHeader><CardTitle as="h2">${label("create", "Create notification")}</CardTitle></CardHeader><CardContent>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><FieldGroup>
      <Field><FieldLabel htmlFor="notification-title">${label("titleLabel", "Title")}</FieldLabel><Input id="notification-title" value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={160} required /></Field>
      <Field><FieldLabel htmlFor="notification-body">${label("bodyLabel", "Body")}</FieldLabel><Textarea id="notification-body" value={body} onChange={(event) => onBodyChange(event.target.value)} maxLength={2000} /></Field>
      <Button className="w-fit" type="submit" disabled={pending} aria-busy={pending}>${label("create", "Create notification")}{pending ? "…" : ""}</Button>
    </FieldGroup></form>
  </CardContent></Card>;
}
`;
}
