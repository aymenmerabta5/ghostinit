import { tanstackSettingsPageContent } from "../../../../apps/fragments/settings/index.js";
import { billingFiles as sharedBillingFiles } from "../../../../apps/fragments/billing/index.js";
import type { TemplateFile } from "../../../../shared.js";
import type { BillingProviderName } from "../../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../../lib/constants.js";
import { singleDashboardRouteContent } from "./dashboard-feature.js";
export { singleDashboardFeatureFilesTanstack } from "./dashboard-feature.js";

export function singleDashboardRouteTanstackContent(isConvex = false): string {
  return singleDashboardRouteContent(isConvex);
}

export function singleSettingsRouteTanstackContent(
  isConvex = false,
  hasIdentityTransport = true,
  hasBilling = true,
): string {
  return tanstackSettingsPageContent(isConvex, "single", hasIdentityTransport, hasBilling);
}
export function singleTanstackBillingFeatureFiles(
  isConvex = false,
  selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): TemplateFile[] {
  return sharedBillingFiles("tanstack", isConvex, selected).map((entry) => {
    const path = entry.path.replace(/^apps\/web\//, "");
    if (path === "src/routes/billing.tsx") {
      return {
        ...entry,
        path,
        content: `import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/billing-page";
import { loadInitialBillingSnapshot, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";

export const Route = createFileRoute("/billing")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([
    loadProtectedRoute(context),
    loadInitialBillingSnapshot(context),
  ]),
  component: BillingPage,
});
`,
      };
    }
    return {
      ...entry,
      path,
      content: entry.content.replaceAll('from "@repo/auth"', 'from "@/server/auth"'),
    };
  });
}

export function singleBillingRouteTanstackContent(isConvex = false): string {
  return (
    singleTanstackBillingFeatureFiles(isConvex).find(
      ({ path }) => path === "src/routes/billing.tsx",
    )?.content ?? ""
  );
}

export function singleNotFoundRouteTanstackContent(): string {
  return [
    "import * as React from 'react'",
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'",
    "import { useSurfaceTranslations } from '@/lib/translations'",
    "",
    "export const Route = createFileRoute('/$notFound')({ component: NotFoundPage })",
    "function NotFoundPage(): React.JSX.Element {",
    "  const t = useSurfaceTranslations('errors')",
    "  return (",
    "    <main className='min-h-screen bg-background flex items-center justify-center p-6'>",
    "      <Card className='w-full max-w-[420px] shadow-sm'>",
    "        <CardHeader><CardTitle className='text-2xl tracking-tight'>{t('notFound.title')}</CardTitle><CardDescription className='max-w-[60ch]'>{t('notFound.description')}</CardDescription></CardHeader>",
    "        <CardContent className='flex flex-col gap-3'><Button render={<Link to='/' />} nativeButton={false}>{t('notFound.backHome')}</Button></CardContent>",
    "      </Card>",
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n");
}
