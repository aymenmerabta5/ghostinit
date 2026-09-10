import { file, type TemplateFile } from "../../../shared.js";
import { authFeatureFiles } from "./feature.js";
import { authRouteContent } from "./feature-routes.js";
import { resetPasswordPageContent } from "../recovery/reset-password.js";
import { platformSurfaceTranslationFiles } from "../platform-surface-translations.js";
import {
  expoAuthFrameContent,
  expoCredentialFormContent,
  expoChallengeFormContent,
  expoForgotFormContent,
  expoResetFormContent,
  expoEmailFormContent,
} from "./native-expo-views.js";

export type NativeAuthMode = "single" | "monorepo";
export type NativeAuthPlatform = "desktop" | "expo";

export function nativeAuthRoot(platform: NativeAuthPlatform, mode: NativeAuthMode): string {
  return platform === "desktop"
    ? `${mode === "monorepo" ? "apps/desktop/" : ""}src/renderer`
    : `${mode === "monorepo" ? "apps/mobile/" : ""}src`;
}
export function nativeAuthAlias(platform: NativeAuthPlatform, mode: NativeAuthMode): string {
  return platform === "desktop" && mode === "single" ? "@/renderer" : "@";
}

function adaptNativeAuth(
  source: string,
  platform: NativeAuthPlatform,
  mode: NativeAuthMode,
): string {
  let content = source;
  if (platform === "desktop") content = content.replaceAll('"@/lib/auth-client"', '"@/lib/auth"');
  else
    content = content
      .replace(
        'import { useAppForm } from "@/components/ui/form";',
        'import { useForm } from "@tanstack/react-form";',
      )
      .replaceAll("useAppForm(", "useForm(");
  if (platform === "desktop" && mode === "single")
    content = content
      .replaceAll('"@/lib/', '"@/renderer/lib/')
      .replaceAll('"@/hooks/', '"@/renderer/hooks/')
      .replaceAll('"@/features/', '"@/renderer/features/');
  return content;
}

/** Same public form/intent contracts as web, with native SDK and navigation adapters. */
export function nativeAuthWorkflowFiles(
  platform: NativeAuthPlatform,
  mode: NativeAuthMode,
  hasEmail: boolean,
  hasI18n: boolean,
): TemplateFile[] {
  const sourceRoot = nativeAuthRoot(platform, mode);
  const root = `${sourceRoot}/features/auth`;
  const alias = nativeAuthAlias(platform, mode);
  const files = authFeatureFiles({
    router: "tanstack",
    sourceRoot,
    hasEmail,
    hasPasskey: false,
    includePureClientFiles: false,
  })
    .filter((entry) => platform === "desktop" || !entry.path.endsWith(".tsx"))
    .map((entry) => {
      let content = adaptNativeAuth(entry.content, platform, mode);
      if (entry.path.endsWith("/use-auth-methods.ts")) {
        content = content
          .replace(
            "const result = await signInWithOAuth(provider);",
            "const result = await signInWithOAuth(provider);\n      if (!result.error && ticket.isCurrent()) await onAuthenticated();",
          )
          .replace("  void onAuthenticated;\n", "");
      }
      if (platform === "expo" && entry.path.endsWith("/use-two-factor-form.ts")) {
        content = content.replace("trustDevice: value.trustDevice", "trustDevice: false");
      }
      return file(entry.path, content);
    });
  files.push(
    ...platformSurfaceTranslationFiles(sourceRoot, hasI18n),
    file(
      `${root}/queries.ts`,
      `import { authClient } from "${alias}/lib/${platform === "desktop" ? "auth" : "auth-client"}";
export function useAuthSessionQuery() { return authClient.useSession(); }
`,
    ),
  );
  if (platform === "expo") {
    const index = files.findIndex((entry) => entry.path.endsWith("/use-auth-navigation.ts"));
    files[index] = file(
      `${root}/use-auth-navigation.ts`,
      `import { useRouter } from "expo-router";
export function useAuthNavigation() {
  const router = useRouter();
  return {
    dashboard: () => router.replace("/dashboard"),
${
  hasEmail
    ? `    afterSignIn: (twoFactor: boolean) => router.replace(twoFactor ? "/2fa" : "/dashboard"),
    afterSignUp: (hasSession: boolean) => router.replace(hasSession ? "/dashboard" : "/verify-email"),
    afterPasswordReset: () => router.replace({ pathname: "/sign-in", params: { reset: "success" } }),`
    : ""
}
  };
}
`,
    );
  }
  if (hasEmail) {
    const index = files.findIndex((entry) => entry.path.endsWith("/mutations.ts"));
    const mutations = files[index];
    if (!mutations) throw new Error("Native auth mutations were not emitted");
    files[index] = file(
      mutations.path,
      mutations.content +
        `
export function enableTwoFactor(password: string) { return identityClient.enableTwoFactor({ password }); }
export function verifyTwoFactorSetup(code: string) { return identityClient.verifyTwoFactor({ code, trustDevice: false }); }
`,
    );
  }
  return files;
}

