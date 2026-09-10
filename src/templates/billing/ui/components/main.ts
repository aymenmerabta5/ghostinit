/**
 * Billing page shell.
 *
 * The provider list is fixed at generation time, so the empty-vs-tabs branch is
 * resolved here rather than emitted as a runtime `PROVIDERS.length === 0` check —
 * against a `as const` tuple TypeScript knows the length is a literal and rejects
 * the comparison with TS2367 ("types '2' and '0' have no overlap"). Emitting only
 * the branch that applies also drops the unused import.
 */
export function mainPageContent(selected: string[], mode: "monorepo" | "single"): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  const hasManual = selected.includes("manual");
  const online = selected.filter((provider) => provider !== "manual");
  const hasProviders = online.length > 0;
  const bodyImport = hasProviders
    ? `import { BillingClientScreen } from "@/features/billing/screen";`
    : hasManual
      ? ""
      : `import { BillingEmpty } from "@/features/billing/components/billing-empty";`;
  const providersConst = hasProviders
    ? `const PROVIDERS: string[] = ${JSON.stringify(online)};\n`
    : "";
  const serverImports = hasProviders
    ? `import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "${applicationModule}";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import type { BillingInitialData } from "@/features/billing/model";`
    : "";
  const dataComponent = hasProviders
    ? `async function BillingData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const scope = { userId: principal.identityUserId, sessionId: principal.sessionId, tenantId: principal.activeOrganizationId, teamId: principal.activeTeamId };
  const snapshot = await application.billing.subscriptions();
  const initialData = JSON.parse(JSON.stringify(snapshot)) as BillingInitialData;
  initialData.canCreatePaymentLinks = me.user.role === "admin" || me.user.role === "superAdmin";
  return <RequestOwnedSnapshot scope={scope}><BillingClientScreen providers={PROVIDERS} initialData={initialData} /></RequestOwnedSnapshot>;
}
`
    : "";
  const body = hasProviders
    ? `<Suspense fallback={<QueryAuthStatus />}><BillingData /></Suspense>`
    : hasManual
      ? ""
      : `<BillingEmpty />`;

  return `import type * as React from "react";
${serverImports}
import { BillingHeader } from "@/features/billing/components/billing-header";
${bodyImport}
${hasManual ? 'import { ManualBillingPanel } from "@/features/manual-payments/screen";' : ""}
${providersConst}${dataComponent}export default function BillingPage(): React.JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <BillingHeader />
        ${body}
        ${hasManual ? "<ManualBillingPanel />" : ""}
      </div>
    </main>
  );
}
`;
}
