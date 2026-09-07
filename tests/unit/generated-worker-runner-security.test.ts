import { describe, expect, test } from "bun:test";
import {
  assertWorkerRuntimeProbeResponse,
  CONVEX_WORKER_RUNTIME_PROBES,
  credentialUrlSensitiveValues,
  deployableArtifactPaths,
  previewReportedListening,
  hasValidWorkerResponse,
} from "../../scripts/test-generated.js";
import { paddleCheckoutContentSecurityPolicy } from "../../src/templates/billing/ui/paddle-csp.js";
import { resolve } from "node:path";

describe("generated Worker Paddle payment-page acceptance", () => {
  test("requires the safe invalid-link page and its route-specific CSP", async () => {
    const worker: Parameters<typeof hasValidWorkerResponse>[2] = {
      appRoot: "apps/web",
      appPublicEnvKey: "VITE_APP_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: "--host",
      deployableAssetRoots: [],
    };
    const base =
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none';";
    const csp = paddleCheckoutContentSecurityPolicy(base);
    const response = (body: string, policy = csp, status = 200) =>
      new Response(body, {
        status,
        headers: {
          "content-type": "text/html",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "content-security-policy": policy,
        },
      });
    const fragment =
      '<main data-paddle-checkout-state="invalid">Start checkout from billing.</main>';
    const document = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
    const safePage = document(fragment);
    expect(
      await hasValidWorkerResponse(response(safePage), "/billing/paddle-checkout", worker),
    ).toBe(true);
    expect(
      await hasValidWorkerResponse(response(fragment), "/billing/paddle-checkout", worker),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(
        response(`<!doctype html><html><body>${fragment}`),
        "/billing/paddle-checkout",
        worker,
      ),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(
        response(document(`${fragment}<template data-dgst="fixture-error"></template>`)),
        "/billing/paddle-checkout",
        worker,
      ),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(
        response(document("<main>Sign in</main>")),
        "/billing/paddle-checkout",
        worker,
      ),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(response(safePage, base), "/billing/paddle-checkout", worker),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(
        response(safePage, csp, 404),
        "/billing/paddle-checkout",
        worker,
      ),
    ).toBe(false);
    expect(
      await hasValidWorkerResponse(
        response(document('<main data-paddle-checkout-state="ready"></main>')),
        "/billing/paddle-checkout",
        worker,
      ),
    ).toBe(false);
  });
});

describe("generated Worker gate credential handling", () => {
  test("collects raw, normalized, encoded, and decoded proxy credential forms", () => {
    const raw = "http://proxy%2Duser:p%40ssword@127.0.0.1:8080/path";
    const values = credentialUrlSensitiveValues(raw);

    for (const expected of [
      raw,
      "proxy%2Duser",
      "p%40ssword",
      "proxy%2Duser:p%40ssword",
      "proxy-user",
      "p@ssword",
      "proxy-user:p@ssword",
      "http://proxy-user:p@ssword@127.0.0.1:8080/path",
    ]) {
      expect(values, expected).toContain(expected);
    }
  });

  test("retains malformed and credential-free values for exact output redaction", () => {
    expect(credentialUrlSensitiveValues("not a proxy @ value")).toEqual(["not a proxy @ value"]);
    expect(credentialUrlSensitiveValues("http://127.0.0.1:8080")).toContain(
      "http://127.0.0.1:8080",
    );
  });
});

describe("generated Worker gate preview ownership", () => {
  test("requires an explicit successful listen URL and rejects bind failures", () => {
    expect(previewReportedListening("Ready on http://127.0.0.1:43123/", 43123)).toBe(true);
    expect(previewReportedListening("configured port:43123", 43123)).toBe(false);
    expect(
      previewReportedListening(
        "Ready on http://127.0.0.1:43123/\nError: listen EADDRINUSE 127.0.0.1:43123",
        43123,
      ),
    ).toBe(false);
    expect(previewReportedListening("Ready on http://127.0.0.1:43124/", 43123)).toBe(false);
  });
});

