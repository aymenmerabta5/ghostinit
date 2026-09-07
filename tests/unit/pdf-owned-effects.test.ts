import { describe, expect, test } from "bun:test";
import { authOwnedEffectContent } from "../../src/templates/apps/fragments/auth-owned-effect.js";
import { usePdfHookContent, usePdfMobileContent } from "../../src/templates/pdf/client.js";
import { pdfDesktopPageContent } from "../../src/templates/pdf/surfaces.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
} from "../helpers/generated-form-harness.js";

const input = { template: "invoice", data: {}, fileName: "owned.pdf" };
const response = { pdfBase64: "cGRm", fileName: "owned.pdf" };
type Boundary = "json" | "cookie" | "availability";
type Target = "web" | "native" | "expo-web";
type Hook = {
  generate(input: unknown): Promise<unknown>;
  preview(input: unknown): Promise<string>;
  generateAndShare(input: unknown): Promise<string>;
};

function ownerHarness() {
  let generation = 0;
  let cleanup = () => {};
  const client = {};
  const hook = generatedFormHarness(authOwnedEffectContent(), ["useAuthOwnedEffect"], {
    React: {
      useRef: (initial: unknown) => ({ current: initial }),
      useLayoutEffect: (effect: () => () => void) => {
        cleanup = effect();
      },
      useCallback: (callback: unknown) => callback,
    },
    useQueryClient: () => client,
    currentQueryAuthGeneration: () => generation,
  });
  return {
    capture: hook.module.useAuthOwnedEffect!() as () => () => boolean,
    changeOwner: () => {
      generation += 1;
    },
    unmount: () => cleanup(),
  };
}

function hookHarness(target: Target, boundary: Boundary = "json", includeAuthOwner = true) {
  const owner = ownerHarness();
  const json = deferred<unknown>();
  const cookie = deferred<string>();
  const availability = deferred<boolean>();
  const effects: string[] = [];
  const stateWrites: unknown[] = [];
  const cleanups: (() => void)[] = [];
  let posts = 0;
  let reached = 0;
  class PdfUrl extends URL {
    static override createObjectURL() {
      effects.push("url");
      return "blob:owned-pdf";
    }
    static override revokeObjectURL() {}
  }
  const name = target === "web" ? "usePdf" : "usePdfMobile";
  const harness = generatedFormHarness(
    target === "web" ? usePdfHookContent("packages/pdf") : usePdfMobileContent(),
    [name],
    {
      useState: (initial: unknown) => [initial, (value: unknown) => stateWrites.push(value)],
      useCallback: (callback: unknown) => callback,
      useRef: (initial: unknown) => ({ current: initial }),
      useLayoutEffect: (effect: () => () => void) => cleanups.push(effect()),
      useAuthOwnedEffect: () => owner.capture,
      window: { location: { origin: "https://app.example.test" } },
      URL: PdfUrl,
      document: {
        body: { appendChild() {} },
        createElement: () => ({
          href: "",
          download: "",
          click: () => effects.push("download"),
          remove() {},
        }),
      },
      fetch: async () => {
        posts += 1;
        return {
          ok: true,
          status: 200,
          json: () => {
            if (boundary === "json") {
              reached += 1;
              return json.promise;
            }
            return Promise.resolve(response);
          },
        };
      },
      authClient: {
        getCookie: () => {
          if (boundary === "cookie") {
            reached += 1;
            return cookie.promise;
          }
          return Promise.resolve("session=owner-a");
        },
      },
      Platform: { OS: target === "expo-web" ? "web" : "ios" },
      env: { EXPO_PUBLIC_API_URL: "https://app.example.test" },
      Paths: { cache: "cache" },
      File: class {
        uri = "cache/owned.pdf";
        write() {
          effects.push("write");
        }
      },
      Sharing: {
        isAvailableAsync: () => {
          if (boundary === "availability") {
            reached += 1;
            return availability.promise;
          }
          return Promise.resolve(true);
        },
        shareAsync: async () => {
          effects.push("share");
        },
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
    },
  );
  return {
    owner,
    effects,
    stateWrites,
    hook: harness.render(name, includeAuthOwner ? { captureOwner: owner.capture } : {}) as Hook,
    posts: () => posts,
    reached: () => reached,
    unmount() {
      owner.unmount();
      cleanups.forEach((cleanup) => cleanup());
    },
    resolve(available = true) {
      if (boundary === "json") json.resolve(response);
      else if (boundary === "cookie") cookie.resolve("session=owner-a");
      else availability.resolve(available);
    },
    reject: (cause: Error) => json.reject(cause),
  };
}

function settled(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  );
}

