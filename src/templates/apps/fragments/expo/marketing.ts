/**
 * Expo fragments: React Native marketing page - RNR + Uniwind
 */
import { nativeI18nTemplate } from "../native-i18n.js";

export interface ExpoMarketingOptions {
  readonly hasAuth?: boolean;
  readonly hasI18n?: boolean;
  readonly reduceUnauthenticated?: boolean;
}

export function buildExpoMarketingContent(options: ExpoMarketingOptions = {}): string {
  const hasAuth = options.hasAuth ?? true;
  const hasI18n = options.hasI18n ?? false;
  const reduced = !hasAuth && (options.reduceUnauthenticated ?? false);
  const i18n = nativeI18nTemplate(hasI18n, "marketing");
  const i18nImport = hasI18n ? 'import { LocaleSwitcher, useTranslations } from "@/lib/i18n";' : "";
  const localeSwitcher = hasI18n
    ? '        <View className="flex-row justify-end"><LocaleSwitcher /></View>\n'
    : "";
  const authImports = hasAuth
    ? `import { Link } from 'expo-router';
import { Button } from '@/components/ui/button';`
    : "";
  const authActions = hasAuth
    ? `        <View className="flex-row gap-3 mt-2">
          <Link href="/(auth)/sign-up" asChild><Button><Text>${i18n.child("ctaSignUp", "Sign up")}</Text></Button></Link>
          <Link href="/(auth)/sign-in" asChild><Button variant="outline"><Text>${i18n.child("ctaSignIn", "Sign in")}</Text></Button></Link>
        </View>`
    : "";
  const integrationCards = reduced
    ? ""
    : `
          <Card><CardHeader><CardTitle>${i18n.child("features.apiTitle", "Pure oRPC")}</CardTitle><CardDescription>${i18n.child("features.apiDescriptionNext", "Contract-first, typed end-to-end.")}</CardDescription></CardHeader></Card>
          <Card><CardHeader><CardTitle>${i18n.child("features.billingTitle", "Flexible billing")}</CardTitle><CardDescription>${i18n.child("features.billingDescription", "Stripe, Chargily, Paddle, Polar — any combo.")}</CardDescription></CardHeader></Card>`;
  const eyebrowKey = reduced ? "features.scaffoldTitle" : "hero.eyebrow";
  const eyebrowFallback = reduced
    ? "Expo Router · React Query · RNR + Uniwind"
    : "Bun only · oRPC · Better Auth · Expo + RNR + Uniwind";
  const descriptionKey = reduced ? "features.description" : "heroSubtitle";
  const descriptionFallback = reduced
    ? "A focused Expo foundation with native navigation, shared tokens, and deliberate server-state policies."
    : "Next.js App Router, Drizzle, oRPC contract-first, Better Auth, flexible billing. Native-ready with Expo Router, single codebase.";
  return `import { View, ScrollView } from 'react-native';
${authImports}
import { Text } from '@/components/ui/text';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
${i18nImport}

export default function MarketingScreen() {
${i18n.hookLine}
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-6 gap-4 pt-[72px]">
${localeSwitcher}        <Badge variant="secondary" className="self-start"><Text className="text-xs">${i18n.child(eyebrowKey, eyebrowFallback)}</Text></Badge>
        <Text className="text-4xl font-extrabold tracking-tight text-foreground">${i18n.child("hero.title", "Opinionated modular monolith that scales with you")}</Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">${i18n.child(descriptionKey, descriptionFallback)}</Text>
${authActions}
        <View className="mt-6 gap-3">
          <Card><CardHeader><CardTitle>${i18n.child("features.architectureTitle", "Modular monolith")}</CardTitle><CardDescription>${i18n.child("features.architectureDescription", "Bounded contexts, domain purity, build-time layer checks.")}</CardDescription></CardHeader></Card>${integrationCards}
        </View>
        <Text className="mt-6 text-xs text-muted-foreground text-center">${i18n.child("features.description", "Built with Expo + RNR + Uniwind + OKLCH shared theme")}</Text>
      </View>
    </ScrollView>
  );
}
`;
}
