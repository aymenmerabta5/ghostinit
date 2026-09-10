import { describe, expect, test } from "bun:test";
import { billingHarness, deferred, flush } from "../helpers/billing-owned-effect-harness.js";
const resultUrl = "https://payments.example.test/owner-a/session";

describe("billing result effects remain owned by the initiating mounted identity", () => {
  for (const target of ["next", "tanstack", "expo", "desktop"] as const) {
    for (const operation of ["checkout", "portal", "paymentLink"] as const) {
      for (const transition of ["account", "unmount", "refresh"] as const) {
        test(
          target + "/" + operation + " ignores a delayed completion after " + transition,
          async () => {
            const h = billingHarness(target);
            const completion = h.start(operation);
            expect(h.calls).toEqual([operation]);
            if (transition === "account") h.changeOwner();
            else if (transition === "refresh") h.invalidate();
            else h.unmount();
            h.request.resolve({ url: resultUrl });
            await completion;
            await flush();
            expect(h.opened).toEqual([]);
            expect(h.notices).toEqual([]);
            if (operation === "paymentLink" && (target === "next" || target === "tanstack"))
              expect(await completion).toBeNull();
          },
        );
      }
      test(
        target + "/" + operation + " applies a successful result for the current owner",
        async () => {
          const h = billingHarness(target);
          const completion = h.start(operation);
          h.request.resolve({ url: resultUrl });
          await completion;
          await flush();
          if (operation === "paymentLink" && (target === "next" || target === "tanstack"))
            expect(await completion).toBe(resultUrl);
          else expect(h.opened).toEqual([resultUrl]);
        },
      );
    }
  }
  test("Expo checks ownership again after awaiting browser availability", async () => {
    const h = billingHarness("expo");
    const browser = deferred<boolean>();
    h.waitForBrowser(browser.promise);
    const completion = h.start("paymentLink");
    h.request.resolve({ url: resultUrl });
    await flush();
    expect(h.opened).toEqual([]);
    h.changeOwner();
    browser.resolve(true);
    await completion;
    await flush();
    expect(h.opened).toEqual([]);
  });
  for (const target of ["next", "tanstack", "expo", "desktop"] as const) {
    test(target + " current errors recover and stale errors remain hidden", async () => {
      for (const stale of [false, true]) {
        const h = billingHarness(target);
        const completion = h.start("checkout");
        if (stale) h.changeOwner();
        h.request.reject(new Error("private provider request details"));
        await completion;
        await flush();
        if (target === "next" || target === "tanstack") {
          expect(h.notices).toEqual(stale ? [] : ["checkoutError"]);
          expect(h.render().isCheckoutLoading).toBe(false);
        } else expect(Boolean(h.render().error)).toBe(!stale);
      }
    });
  }
  for (const target of ["next", "tanstack"] as const)
    for (const mode of ["single", "monorepo"] as const) {
      test(
        mode + "/" + target + " merchant form does not publish a delayed old-owner link",
        async () => {
          const h = billingHarness(target, mode);
          const completion = h.start("paymentLink");
          expect(h.calls).toEqual(["paymentLink"]);
          h.changeOwner();
          h.request.resolve({ url: resultUrl });
          await completion;
          await flush();
          expect(h.paymentLinkUrl()).toBeNull();
        },
      );
    }
  test("the shared guard rejects ABA identities, client replacement and remount lifetimes", () => {
    const h = billingHarness("next");
    const beforeSwitch = h.capture();
    expect(beforeSwitch()).toBe(true);
    h.changeOwner("owner-b");
    h.changeOwner("owner-a");
    expect(beforeSwitch()).toBe(false);
    const beforeReplacement = h.capture();
    h.replaceClient();
    expect(h.capture()()).toBe(true);
    expect(beforeReplacement()).toBe(false);
    const beforeUnmount = h.capture();
    h.unmount();
    expect(beforeUnmount()).toBe(false);
    expect(h.capture()()).toBe(true);
    expect(beforeUnmount()).toBe(false);
  });
  test("Next clipboard effects are suppressed after unmount and current copies succeed", async () => {
    const h = billingHarness("next");
    const actions = h.render();
    await actions.copyText!("current-owner-value");
    expect(h.copied).toEqual(["current-owner-value"]);
    h.unmount();
    await actions.copyText!("stale-value");
    expect(h.copied).toEqual(["current-owner-value"]);
  });
});
