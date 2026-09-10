import { file, type TemplateFile } from "../../../shared.js";
/**
 * Expo header + sign-out fragments - RNR + Uniwind className, no StyleSheet, no hardcoded hex
 */

export function expoHeaderContent(hasI18n = false, hasEve = false, hasPdf = false): string {
  const i18nImport = hasI18n ? 'import { LocaleSwitcher, useTranslations } from "@/lib/i18n";' : "";
  const i18nHook = hasI18n ? '  const t = useTranslations("header");\n' : "";
  const label = (key: string, fallback: string): string => (hasI18n ? `{t("${key}")}` : fallback);
  return `import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter, Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Skeleton } from "@/components/ui/skeleton";
${i18nImport}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\\s+/);
    if (parts.length >= 2) return \`\${parts[0][0]}\${parts[parts.length - 1][0]}\`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "U";
}

export function Header(): React.JSX.Element {
${i18nHook}  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const isAuthed = !!user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <View className="border-b border-border bg-background">
      <View className="min-h-14 flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-3">
          <Link href="/" asChild>
            <Button variant="ghost" size="sm" accessibilityLabel={${hasI18n ? 't("home")' : '"GhostInit home"'}}><BrandWordmark /></Button>
          </Link>
        </View>
        <View className="flex-row items-center gap-2">
          ${hasI18n ? "<LocaleSwitcher />" : ""}
          {isPending ? (
            <Skeleton accessibilityLabel={${hasI18n ? 't("userMenu")' : '"Loading account"'}} className="size-11 rounded-full" />
          ) : isAuthed ? (
            <Button size="icon" variant="secondary" accessibilityLabel={${hasI18n ? 't("userMenu")' : '"Open account settings"'}} onPress={() => router.push("/settings")}><Text className="text-[11px] font-bold">{initials}</Text></Button>
          ) : (
            <View className="flex-row gap-2">
              <Link href="/sign-in" asChild><Button variant="outline" size="sm"><Text>${label("signIn", "Sign in")}</Text></Button></Link>
              <Link href="/sign-up" asChild><Button size="sm"><Text>${label("signUp", "Sign up")}</Text></Button></Link>
            </View>
          )}
        </View>
      </View>
      {isAuthed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 px-4 pb-2">
          <Link href="/dashboard" asChild><Button variant="ghost" size="sm"><Text>${label("dashboard", "Dashboard")}</Text></Button></Link>
          ${hasEve ? `<Link href="/agent" asChild><Button variant="ghost" size="sm"><Text>${label("agent", "Agent")}</Text></Button></Link>` : ""}
          ${hasPdf ? `<Link href="/pdf" asChild><Button variant="ghost" size="sm"><Text>${label("pdf", "PDF")}</Text></Button></Link>` : ""}
          <Link href="/billing" asChild><Button variant="ghost" size="sm"><Text>${label("billing", "Billing")}</Text></Button></Link>
          <Link href="/settings" asChild><Button variant="ghost" size="sm"><Text>${label("settings", "Settings")}</Text></Button></Link>
        </ScrollView>
      ) : null}
    </View>
  );
}
`;
}

export function expoSignOutButtonContent(_hasI18n = false): string {
  return 'export { SignOutButton } from "@/features/app-shell/sign-out-button";\n';
}
export function expoShellFeatureFiles(
  sourceRoot: string,
  headerSource: string,
  hasI18n: boolean,
): TemplateFile[] {
  const root = `${sourceRoot}/features/app-shell`;
  const modelStart = headerSource.indexOf("function getInitials(");
  const modelEnd = headerSource.indexOf("export function Header", modelStart);
  const model = headerSource
    .slice(modelStart, modelEnd)
    .replace("function getInitials", "export function getInitials");
  const header = (headerSource.slice(0, modelStart) + headerSource.slice(modelEnd))
    .replace(
      'import { useRouter, Link } from "expo-router";',
      'import { Link } from "expo-router";',
    )
    .replace(
      'import { authClient } from "@/lib/auth-client";',
      'import { useHeaderIdentity } from "./queries";\nimport { getInitials } from "./model";',
    )
    .replace(
      "  const router = useRouter();\n  const { data: session, isPending } = authClient.useSession();\n  const user = session?.user;",
      "  const { user, isPending } = useHeaderIdentity();",
    )
    .replace(
      '<Button size="icon" variant="secondary"',
      '<Link href="/settings" asChild><Button size="icon" variant="secondary"',
    )
    .replace(' onPress={() => router.push("/settings")}', "")
    .replace("{initials}</Text></Button>", "{initials}</Text></Button></Link>");
  return [
    file(
      `${sourceRoot}/components/header.tsx`,
      'export { Header } from "@/features/app-shell/header";\n',
    ),
    file(`${root}/header.tsx`, header),
    file(`${root}/model.ts`, model),
    file(
      `${root}/queries.ts`,
      `import { authClient } from "@/lib/auth-client";
export function useHeaderIdentity() { const { data: session, isPending } = authClient.useSession(); return { user: session?.user, isPending }; }
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import { authClient } from "@/lib/auth-client";
export async function signOutMobile(): Promise<void> { await authClient.signOut(); }
`,
    ),
    file(
      `${root}/use-sign-out.ts`,
      `import { useState } from "react";
import { useRouter } from "expo-router";
import { signOutMobile } from "./mutations";
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut(): Promise<void> {
    setPending(true);
    try { await signOutMobile(); } finally { setPending(false); router.replace("/"); }
  }
  return { pending, signOut };
}
`,
    ),
    file(
      `${root}/sign-out-button.tsx`,
      `import type * as React from "react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "./use-sign-out";
${hasI18n ? 'import { useTranslations } from "@/lib/i18n";' : ""}
export function SignOutButton(): React.JSX.Element {
${hasI18n ? '  const t = useTranslations("navigation");' : ""}
  const { pending, signOut } = useSignOut();
  return <Button size="sm" variant="outline" accessibilityLabel={${hasI18n ? 't("signOut")' : '"Sign out"'}} isLoading={pending} onPress={signOut} disabled={pending}>{${hasI18n ? 't("signOut")' : '"Sign out"'}}</Button>;
}
`,
    ),
  ];
}
