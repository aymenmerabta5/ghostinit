export type NativeBillingPlatform = "expo" | "desktop";
export type NativeBillingMode = "single" | "monorepo";

export function nativeBillingAlias(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
): string {
  return platform === "desktop" && mode === "single" ? "@/renderer" : "@";
}

/** Retains the platform's existing URL admission and browser/IPC implementation. */
export function nativeBillingMutationsContent(
  platform: NativeBillingPlatform,
  mode: NativeBillingMode,
  source: string,
): string {
  const alias = nativeBillingAlias(platform, mode);
  const from = source.indexOf(
    platform === "expo" ? "function secureRequestKey()" : "async function openProviderUrl(",
  );
  const to = source.indexOf(
    platform === "expo"
      ? "export default function BillingScreen()"
      : 'export const Route = createFileRoute("/billing")',
  );
  if (from < 0 || to <= from)
    throw new Error("Native billing platform fragment boundary is missing");
  const platformImports =
    platform === "expo"
      ? `import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";
WebBrowser.maybeCompleteAuthSession();`
      : "";
  const returnUrl = platform === "expo" ? "billingReturnUrl" : "desktopBillingReturnUrl";
  const open = (url: string, returnValue?: string) =>
    platform === "expo"
      ? `await openProviderUrl(${url}, isCurrent${returnValue ? `, ${returnValue}` : ""});`
      : `if (isCurrent()) await openProviderUrl(${url});`;
  return `import { orpcClient${platform === "desktop" ? ", desktopBillingReturnUrl" : ""} } from "${alias}/lib/orpc";
import type { ProviderName } from "./model";
${platformImports}
${source.slice(from, to)}
export type BillingAction =
  | { kind: "checkout"; provider: ProviderName }
  | { kind: "portal"; provider: ProviderName }
  | { kind: "payment-link"; provider: ProviderName; name: string; price: string; afterCompletionMessage: string };

export async function performBillingAction(input: BillingAction, isCurrent: () => boolean): Promise<void> {
  if (input.kind === "checkout") {
    const successUrl = ${returnUrl}("success");
    const result = await orpcClient.billing.createCheckout({ provider: input.provider, planId: "pro", successUrl,
      failureUrl: ${returnUrl}("cancel"), requestKey: ${platform === "expo" ? "secureRequestKey()" : "crypto.randomUUID()"} });
    if (!isCurrent()) return;
    ${open("result.url", "successUrl")}
    return;
  }
  if (input.kind === "portal") {
    const returnUrl = ${returnUrl}("return");
    const result = await orpcClient.billing.createPortalSession({ provider: input.provider, returnUrl });
    if (!isCurrent()) return;
    ${open("result.url", "returnUrl")}
    return;
  }
  const result = await orpcClient.billing.createPaymentLink({ provider: input.provider, name: input.name,
    items: [{ price: input.price, quantity: 1 }], afterCompletionMessage: input.afterCompletionMessage });
  if (!isCurrent()) return;
  ${open("result.url")}
}
`;
}
