import type { RouterType } from "./imports.js";

export function signInMethodsContent(_router: RouterType, hasPasskey = true): string {
  return `"use client";
import type * as React from "react";
import { AuthOAuthButtons } from "./oauth-buttons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
${hasPasskey ? 'import { Button } from "@/components/ui/button";' : ""}
import { useSurfaceTranslations } from "@/lib/translations";
import type { AuthMethodsState } from "../types";

export function SignInMethods({ state, disabled = false }: { state: AuthMethodsState; disabled?: boolean }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  return <div className="flex flex-col gap-4">
    {state.error ? <Alert variant="destructive"><AlertTitle>{t("signIn.errorTitle")}</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    <AuthOAuthButtons googleLabel={t("signIn.oauthGoogle")} githubLabel={t("signIn.oauthGitHub")} separatorLabel={t("signIn.or")} onSelect={state.onOAuth} disabled={disabled || state.pending} />
    ${hasPasskey ? '<Button type="button" variant="outline" className="w-full" disabled={disabled || state.pending} onClick={() => void state.onPasskey()}>{t("signIn.passkey")}</Button>' : ""}
  </div>;
}
`;
}
