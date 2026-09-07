import { nativeI18nTemplate } from "../native-i18n.js";

export interface ExpoMarketingOptions {
  readonly hasAuth: boolean;
  readonly hasApi: boolean;
  readonly hasBilling: boolean;
  readonly hasI18n?: boolean;
}

export function buildExpoMarketingContent(options: ExpoMarketingOptions): string {
  const { hasAuth, hasApi, hasBilling } = options;
  const hasI18n = options.hasI18n ?? false;
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
    ? `        <View className="flex-row flex-wrap gap-3 mt-2">
          <Link href="/(auth)/sign-up" asChild><Button><Text>${i18n.child("ctaSignUp", "Sign up")}</Text></Button></Link>
          <Link href="/(auth)/sign-in" asChild><Button variant="outline"><Text>${i18n.child("ctaSignIn", "Sign in")}</Text></Button></Link>
        </View>`
    : "";
  const integrationCards = [
    hasApi
      ? `
          <Card><CardHeader><CardTitle>${i18n.child("features.apiTitle", "Connected, with confidence")}</CardTitle><CardDescription>${i18n.child("features.apiDescriptionNext", "Typed oRPC calls connect your interface to application operations.")}</CardDescription></CardHeader></Card>`
      : "",
    hasBilling
      ? `
          <Card><CardHeader><CardTitle>${i18n.child("features.billingTitle", "Billing that fits")}</CardTitle><CardDescription>${i18n.child("features.billingDescription", "Your selected payment providers share consistent checkout and account workflows.")}</CardDescription></CardHeader></Card>`
      : "",
  ].join("");
  return `import { View, ScrollView } from 'react-native';
${authImports}
import { Text } from '@/components/ui/text';
${hasAuth ? "" : "import { BrandWordmark } from '@/components/brand-wordmark';"}
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
${i18nImport}

export default function MarketingScreen() {
${i18n.hookLine}
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-xl self-center px-6 pb-10 pt-16 gap-5">
${localeSwitcher}${hasAuth ? "" : "        <BrandWordmark />\n"}
        <Text className="text-sm text-muted-foreground">${i18n.child("hero.eyebrow", "Your application starts here")}</Text>
        <Text accessibilityRole="header" className="text-4xl font-semibold tracking-tight text-foreground">
          ${i18n.child("hero.title", "Your next idea,")}{"\\n"}
          <Text className="text-4xl font-semibold tracking-tight text-primary">${i18n.child("hero.titleAccent", "with a head start.")}</Text>
        </Text>
        <Text className="text-base leading-7 text-muted-foreground">${i18n.child("heroSubtitle", "A clear foundation for your next application, with shared design and the capabilities you choose.")}</Text>
${authActions}
        <View className="mt-6 gap-3">
          <Card><CardHeader><CardTitle>${i18n.child("single.tokensTitle", "One design, down to the details")}</CardTitle><CardDescription>${i18n.child("single.tokensDescription", "Shared colors, typography, and controls bring every screen together. Light and dark, from the start.")}</CardDescription></CardHeader></Card>${integrationCards}
        </View>
        <Text className="mt-6 text-xs text-muted-foreground text-center">${i18n.child("footer.tagline", "Made with GhostInit. Make it your own.")}</Text>
      </View>
    </ScrollView>
  );
}
`;
}
