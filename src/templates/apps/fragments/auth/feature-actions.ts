import type { RouterType } from "./imports.js";

export function authMutationsContent(hasEmail: boolean, hasPasskey: boolean): string {
  return `import { identityClient${hasPasskey ? ", identityPasskeyClient" : ""} } from "@/lib/auth-client";
import type { IdentityOAuthProvider } from "@/lib/auth-model";

export function signInWithOAuth(provider: IdentityOAuthProvider) { return identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" }); }
${hasPasskey ? "export function authenticatePasskey() { return identityPasskeyClient.authenticate(); }" : ""}
${
  hasEmail
    ? `export function signInWithEmail(input: { email: string; password: string }) { return identityClient.signInWithEmail({ ...input, callbackURL: "/dashboard" }); }
export function signUpWithEmail(input: { name: string; email: string; password: string }) { return identityClient.signUpWithEmail({ ...input, callbackURL: "/dashboard" }); }
export function verifyAuthChallenge(method: "authenticator" | "backup", input: { code: string; trustDevice: boolean }) { return method === "backup" ? identityClient.verifyBackupCode(input) : identityClient.verifyTwoFactor(input); }
export function requestPasswordReset(email: string) { return identityClient.requestPasswordReset({ email, redirectTo: "/reset-password" }); }
export function resetPassword(input: { newPassword: string; token: string }) { return identityClient.resetPassword(input); }
export function requestMagicLink(email: string) { return identityClient.requestMagicLink({ email, callbackURL: "/dashboard" }); }
export function requestEmailVerification(email: string) { return identityClient.requestEmailVerification({ email, callbackURL: "/dashboard" }); }`
    : ""
}
`;
}

export function authNavigationHookContent(router: RouterType, hasEmail: boolean): string {
  const next = router === "next";
  return `"use client";
import { ${next ? "useRouter" : "useNavigate"} } from "${next ? "next/navigation" : "@tanstack/react-router"}";

export function useAuthNavigation() {
  const ${next ? "router = useRouter()" : "navigate = useNavigate()"};
  return {
    dashboard: () => ${next ? 'router.push("/dashboard")' : 'navigate({ to: "/dashboard" })'},
${
  hasEmail
    ? `    afterSignIn: (twoFactor: boolean) => ${next ? 'router.push(twoFactor ? "/2fa" : "/dashboard")' : 'navigate({ to: twoFactor ? "/2fa" : "/dashboard" })'},
    afterSignUp: (hasSession: boolean) => ${next ? 'router.push(hasSession ? "/dashboard" : "/verify-email")' : 'navigate({ to: hasSession ? "/dashboard" : "/verify-email" })'},
    afterPasswordReset: () => ${next ? 'router.push("/sign-in?reset=success")' : 'navigate({ to: "/sign-in" })'},`
    : ""
}
  };
}
`;
}

export function authIntentHookContent(): string {
  return `"use client";
import * as React from "react";

/** Public authentication may intentionally change identity; this guards its form lifetime and active intent only. */
export function createAuthIntent() {
  let mounted = false;
  let epoch = 0;
  let busy = false;
  return {
    mount() { mounted = true; epoch += 1; },
    retire() { mounted = false; epoch += 1; busy = false; },
    begin() {
      if (!mounted || busy) return null;
      busy = true;
      const generation = epoch;
      const isCurrent = () => mounted && generation === epoch;
      return { isCurrent, finish: () => { if (isCurrent()) busy = false; } };
    },
  };
}
export function useAuthIntent() {
  const reference = React.useRef<ReturnType<typeof createAuthIntent> | null>(null);
  if (!reference.current) reference.current = createAuthIntent();
  const intent = reference.current;
  React.useEffect(() => { intent.mount(); return () => intent.retire(); }, [intent]);
  return intent;
}
export type AuthIntent = ReturnType<typeof createAuthIntent>;
`;
}

export function authMethodsHookContent(hasPasskey: boolean): string {
  return `"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { IdentityOAuthProvider } from "@/lib/auth-model";
import { signInWithOAuth${hasPasskey ? ", authenticatePasskey" : ""} } from "./mutations";
import type { AuthIntent } from "./use-auth-intent";

type MethodState = { phase: "idle" } | { phase: "running" } | { phase: "failed"; message: string };
export function useAuthMethods(intent: AuthIntent, onAuthenticated: () => void | Promise<void>, scope: "signIn" | "signUp", onStart: () => void = () => {}) {
  const t = useSurfaceTranslations("auth");
  const [state, dispatch] = React.useReducer((_state: MethodState, next: MethodState) => next, { phase: "idle" } as MethodState);
  async function onOAuth(provider: IdentityOAuthProvider): Promise<void> {
    const ticket = intent.begin(); if (!ticket) return;
    onStart(); dispatch({ phase: "running" });
    try {
      const result = await signInWithOAuth(provider);
      if (ticket.isCurrent()) dispatch(result.error ? { phase: "failed", message: t(scope === "signIn" ? "signIn.genericError" : "signUp.genericError") } : { phase: "idle" });
    } catch { if (ticket.isCurrent()) dispatch({ phase: "failed", message: t(scope === "signIn" ? "signIn.genericError" : "signUp.genericError") }); }
    finally { ticket.finish(); }
  }
${
  hasPasskey
    ? `  async function onPasskey(): Promise<void> {
    const ticket = intent.begin(); if (!ticket) return;
    onStart(); dispatch({ phase: "running" });
    try {
      const result = await authenticatePasskey();
      if (!ticket.isCurrent()) return;
      if (result.error) dispatch({ phase: "failed", message: t("signIn.passkeyError") });
      else { dispatch({ phase: "idle" }); await onAuthenticated(); }
    } catch { if (ticket.isCurrent()) dispatch({ phase: "failed", message: t("signIn.passkeyError") }); }
    finally { ticket.finish(); }
  }
`
    : "  void onAuthenticated;\n"
}
  return { onOAuth, ${hasPasskey ? "onPasskey, " : ""}pending: state.phase === "running", error: state.phase === "failed" ? state.message : null, reset: () => dispatch({ phase: "idle" }) };
}
`;
}
