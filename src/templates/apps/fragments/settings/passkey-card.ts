import { file, type TemplateFile } from "../../../shared.js";

/** Browser-only WebAuthn management surface. Emitted only for Postgres web clients. */
export function settingsPasskeyCardContent(
  dataAccess: "direct" | "feature-adapter" = "direct",
): string {
  const dataImport =
    dataAccess === "feature-adapter"
      ? `import { usePasskeyListQuery } from "./queries";
import { deletePasskey, isPasskeyRecentAuthenticationError, registerPasskey, renamePasskey } from "./mutations";`
      : `import { identityPasskeyClient, isIdentityRecentAuthenticationError } from "@/lib/auth-client";`;
  const listQuery =
    dataAccess === "feature-adapter" ? "usePasskeyListQuery" : "identityPasskeyClient.useList";
  const recentAuthenticationError =
    dataAccess === "feature-adapter"
      ? "isPasskeyRecentAuthenticationError"
      : "isIdentityRecentAuthenticationError";
  const register =
    dataAccess === "feature-adapter" ? "registerPasskey" : "identityPasskeyClient.register";
  const rename =
    dataAccess === "feature-adapter" ? "renamePasskey" : "identityPasskeyClient.rename";
  const remove =
    dataAccess === "feature-adapter" ? "deletePasskey" : "identityPasskeyClient.delete";
  return `"use client";

import type * as React from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
${dataImport}
import { useSurfaceTranslations } from "@/lib/translations";
import { PasskeyList, type PasskeySummary } from "./passkey-list";

export function PasskeyCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const passkeyQuery = ${listQuery}();
  const passkeys: PasskeySummary[] = passkeyQuery.data ?? [];
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const errorMessage = (cause: unknown): string =>
    ${recentAuthenticationError}(cause)
      ? t("passkeys.reauthenticate")
      : t("passkeys.genericError");

  async function register(): Promise<void> {
    setPending("register"); setError(null); setSuccess(null);
    try {
      const result = await ${register}({ name: newName.trim() || undefined });
      if (result.error) { setError(errorMessage(result.error)); return; }
      setNewName(""); setSuccess(t("passkeys.registered")); await passkeyQuery.refetch();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(null); }
  }

  async function rename(id: string, fallback: string): Promise<void> {
    const name = (names[id] ?? fallback).trim();
    if (!name) { setError(t("passkeys.nameRequired")); return; }
    setPending(id + ":rename"); setError(null); setSuccess(null);
    try {
      const result = await ${rename}({ id, name });
      if (result.error) { setError(errorMessage(result.error)); return; }
      setSuccess(t("passkeys.renamed")); await passkeyQuery.refetch();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(null); }
  }

  async function remove(id: string): Promise<void> {
    setPending(id + ":delete"); setError(null); setSuccess(null);
    try {
      const result = await ${remove}({ id });
      if (result.error) { setError(errorMessage(result.error)); return; }
      setSuccess(t("passkeys.deleted")); await passkeyQuery.refetch();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setPending(null); }
  }

  return <Card><CardHeader><div className="flex items-center justify-between gap-3">
    <CardTitle className="text-base">{t("passkeys.title")}</CardTitle><Badge variant="secondary">{passkeys.length}</Badge>
  </div><CardDescription className="max-w-[65ch]">{t("passkeys.description")}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {passkeyQuery.error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{errorMessage(passkeyQuery.error)}</AlertDescription></Alert> : null}
      {success ? <Alert><AlertTitle>{t("passkeys.successTitle")}</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row"><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("passkeys.namePlaceholder")} maxLength={64} /><Button disabled={pending !== null} onClick={() => void register()}>{pending === "register" ? t("passkeys.registering") : t("passkeys.register")}</Button></div>
      <PasskeyList passkeys={passkeys} names={names} pending={pending} onNameChange={(id, name) => setNames((current) => ({ ...current, [id]: name }))} onRename={rename} onDelete={remove} />
    </CardContent>
  </Card>;
}
`;
}

export function settingsPasskeyListContent(): string {
  return `"use client";

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSurfaceTranslations } from "@/lib/translations";

export interface PasskeySummary {
  readonly id: string;
  readonly name?: string;
  readonly createdAt: Date | string;
  readonly deviceType: string;
  readonly backedUp: boolean;
}

interface PasskeyListProps {
  readonly passkeys: readonly PasskeySummary[];
  readonly names: Readonly<Record<string, string>>;
  readonly pending: string | null;
  readonly onNameChange: (id: string, name: string) => void;
  readonly onRename: (id: string, fallback: string) => void | Promise<void>;
  readonly onDelete: (id: string) => void | Promise<void>;
}

export function PasskeyList(props: PasskeyListProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  if (props.passkeys.length === 0) return <p className="text-sm text-muted-foreground">{t("passkeys.empty")}</p>;
  return <div className="flex flex-col gap-3">{props.passkeys.map((passkey) => {
    const fallback = passkey.name ?? t("passkeys.unnamed");
    return <div key={passkey.id} className="flex flex-col gap-3 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{fallback}</p><p className="text-xs text-muted-foreground">{t("passkeys.createdAt", { date: new Date(passkey.createdAt).toLocaleDateString() })}</p></div><Badge variant="outline">{passkey.backedUp ? t("passkeys.synced") : passkey.deviceType}</Badge></div><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={t("passkeys.renameLabel")} value={props.names[passkey.id] ?? fallback} onChange={(event) => props.onNameChange(passkey.id, event.target.value)} maxLength={64} /><Button variant="outline" disabled={props.pending !== null} onClick={() => void props.onRename(passkey.id, fallback)}>{t("passkeys.rename")}</Button><Button variant="destructive" disabled={props.pending !== null} onClick={() => void props.onDelete(passkey.id)}>{t("passkeys.delete")}</Button></div></div>;
  })}</div>;
}
`;
}

export function settingsPasskeyCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/passkey-card.tsx",
    settingsPasskeyCardContent(),
  );
}

export function settingsPasskeyList(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/passkey-list.tsx",
    settingsPasskeyListContent(),
  );
}
