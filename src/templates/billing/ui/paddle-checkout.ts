import type { FrameworkName, ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import {
  paddleCheckoutComponentContent,
  paddleCheckoutControllerContent,
} from "./paddle-checkout-client.js";
import {
  paddleCheckoutServerContent,
  paddleCheckoutTypesContent,
} from "./paddle-checkout-server.js";

export function paddleCheckoutFiles(mode: ProjectMode, framework: FrameworkName): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const base = `${root}src/features/billing`;
  const files = [
    file(`${root}src/contracts/billing.ts`, paddleCheckoutTypesContent),
    file(`${root}src/server/billing/paddle-checkout.ts`, paddleCheckoutServerContent(mode)),
    file(`${root}src/adapters/billing/paddle.ts`, paddleCheckoutControllerContent),
    file(`${base}/paddle-checkout-page.tsx`, paddleCheckoutComponentContent(mode, framework)),
    file(
      "docs/PADDLE_CHECKOUT.md",
      `# Paddle checkout setup

Set the Paddle dashboard default payment link to your approved application
origin followed by /billing/paddle-checkout. Paddle requires this dashboard
setting even when transactions specify their own checkout URL. Production
domains must be approved by Paddle; sandbox and production are separate.

Configure BETTER_AUTH_URL to that application origin, PADDLE_API_KEY and
PADDLE_ENVIRONMENT on the server, and the matching framework public
PADDLE_CLIENT_TOKEN and PADDLE_ENVIRONMENT values for the browser build.
Use test_ client tokens for sandbox and live_ tokens for production. Never put
the server API key in a public variable. Next uses NEXT_PUBLIC_ and TanStack
Start uses VITE_. No new environment keys are required.

The public checkout page works for transactions initiated by web, Expo, or
Electron without requiring another browser login. It validates the transaction
identifier and limits both return targets to configured application origins or
the configured native billing deep link. It sends no account or entitlement
changes. Completed/closed browser events choose navigation only; signed
webhooks and authenticated billing snapshots determine payment status.

The generated page initializes Paddle.js once and explicitly opens the provider
transaction. Its route-specific CSP permits Paddle's production/sandbox CDN,
checkout API, and checkout frame hosts. Other routes retain their usual CSP.

Before production traffic, provision the approved domain/default payment link,
test a real sandbox checkout and cancellation for each selected app, and verify
signed webhook delivery and the resulting account-owned billing snapshot.
Local SDK/route tests do not prove those account-side operations.
`,
    ),
  ];
  if (framework === "nextjs") {
    files.push(
      file(
        `${root}src/app/billing/paddle-checkout/page.tsx`,
        `import { Suspense } from "react";
import { PaddleCheckoutPage, PaddleCheckoutLoading } from "@/features/billing/paddle-checkout-page";
import { resolvePaddleCheckoutPage } from "@/server/billing/paddle-checkout";
type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function Page(props: SearchProps) {
  return <Suspense fallback={<PaddleCheckoutLoading />}><CheckoutContent {...props} /></Suspense>;
}
async function CheckoutContent({ searchParams }: SearchProps) {
  const query = await searchParams;
  const data = resolvePaddleCheckoutPage({ transactionId: typeof query._ptxn === "string" ? query._ptxn : typeof query.transactionId === "string" ? query.transactionId : undefined, successUrl: typeof query.successUrl === "string" ? query.successUrl : undefined, cancelUrl: typeof query.cancelUrl === "string" ? query.cancelUrl : undefined });
  return <PaddleCheckoutPage data={data} />;
}
`,
      ),
    );
  } else {
    files.push(
      file(
        `${root}src/lib/paddle-checkout-functions.ts`,
        `import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const input = z.object({ transactionId: z.string().max(100).optional(), successUrl: z.string().max(4096).optional(), cancelUrl: z.string().max(4096).optional() });
export const getPaddleCheckoutPage = createServerFn({ method: "GET" }).inputValidator((value: unknown) => input.parse(value)).handler(async ({ data }) => {
  const { resolvePaddleCheckoutPage } = await import("@/server/billing/paddle-checkout");
  return resolvePaddleCheckoutPage(data);
});
`,
      ),
    );
    files.push(
      file(
        `${root}src/routes/billing_.paddle-checkout.tsx`,
        `import { createFileRoute } from "@tanstack/react-router";
import { PaddleCheckoutPage } from "@/features/billing/paddle-checkout-page";
import { getPaddleCheckoutPage } from "@/lib/paddle-checkout-functions";
export const Route = createFileRoute("/billing_/paddle-checkout")({
  validateSearch: (query: Record<string, unknown>) => ({ transactionId: typeof query._ptxn === "string" ? query._ptxn : typeof query.transactionId === "string" ? query.transactionId : undefined, successUrl: typeof query.successUrl === "string" ? query.successUrl : undefined, cancelUrl: typeof query.cancelUrl === "string" ? query.cancelUrl : undefined }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getPaddleCheckoutPage({ data: deps }),
  component: Page,
});
function Page() { return <PaddleCheckoutPage data={Route.useLoaderData()} />; }
`,
      ),
    );
  }
  return files;
}