export function desktopAuthFeatureFiles(
  mode: NativeAuthMode,
  hasEmail: boolean,
  hasI18n: boolean,
): TemplateFile[] {
  const sourceRoot = nativeAuthRoot("desktop", mode);
  const root = `${sourceRoot}/features/auth`;
  const files = nativeAuthWorkflowFiles("desktop", mode, hasEmail, hasI18n);
  for (const [path, screen] of [
    ["sign-in", "SignInScreen"],
    ["sign-up", "SignUpScreen"],
    ...(hasEmail
      ? [
          ["2fa", "TwoFactorScreen"],
          ["forgot-password", "ForgotPasswordScreen"],
          ["magic-link", "MagicLinkScreen"],
          ["verify-email", "VerifyEmailScreen"],
        ]
      : []),
  ]) {
    files.push(
      file(
        `${sourceRoot}/routes/${path}.tsx`,
        adaptNativeAuth(authRouteContent("tanstack", path!, screen!), "desktop", mode),
      ),
    );
  }
  if (hasEmail) {
    files.push(
      file(
        `${sourceRoot}/routes/reset-password.tsx`,
        adaptNativeAuth(resetPasswordPageContent("tanstack"), "desktop", mode),
      ),
    );
    const challenge = files.findIndex((entry) => entry.path === `${root}/two-factor-screen.tsx`);
    const previous = files[challenge];
    if (!previous) throw new Error("Native two-factor challenge was not emitted");
    files[challenge] = file(
      `${root}/two-factor-challenge.tsx`,
      previous.content.replace(
        "export function TwoFactorScreen",
        "export function TwoFactorChallenge",
      ),
    );
    files.push(...desktopTwoFactorSetupFiles(mode));
  }
  return files;
}