describe("generated Worker gate runtime route evidence", () => {
  test("pins exact provider and privileged-boundary responses", () => {
    expect(
      CONVEX_WORKER_RUNTIME_PROBES.map(({ path, status, body }) => ({ path, status, body })),
    ).toEqual([
      {
        path: "/api/webhooks/stripe",
        status: 400,
        body: "STRIPE_SECRET_KEY is not configured",
      },
      {
        path: "/api/webhooks/chargily",
        status: 400,
        body: "Missing signature header",
      },
      {
        path: "/api/webhooks/paddle",
        status: 400,
        body: "Missing paddle-signature header",
      },
      {
        path: "/api/webhooks/polar",
        status: 400,
        body: "POLAR_WEBHOOK_SECRET not configured",
      },
      {
        path: "/api/auth/admin/list-users",
        status: 404,
        body: "Not found",
      },
    ]);
    expect(CONVEX_WORKER_RUNTIME_PROBES.at(-1)?.headers["cache-control"]).toBe(
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
  });

  test("accepts only the exact response body and required headers", async () => {
    const stripe = CONVEX_WORKER_RUNTIME_PROBES[0];
    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response(stripe.body, {
          status: stripe.status,
          headers: stripe.headers,
        }),
        stripe,
      ),
    ).resolves.toBeUndefined();

    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response("Bad request", {
          status: stripe.status,
          headers: stripe.headers,
        }),
        stripe,
      ),
    ).rejects.toThrow("unexpected response body");

    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response(stripe.body, {
          status: stripe.status,
          headers: { "x-content-type-options": "nosniff" },
        }),
        stripe,
      ),
    ).rejects.toThrow("unexpected x-frame-options header");
  });

  test("rejects generic 4xx and 404 responses", async () => {
    const stripe = CONVEX_WORKER_RUNTIME_PROBES[0];
    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response("Not found", { status: 404, headers: stripe.headers }),
        stripe,
      ),
    ).rejects.toThrow("returned HTTP 404; expected 400");

    const privileged = CONVEX_WORKER_RUNTIME_PROBES[4];
    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response(privileged.body, {
          status: privileged.status,
          headers: {
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
          },
        }),
        privileged,
      ),
    ).rejects.toThrow("unexpected cache-control header");
  });

  test("requires the complete private auth rejection cache policy", async () => {
    const privileged = CONVEX_WORKER_RUNTIME_PROBES[4];
    await expect(
      assertWorkerRuntimeProbeResponse(
        new Response(privileged.body, { status: privileged.status, headers: privileged.headers }),
        privileged,
      ),
    ).resolves.toBeUndefined();

    for (const cacheControl of [
      "private",
      "no-store",
      "private, no-store",
      "public, max-age=3600",
      "private, no-cache, max-age=0, must-revalidate",
    ]) {
      await expect(
        assertWorkerRuntimeProbeResponse(
          new Response(privileged.body, {
            status: privileged.status,
            headers: { ...privileged.headers, "cache-control": cacheControl },
          }),
          privileged,
        ),
      ).rejects.toThrow("unexpected cache-control header");
    }
  });
});

describe("generated Worker gate artifact closure", () => {
  test("includes Worker, Expo, desktop renderer, and desktop main artifacts", () => {
    const root = resolve("fixture-project");
    expect(
      deployableArtifactPaths(
        root,
        "apps/web",
        ".wrangler/ghostinit-dry-run",
        [".open-next/assets", ".open-next/cache"],
        ["apps/mobile/dist", "apps/desktop/dist/renderer"],
        ["apps/desktop/dist/main.js", "apps/desktop/dist/preload.cjs"],
      ),
    ).toEqual([
      resolve(root, "apps/web/.wrangler/ghostinit-dry-run"),
      resolve(root, "apps/web/.open-next/assets"),
      resolve(root, "apps/web/.open-next/cache"),
      resolve(root, "apps/mobile/dist"),
      resolve(root, "apps/desktop/dist/renderer"),
      resolve(root, "apps/desktop/dist/main.js"),
      resolve(root, "apps/desktop/dist/preload.cjs"),
    ]);
  });
});
