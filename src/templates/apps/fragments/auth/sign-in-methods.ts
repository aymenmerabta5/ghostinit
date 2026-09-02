import type { RouterType } from "./imports.js";

/** OAuth and optional WebAuthn orchestration split from the credential form. */
export function signInMethodsContent(router: RouterType, hasPasskey = true): string {
  const isTanstack = router === "tanstack";
  const navigationImport = hasPasskey
    ? isTanstack
      ? 'import { useNavigate } from "@tanstack/react-router";'
      : 'import { useRouter } from "next/navigation";'
    : "";
  const navigationHook = hasPasskey
    ? isTanstack
      ? "  const navigate = useNavigate();"
      : "  const router = useRouter();"
    : "";
  const passkeyImport = hasPasskey ? ", identityPasskeyClient" : "";
  const buttonImport = hasPasskey ? 'import { Button } from "@/components/ui/button";' : "";
  const passkeyHandler = hasPasskey
    ? `
  async function signInWithPasskey(): Promise<void> {
    setError(null);
    try {
      const result = await identityPasskeyClient.authenticate();
      if (result.error) { setError(t("signIn.passkeyError")); return; }
      ${isTanstack ? 'await navigate({ to: "/dashboard" });' : 'router.push("/dashboard");'}
    } catch { setError(t("signIn.passkeyError")); }
  }
`
    : "";
  const passkeyButton = hasPasskey
    ? `<Button type="button" variant="outline" className="w-full" onClick={() => void signInWithPasskey()}>{t("signIn.passkey")}</Button>`
    : "";
  return `"use client";

import type * as React from "react";
import { useState } from "react";
${navigationImport}
import { AuthOAuthButtons } from "./oauth-buttons.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
${buttonImport}
import { identityClient${passkeyImport}, type IdentityOAuthProvider } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function SignInMethods(): React.JSX.Element {
${navigationHook}
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  async function signInWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) setError(t("signIn.genericError"));
    } catch { setError(t("signIn.genericError")); }
  }
${passkeyHandler}
  return <div className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("signIn.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <AuthOAuthButtons googleLabel={t("signIn.oauthGoogle")} githubLabel={t("signIn.oauthGitHub")} separatorLabel={t("signIn.or")} onSelect={signInWithOAuth} />
    ${passkeyButton}
  </div>;
}
`;
}