function desktopTwoFactorSetupFiles(mode: NativeAuthMode): TemplateFile[] {
  const root = `${nativeAuthRoot("desktop", mode)}/features/auth`;
  const alias = nativeAuthAlias("desktop", mode);
  return [
    file(
      `${root}/two-factor-screen.tsx`,
      `import type * as React from "react";
import { TwoFactorChallenge } from "./two-factor-challenge";
import { TwoFactorSetupView } from "./components/two-factor-setup";
import { useTwoFactorSetup } from "./use-two-factor-setup";
export function TwoFactorScreen(): React.JSX.Element {
  const state = useTwoFactorSetup();
  return state.isAuthenticated || state.loading ? <TwoFactorSetupView state={state} /> : <TwoFactorChallenge />;
}

`,
    ),
    file(
      `${root}/use-two-factor-setup.ts`,
      `import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "${alias}/lib/translations";
import { createRequiredPasswordSchema, createTotpSchema } from "${alias}/lib/auth-validation";
import { useAuthOwnedMutation } from "${alias}/hooks/use-auth-owned-mutation";
import { useAuthSessionQuery } from "./queries";
import { enableTwoFactor, verifyTwoFactorSetup } from "./mutations";
export function useTwoFactorSetup() {
  const t = useSurfaceTranslations("settings");
  const session = useAuthSessionQuery();
  const enable = useAuthOwnedMutation(async (password: string) => {
    const result = await enableTwoFactor(password);
    if (result.error || !result.data?.totpURI) throw new Error("Two-factor setup failed");
    return result.data.totpURI;
  });
  const verify = useAuthOwnedMutation(async (code: string) => {
    const result = await verifyTwoFactorSetup(code);
    if (result.error) throw new Error("Two-factor verification failed");
    return true;
  }, { onSuccess: async (_data, _input, isCurrent) => { await session.refetch(); if (isCurrent()) enable.reset(); } });
  const passwordForm = useAppForm({ defaultValues: { password: "" }, validators: { onSubmit: createRequiredPasswordSchema(t("twoFactor.passwordDescription")) },
    onSubmit: async ({ value }) => { const result = await enable.run(value.password); if (result.status === "success" && result.isCurrent()) passwordForm.reset(); } });
  const codeForm = useAppForm({ defaultValues: { code: "" }, validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) },
    onSubmit: async ({ value }) => { const result = await verify.run(value.code); if (result.status === "success" && result.isCurrent()) codeForm.reset(); } });
  return { passwordForm, codeForm, loading: session.isPending, isAuthenticated: Boolean(session.data?.user),
    enabled: Boolean(session.data?.user?.twoFactorEnabled || verify.isSuccess), totpUri: enable.data,
    error: enable.error ?? verify.error ?? session.error, pending: enable.isPending || verify.isPending };
}
export type TwoFactorSetupState = ReturnType<typeof useTwoFactorSetup>;
`,
    ),
    file(
      `${root}/components/two-factor-setup.tsx`,
      `import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "${alias}/lib/translations";
import type { TwoFactorSetupState } from "../use-two-factor-setup";
export function TwoFactorSetupView({ state }: { state: TwoFactorSetupState }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { passwordForm, codeForm } = state;
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6"><h1 className="text-2xl font-semibold">{t("twoFactor.title")}</h1><p className="text-muted-foreground">{t("twoFactor.description")}</p>
    {state.loading ? <Skeleton className="h-40 w-full" /> : state.enabled ? <Alert role="status"><AlertDescription>{t("twoFactor.enabledDescription")}</AlertDescription></Alert> : state.totpUri ? <>
      <label className="flex flex-col gap-2">{t("twoFactor.setupUriLabel")}<Input readOnly value={state.totpUri} className="font-mono text-xs" /></label>
      <codeForm.AppForm><Form form={codeForm}><codeForm.AppField name="code">{(field) => <field.OtpField label={t("twoFactor.codeLabel")} length={6} />}</codeForm.AppField><codeForm.SubmitButton disabled={state.pending}>{t("twoFactor.verify")}</codeForm.SubmitButton></Form></codeForm.AppForm>
    </> : <passwordForm.AppForm><Form form={passwordForm}><passwordForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" />}</passwordForm.AppField><passwordForm.SubmitButton disabled={state.pending}>{t("twoFactor.enable")}</passwordForm.SubmitButton></Form></passwordForm.AppForm>}
    {state.error ? <Alert variant="destructive"><AlertDescription>{t("twoFactor.genericError")}</AlertDescription></Alert> : null}
    <Button render={<Link to="/settings" />} nativeButton={false} variant="outline">{t("twoFactor.backSettings")}</Button>
  </main>;
}
`,
    ),
  ];
}

