import type { FrameworkName, ProjectMode } from "../../../lib/addons.js";

export const paddleCheckoutControllerContent = `"use client";
import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";
import type { PaddleCheckoutOptions } from "@/contracts/billing";

export type PaddleCheckoutStatus = "loading" | "ready" | "error" | "canceled" | "returning";
interface ActiveCheckout {
  options: PaddleCheckoutOptions;
  status: (value: PaddleCheckoutStatus) => void;
  navigate: (url: string) => void;
  terminal: boolean;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout>;
}
let initialization: Promise<Paddle | undefined> | undefined;
let initializedIdentity: string | undefined;
let active: ActiveCheckout | undefined;
let openedTransaction: string | undefined;

function onEvent(event: PaddleEventData): void {
  const current = active;
  if (!current || current.stopped || current.terminal) return;
  if (event.name === "checkout.error" || event.name === "checkout.payment.error") {
    clearTimeout(current.timer); current.status("error"); openedTransaction = undefined; return;
  }
  if (event.data?.transaction_id !== current.options.transactionId) return;
  if (event.name === "checkout.loaded") { clearTimeout(current.timer); current.status("ready"); }
  if (event.name === "checkout.completed" || event.name === "checkout.closed") {
    current.terminal = true; clearTimeout(current.timer); openedTransaction = undefined;
    const completed = event.name === "checkout.completed";
    current.status(completed ? "returning" : "canceled");
    // This changes navigation only. Signed webhooks and authenticated snapshots
    // remain the sole payment/entitlement authority.
    current.navigate(completed ? current.options.successUrl : current.options.cancelUrl);
  }
}

export function validPaddleClientToken(token: string | undefined, environment: "sandbox" | "production"): token is string {
  return typeof token === "string" && token.trim() === token &&
    (environment === "sandbox" ? /^test_[A-Za-z0-9_-]{16,200}$/ : /^live_[A-Za-z0-9_-]{16,200}$/).test(token);
}

export function startPaddleCheckout(
  options: PaddleCheckoutOptions,
  token: string,
  status: (value: PaddleCheckoutStatus) => void,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): () => void {
  if (!validPaddleClientToken(token, options.environment)) { status("error"); return () => {}; }
  const identity = options.environment + ":" + token;
  if (initializedIdentity && initializedIdentity !== identity) { status("error"); return () => {}; }
  if (active && !active.stopped) { status("error"); return () => {}; }
  status("loading");
  const current: ActiveCheckout = {
    options, status, navigate, terminal: false, stopped: false,
    timer: setTimeout(() => { if (active === current && !current.stopped) { current.terminal = true; current.status("error"); } }, 15_000),
  };
  active = current;
  if (!initialization) {
    initializedIdentity = identity;
    // Paddle auto-opens _ptxn during initialization. Remove only that selector
    // after server validation so our explicit open call remains single-owner.
    const location = new URL(window.location.href);
    location.searchParams.delete("_ptxn");
    location.searchParams.set("transactionId", options.transactionId);
    window.history.replaceState(window.history.state, "", location.toString());
    initialization = initializePaddle({ token, environment: options.environment, eventCallback: onEvent });
  }
  void initialization.then((paddle) => {
    if (active !== current || current.stopped || current.terminal) return;
    if (!paddle) throw new Error("Paddle did not initialize");
    if (openedTransaction === options.transactionId) { clearTimeout(current.timer); current.status("ready"); return; }
    openedTransaction = options.transactionId;
    paddle.Checkout.open({ transactionId: options.transactionId, settings: { displayMode: "overlay" } });
  }).catch(() => {
    if (active === current && !current.stopped) { clearTimeout(current.timer); current.terminal = true; current.status("error"); }
  });
  return () => {
    current.stopped = true; clearTimeout(current.timer);
    if (active !== current) return;
    active = undefined;
    if (openedTransaction === current.options.transactionId) {
      void initialization?.then((paddle) => {
        if (active) return;
        openedTransaction = undefined;
        paddle?.Checkout.close();
      }).catch(() => {});
    }
  };
}
`;

export function paddleCheckoutComponentContent(
  mode: ProjectMode,
  framework: FrameworkName,
): string {
  const audience = framework === "nextjs" ? "next" : "vite";
  const prefix = framework === "nextjs" ? "NEXT_PUBLIC" : "VITE";
  return `"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "${mode === "monorepo" ? "@repo/config" : "@/lib/env"}/${audience}";
import { useSurfaceTranslations } from "@/lib/translations";
import { startPaddleCheckout, validPaddleClientToken, type PaddleCheckoutStatus } from "@/adapters/billing/paddle";
import type { PaddleCheckoutPageData } from "@/contracts/billing";

export function PaddleCheckoutPage({ data }: { data: PaddleCheckoutPageData }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const [status, setStatus] = React.useState<PaddleCheckoutStatus>("loading");
  const token = env.${prefix}_PADDLE_CLIENT_TOKEN;
  const configured = data.state === "ready" && env.${prefix}_PADDLE_ENVIRONMENT === data.options.environment && validPaddleClientToken(token, data.options.environment);
  React.useEffect(() => {
    if (data.state !== "ready" || !configured || !token) return;
    return startPaddleCheckout(data.options, token, setStatus);
  }, [data, configured, token]);
  const description = data.state !== "ready" ? "paddleCheckoutInvalid" : !configured ? "paddleCheckoutUnavailable" : status === "error" ? "paddleCheckoutError" : status === "ready" ? "paddleCheckoutReady" : status === "canceled" ? "checkoutCancelledDescription" : status === "returning" ? "paddleCheckoutReturning" : "paddleCheckoutLoading";
  return <main data-paddle-checkout-state={data.state !== "ready" ? "invalid" : !configured ? "unconfigured" : status} className="mx-auto flex min-h-screen max-w-xl items-center p-6"><Card className="w-full"><CardHeader><CardTitle as="h1">{t("paddleTitle")}</CardTitle><CardDescription role="status">{t(description)}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">
    {configured && status === "error" ? <Button onClick={() => window.location.reload()}>{t("retryCheckout")}</Button> : null}
    <Button variant="outline" render={<a href="/billing" />} nativeButton={false}>{t("backToBilling")}</Button>
  </CardContent></Card></main>;
}

export function PaddleCheckoutLoading(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return <main className="mx-auto flex min-h-screen max-w-xl items-center p-6" role="status" aria-busy="true">{t("paddleCheckoutLoading")}</main>;
}
`;
}
