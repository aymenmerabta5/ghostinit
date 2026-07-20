/**
 * Expo fragments: React Native marketing page - RNR + Uniwind
 */

export function buildExpoMarketingContent(): string {
  return `import { View, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const HERO_TITLE = 'Opinionated modular monolith that scales with you';

export default function MarketingScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-6 gap-4 pt-[72px]">
        <Badge variant="secondary" className="self-start"><Text className="text-xs">Bun only · oRPC · Better Auth · Expo + RNR + Uniwind</Text></Badge>
        <Text className="text-4xl font-extrabold tracking-tight text-foreground">{HERO_TITLE}</Text>
        <Text className="text-[15px] leading-6 text-muted-foreground">Next.js App Router, Drizzle, oRPC contract-first, Better Auth, flexible billing. Native-ready with Expo Router, single codebase.</Text>
        <View className="flex-row gap-3 mt-2">
          <Link href="/(auth)/sign-up" asChild><Button><Text>Sign up</Text></Button></Link>
          <Link href="/(auth)/sign-in" asChild><Button variant="outline"><Text>Sign in</Text></Button></Link>
        </View>
        <View className="mt-6 gap-3">
          <Card><CardHeader><CardTitle>Modular monolith</CardTitle><CardDescription>Bounded contexts, domain purity, build-time layer checks.</CardDescription></CardHeader></Card>
          <Card><CardHeader><CardTitle>Pure oRPC</CardTitle><CardDescription>Contract-first, typed end-to-end.</CardDescription></CardHeader></Card>
          <Card><CardHeader><CardTitle>Flexible billing</CardTitle><CardDescription>Stripe, Chargily, Paddle, Polar — any combo.</CardDescription></CardHeader></Card>
        </View>
        <Text className="mt-6 text-xs text-muted-foreground text-center">Built with Expo + RNR + Uniwind + OKLCH shared theme</Text>
      </View>
    </ScrollView>
  );
}
`;
}
