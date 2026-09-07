import { describe, expect, test } from "bun:test";
import { hasValidWorkerResponse } from "../../scripts/test-generated.js";

const worker: Parameters<typeof hasValidWorkerResponse>[2] = {
  appRoot: "apps/web",
  appPublicEnvKey: "NEXT_PUBLIC_APP_URL",
  artifactRoot: ".wrangler/ghostinit-dry-run",
  previewHostFlag: "--ip",
  deployableAssetRoots: [],
};
const html =
  "<!doctype html><html><head><title>GhostInit</title></head><body><main>Ready</main></body></html>";
const headers = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; frame-ancestors 'none';",
};

describe("complete Worker HTML response acceptance", () => {
  test("accepts a completed generated landing document with the required headers", async () => {
    expect(await hasValidWorkerResponse(new Response(html, { headers }), "/", worker)).toBe(true);
  });

  test("rejects obsolete remote font and stylesheet permissions", async () => {
    for (const [directive, remote] of [
      ["font-src", "https://fonts.gstatic.com"],
      ["style-src", "https://fonts.googleapis.com"],
    ]) {
      const csp = headers["content-security-policy"].replace(
        `${directive} 'self'`,
        `${directive} 'self' ${remote}`,
      );
      expect(
        await hasValidWorkerResponse(
          new Response(html, { headers: { ...headers, "content-security-policy": csp } }),
          "/",
          worker,
        ),
      ).toBe(false);
    }
  });

  for (const [name, body] of [
    ["empty body", ""],
    ["plain error body", "Gateway error"],
    ["incomplete document", "<!doctype html><html><body><main>Loading"],
    ["missing page content", "<!doctype html><html><body></body></html>"],
    ["Next error document", html.replace("<html>", '<html id="__next_error__">')],
    [
      "streamed React error",
      html.replace("</main>", '</main><template data-dgst="fixture-error"></template>'),
    ],
  ] as const) {
    test(`rejects HTTP200 with ${name}`, async () => {
      expect(await hasValidWorkerResponse(new Response(body, { headers }), "/", worker)).toBe(
        false,
      );
    });
  }

  test("rejects an HTML body with the wrong content type or status", async () => {
    expect(
      await hasValidWorkerResponse(
        new Response(html, { headers: { ...headers, "content-type": "text/plain" } }),
        "/",
        worker,
      ),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(new Response(html, { headers, status: 500 }), "/", worker),
    ).toBe(false);
  });

  test("reads the complete stream before accepting and rejects a later private failure", async () => {
    let first = true;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (first) {
          first = false;
          controller.enqueue(new TextEncoder().encode(html));
        } else {
          controller.error(new Error("private-fixture-body-must-not-be-echoed"));
        }
      },
    });
    expect(await hasValidWorkerResponse(new Response(body, { headers }), "/", worker)).toBe(false);
  });

  test("bounds response bytes and cancels an oversized body", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      },
      cancel() {
        canceled = true;
      },
    });
    expect(await hasValidWorkerResponse(new Response(body, { headers }), "/", worker)).toBe(false);
    expect(canceled).toBe(true);
  });
});