describe("PDF effects belong to the initiating mounted account", () => {
  for (const operation of ["generate", "preview"] as const) {
    for (const transition of ["account", "unmount", "local-unmount"] as const) {
      test(`web ${operation} rejects delayed bytes after ${transition} without allocating a URL`, async () => {
        const harness = hookHarness("web", "json", transition !== "local-unmount");
        const completion = settled(harness.hook[operation](input));
        await flush();
        expect(harness.reached()).toBe(1);
        if (transition === "account") harness.owner.changeOwner();
        else harness.unmount();
        const writes = harness.stateWrites.length;
        harness.resolve();
        expect((await completion).error).toMatchObject({ name: "AbortError" });
        expect(harness.effects).toEqual([]);
        expect(harness.stateWrites).toHaveLength(writes);
      });
    }
    test(`web ${operation} completes once for its current owner`, async () => {
      const harness = hookHarness("web");
      const completion = settled(harness.hook[operation](input));
      harness.resolve();
      expect((await completion).error).toBeNull();
      expect(harness.effects).toEqual(operation === "generate" ? ["url", "download"] : ["url"]);
      expect(harness.stateWrites.at(-1)).toBe(false);
    });
  }

  for (const boundary of ["cookie", "json", "availability"] as const) {
    for (const transition of ["account", "unmount"] as const) {
      test(`native ${boundary} cannot dispatch, write or share after ${transition}`, async () => {
        const harness = hookHarness("native", boundary);
        const completion = settled(harness.hook.generateAndShare(input));
        await flush();
        expect(harness.reached()).toBe(1);
        expect(harness.effects).toEqual([]);
        if (transition === "account") harness.owner.changeOwner();
        else harness.unmount();
        const writes = harness.stateWrites.length;
        harness.resolve();
        expect((await completion).error).toMatchObject({ name: "AbortError" });
        expect(harness.posts()).toBe(boundary === "cookie" ? 0 : 1);
        expect(harness.effects).toEqual([]);
        expect(harness.stateWrites).toHaveLength(writes);
      });
    }
  }

  for (const target of ["native", "expo-web"] as const) {
    test(`${target} preserves current-owner generation`, async () => {
      const harness = hookHarness(target);
      const completion = settled(harness.hook.generateAndShare(input));
      harness.resolve();
      expect((await completion).error).toBeNull();
      expect(harness.effects).toEqual(
        target === "native" ? ["write", "share"] : ["url", "download"],
      );
    });
    test(`${target} rejects old-owner bytes without an external action`, async () => {
      const harness = hookHarness(target);
      const completion = settled(harness.hook.generateAndShare(input));
      await flush();
      harness.owner.changeOwner();
      harness.resolve();
      expect((await completion).error).toMatchObject({ name: "AbortError" });
      expect(harness.effects).toEqual([]);
    });
  }

  test("native still returns its current file when sharing is unavailable", async () => {
    const harness = hookHarness("native", "availability");
    const completion = settled(harness.hook.generateAndShare(input));
    await flush();
    harness.resolve(false);
    expect(await completion).toEqual({ value: "cache/owned.pdf", error: null });
    expect(harness.effects).toEqual(["write"]);
  });

  for (const target of ["web", "native"] as const) {
    for (const active of [true, false]) {
      test(`${target} ${active ? "shows current" : "suppresses stale"} request errors`, async () => {
        const harness = hookHarness(target);
        const completion = settled(
          target === "web" ? harness.hook.generate(input) : harness.hook.generateAndShare(input),
        );
        await flush();
        if (!active) harness.owner.changeOwner();
        const writes = harness.stateWrites.length;
        harness.reject(new Error("PDF unavailable"));
        expect((await completion).error).toMatchObject({ message: "PDF unavailable" });
        expect(harness.stateWrites.slice(writes)).toEqual(active ? ["PDF unavailable", false] : []);
      });
    }
  }

  for (const active of [true, false]) {
    for (const rejected of [true, false]) {
      test(`desktop ${active ? "current" : "old"} owner ${rejected ? "failure" : "download"}`, async () => {
        const owner = ownerHarness();
        const request = deferred<string>();
        const effects: string[] = [];
        const writes: unknown[] = [];
        const ui = generatedFormHarness(pdfDesktopPageContent(), ["PdfPage"], {
          React: {
            createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({
              type,
              props,
              children,
            }),
            useState: (initial: unknown) => [initial, (value: unknown) => writes.push(value)],
            useRef: (initial: unknown) => ({ current: initial }),
          },
          useAuthOwnedEffect: () => owner.capture,
          createFileRoute: () => (options: unknown) => options,
          generatePdfDesktop: () => request.promise,
          downloadPdfBase64: () => effects.push("download"),
          samplePdfData: () => ({}),
          ...Object.fromEntries(
            [
              "Field",
              "FieldLabel",
              "Select",
              "SelectContent",
              "SelectGroup",
              "SelectItem",
              "SelectTrigger",
              "SelectValue",
              "Link",
            ].map((name) => [name, name]),
          ),
        });
        const action = elements(ui.render("PdfPage")).find(
          (node) => node.type === "Button" && typeof node.props.onClick === "function",
        );
        if (!action) throw new Error("Missing desktop PDF action");
        (action.props.onClick as () => void)();
        if (!active) owner.changeOwner();
        const before = writes.length;
        if (rejected) request.reject(new Error("PDF unavailable"));
        else request.resolve("cGRm");
        await flush();
        expect(effects).toEqual(active && !rejected ? ["download"] : []);
        expect(writes.slice(before)).toEqual(
          active ? (rejected ? ["PDF generation failed", false] : [false]) : [],
        );
      });
    }
  }
});
