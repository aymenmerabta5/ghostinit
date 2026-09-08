import { describe, expect, test } from "bun:test";
import {
  billingHarness,
  deferred,
  flush,
  nodes,
  type Operation,
  type Target,
} from "../helpers/billing-owned-effect-harness.js";

type BillingActions = {
  handleCheckout(provider: string): Promise<void>;
  handlePortal(provider: string): Promise<void>;
  handlePaymentLink(provider: string, name: string, price: string): Promise<string | null>;
  copyText(value: string): Promise<void>;
  isCheckoutLoading: boolean;
};
const resultUrl = "https://payments.example.test/owner-a/session";

function startNative(
  harness: ReturnType<typeof billingHarness>,
  target: Target,
  operation: Operation,
): void {
  let tree = harness.render();
  if (operation === "paymentLink") {
    const inputs = nodes(tree).filter((node) => node.type === "Input");
    for (const input of inputs) {
      const handler = input.props[target === "expo" ? "onChangeText" : "onChange"] as (
        value: unknown,
      ) => void;
      handler(target === "expo" ? "price-current" : { target: { value: "price-current" } });
    }
    tree = harness.render();
  }
  const label =
    operation === "checkout"
      ? "Start checkout"
      : operation === "portal"
        ? "Open portal"
        : "Create payment link";
  const button = nodes(tree).find(
    (node) => node.type === "Button" && JSON.stringify(node.children).includes(label),
  );
  if (!button) throw new Error(`Missing ${target} ${operation} action`);
  (button.props[target === "expo" ? "onPress" : "onClick"] as () => void)();
}

describe("billing result effects remain owned by the initiating mounted identity", () => {
  for (const target of ["next", "tanstack", "expo", "desktop"] as const) {
    for (const operation of ["checkout", "portal", "paymentLink"] as const) {
      for (const transition of ["account", "unmount", "refresh"] as const) {
        test(`${target}/${operation} ignores a delayed completion after ${transition}`, async () => {
          const harness = billingHarness(target);
          let completion: Promise<unknown> | undefined;
          if (target === "next" || target === "tanstack") {
            const actions = harness.render() as BillingActions;
            completion =
              operation === "checkout"
                ? actions.handleCheckout("stripe")
                : operation === "portal"
                  ? actions.handlePortal("stripe")
                  : actions.handlePaymentLink("chargily", "Plan", "price");
          } else startNative(harness, target, operation);
          expect(harness.calls).toEqual([operation]);
          if (transition === "account") harness.changeOwner();
          else if (transition === "refresh") harness.invalidate();
          else harness.unmount();
          harness.request.resolve({ url: resultUrl });
          await completion;
          await flush();
          expect(harness.opened).toEqual([]);
          expect(harness.notices).toEqual([]);
          if (operation === "paymentLink" && completion) expect(await completion).toBeNull();
        });
      }

      test(`${target}/${operation} applies a successful result for the current owner`, async () => {
        const harness = billingHarness(target);
        let completion: Promise<unknown> | undefined;
        if (target === "next" || target === "tanstack") {
          const actions = harness.render() as BillingActions;
          completion =
            operation === "checkout"
              ? actions.handleCheckout("stripe")
              : operation === "portal"
                ? actions.handlePortal("stripe")
                : actions.handlePaymentLink("chargily", "Plan", "price");
        } else startNative(harness, target, operation);
        harness.request.resolve({ url: resultUrl });
        await completion;
        await flush();
        if (operation === "paymentLink" && completion) expect(await completion).toBe(resultUrl);
        else expect(harness.opened).toEqual([resultUrl]);
      });
    }
  }

  test("Expo checks ownership again after awaiting browser availability", async () => {
    const harness = billingHarness("expo");
    const browser = deferred<boolean>();
    harness.waitForBrowser(browser.promise);
    startNative(harness, "expo", "paymentLink");
    harness.request.resolve({ url: resultUrl });
    await flush();
    expect(harness.opened).toEqual([]);
    harness.changeOwner();
    browser.resolve(true);
    await flush();
    expect(harness.opened).toEqual([]);
  });

  for (const target of ["next", "tanstack", "expo", "desktop"] as const) {
    test(`${target} current errors recover and stale errors do not enter a later owner's UI`, async () => {
      for (const stale of [false, true]) {
        const harness = billingHarness(target);
        const actions =
          target === "next" || target === "tanstack" ? (harness.render() as BillingActions) : null;
        const completion = actions?.handleCheckout("stripe");
        if (!actions) startNative(harness, target, "checkout");
        if (stale) harness.changeOwner();
        harness.request.reject(new Error("Provider request failed"));
        await completion;
        await flush();
        if (actions) {
          expect(harness.notices).toEqual(stale ? [] : ["Provider request failed"]);
          if (!stale) expect((harness.render() as BillingActions).isCheckoutLoading).toBe(false);
        } else {
          expect(JSON.stringify(harness.render()).includes("Provider request failed")).toBe(!stale);
        }
      }
    });
  }

  for (const target of ["next", "tanstack"] as const) {
    for (const mode of ["single", "monorepo"] as const) {
      test(`${mode}/${target} merchant form does not commit a delayed old-owner link`, async () => {
        const harness = billingHarness(target, mode);
        let tree = harness.renderForm();
        for (const input of nodes(tree).filter((node) => node.type === "Input")) {
          (input.props.onChange as (event: unknown) => void)({
            target: { value: "merchant-price" },
          });
        }
        tree = harness.renderForm();
        const form = nodes(tree).find((node) => node.type === "form");
        if (!form) throw new Error("Missing merchant form");
        (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
        expect(harness.calls).toEqual(["paymentLink"]);
        harness.changeOwner();
        harness.request.resolve({ url: resultUrl });
        await flush();
        expect(
          nodes(harness.renderForm()).some(
            (node) => node.type === "a" && node.props.href === resultUrl,
          ),
        ).toBe(false);
      });
    }
  }

  test("the shared guard rejects ABA identities, client replacement and remount lifetimes", () => {
    const harness = billingHarness("next");
    const beforeSwitch = harness.capture();
    expect(beforeSwitch()).toBe(true);
    harness.changeOwner("owner-b");
    harness.changeOwner("owner-a");
    expect(beforeSwitch()).toBe(false);
    const beforeReplacement = harness.capture();
    harness.replaceClient();
    expect(harness.capture()()).toBe(true);
    expect(beforeReplacement()).toBe(false);
    const beforeUnmount = harness.capture();
    harness.unmount();
    expect(beforeUnmount()).toBe(false);
    expect(harness.capture()()).toBe(true);
    expect(beforeUnmount()).toBe(false);
  });

  test("Next clipboard effects are suppressed after unmount and current copies succeed", async () => {
    const harness = billingHarness("next");
    const actions = harness.render() as BillingActions;
    await actions.copyText("current-owner-value");
    expect(harness.copied).toEqual(["current-owner-value"]);
    harness.unmount();
    await actions.copyText("stale-value");
    expect(harness.copied).toEqual(["current-owner-value"]);
  });
});