export function expoAuthFeatureFiles(
  mode: NativeAuthMode,
  hasEmail: boolean,
  hasI18n: boolean,
): TemplateFile[] {
  const sourceRoot = nativeAuthRoot("expo", mode);
  const appRoot = mode === "monorepo" ? "apps/mobile/app" : "app";
  const root = `${sourceRoot}/features/auth`;
  const files = nativeAuthWorkflowFiles("expo", mode, hasEmail, hasI18n);
  files.push(
    file(`${root}/components/auth-frame.tsx`, expoAuthFrameContent()),
    file(`${root}/components/sign-in-form.tsx`, expoCredentialFormContent("sign-in", hasEmail)),
    file(`${root}/components/sign-up-form.tsx`, expoCredentialFormContent("sign-up", hasEmail)),
  );
  for (const [slug, name] of [
    ["sign-in", "SignIn"],
    ["sign-up", "SignUp"],
  ] as const) {
    files.push(
      file(
        `${root}/${slug}-screen.tsx`,
        `import type * as React from "react";
import { use${name}Form } from "./use-${slug}-form";
import { ${name}Form } from "./components/${slug}-form";
export function ${name}Screen(): React.JSX.Element { const state = use${name}Form(); return <${name}Form state={state} />; }
`,
      ),
      file(
        `${appRoot}/(auth)/${slug}.tsx`,
        `import { ${name}Screen } from "@/features/auth/${slug}-screen";\nexport default ${name}Screen;\n`,
      ),
    );
  }
  if (hasEmail) {
    files.push(
      file(`${root}/components/two-factor-form.tsx`, expoChallengeFormContent()),
      file(`${root}/components/forgot-password-form.tsx`, expoForgotFormContent()),
      file(`${root}/components/reset-password-form.tsx`, expoResetFormContent()),
      file(`${root}/components/magic-link-form.tsx`, expoEmailFormContent("magic-link")),
      file(`${root}/components/verify-email-form.tsx`, expoEmailFormContent("verify-email")),
      file(
        `${root}/two-factor-screen.tsx`,
        `import type * as React from "react";
import { useTwoFactorForm } from "./use-two-factor-form";
import { TwoFactorForm } from "./components/two-factor-form";
export function TwoFactorScreen({ totpUri }: { totpUri: string }): React.JSX.Element { const state = useTwoFactorForm(); return <TwoFactorForm state={state} totpUri={totpUri} />; }
`,
      ),
      file(
        `${appRoot}/2fa.tsx`,
        `import type * as React from "react";
import { useLocalSearchParams } from "expo-router";
import { TwoFactorScreen } from "@/features/auth/two-factor-screen";
export default function TwoFactorRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ totpURI?: string | string[] }>();
  const totpUri = typeof params.totpURI === "string" ? params.totpURI : params.totpURI?.[0] ?? "";
  return <TwoFactorScreen totpUri={totpUri} />;
}
`,
      ),
      file(
        `${root}/forgot-password-screen.tsx`,
        `import type * as React from "react";
import { useForgotPasswordForm } from "./use-forgot-password-form";
import { ForgotPasswordForm } from "./components/forgot-password-form";
export function ForgotPasswordScreen(): React.JSX.Element { const state = useForgotPasswordForm(); return <ForgotPasswordForm state={state} />; }
`,
      ),
      file(
        `${appRoot}/(auth)/forgot-password.tsx`,
        'import { ForgotPasswordScreen } from "@/features/auth/forgot-password-screen";\nexport default ForgotPasswordScreen;\n',
      ),
      file(
        `${root}/reset-password-screen.tsx`,
        `import type * as React from "react";
import { useResetPasswordForm } from "./use-reset-password-form";
import { ResetPasswordForm } from "./components/reset-password-form";
export function ResetPasswordScreen({ token, queryError }: { token: string; queryError: string | null }): React.JSX.Element { const state = useResetPasswordForm(token, queryError); return <ResetPasswordForm state={state} />; }
`,
      ),
      file(
        `${appRoot}/(auth)/reset-password.tsx`,
        `import type * as React from "react";
import { useLocalSearchParams } from "expo-router";
import { ResetPasswordScreen } from "@/features/auth/reset-password-screen";
function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
export default function ResetPasswordRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  return <ResetPasswordScreen token={first(params.token) ?? ""} queryError={first(params.error) ?? null} />;
}
`,
      ),
    );
    for (const [kind, name] of [
      ["magic-link", "MagicLink"],
      ["verify-email", "VerifyEmail"],
    ] as const) {
      files.push(
        file(
          `${root}/${kind}-screen.tsx`,
          `import type * as React from "react";
import { useEmailFlowForm } from "./use-email-flow-form";
import { EmailFlowForm } from "./components/${kind}-form";
export function ${name}Screen(): React.JSX.Element { const state = useEmailFlowForm("${kind}"); return <EmailFlowForm state={state} />; }
`,
        ),
        file(
          `${appRoot}/(auth)/${kind}.tsx`,
          `import { ${name}Screen } from "@/features/auth/${kind}-screen";\nexport default ${name}Screen;\n`,
        ),
      );
    }
  }
  return files;
}
