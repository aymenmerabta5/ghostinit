import { describe, expect, test } from "bun:test";
import type { ArchitectureFinding } from "../../src/lib/architecture/types.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { checkWebhookStructure } from "../../src/lib/architecture/rules/webhook-structure.js";
import {
  webhookContent,
  webhookRouteFiles,
} from "../../src/templates/billing/webhooks/providers/index.js";

function check(source: string, file = "apps/web/src/app/api/webhooks/stripe/route.ts") {
  const findings: ArchitectureFinding[] = [];
  checkWebhookStructure(findings, file, source, ".ts");
  return findings;
}

const boundedStreamHelpers = `
  const MAX_WEBHOOK_BODY_BYTES = 1_048_576;
  function payloadTooLarge(): Response {
    return new Response("too large", { status: 413 });
  }
  function rejectDeclaredBodySize(request: Request): Request | Response {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const declaredBytes = Number(contentLength);
      if (declaredBytes > MAX_WEBHOOK_BODY_BYTES) return payloadTooLarge();
    }
    return request;
  }
  async function readBoundedWebhookBody(request: Request): Promise<Buffer | Response> {
    const body = request.body;
    if (!body) return Buffer.alloc(0);
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {
          await reader.cancel("too large");
          return payloadTooLarge();
        }
        chunks.push(value);
        totalBytes += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const result = Buffer.allocUnsafe(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
`;

function streamingHandler(
  helpers = boundedStreamHelpers,
  readLines = `
    const declaredBodyRejection = rejectDeclaredBodySize(request);
    if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
    const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
    if (bodyResult instanceof Response) return bodyResult;
    const rawBody = bodyResult;
  `,
  beforeVerifier = "",
): string {
  return `${helpers}
    export async function POST(request: Request) {
      ${readLines}
      ${beforeVerifier}
      const event = verifySignature(rawBody, signature, secret);
      const claim = await claimWebhookDelivery(event.id);
      if (claim.status === "completed") return new Response("duplicate", { status: 200 });
      try {
        await handleBillingEvent(event);
        await completeWebhookDelivery(event.id);
      } catch (error) {
        await failWebhookDelivery(event.id, error);
        return new Response("retry", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    }
  `;
}

function cappedArrayBufferHandler(actualCap = true, capAfterVerifier = false): string {
  const actualGuard = `if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) return new Response("too large", { status: 413 });`;
  return `
    const MAX_WEBHOOK_BODY_BYTES = 1_048_576;
    export async function POST(request: Request) {
      const contentLength = request.headers.get("content-length");
      if (contentLength === null) return new Response("length required", { status: 411 });
      if (!/^\\d+$/.test(contentLength)) return new Response("invalid", { status: 400 });
      const declaredBytes = Number(contentLength);
      if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_WEBHOOK_BODY_BYTES) return new Response("too large", { status: 413 });
      const rawBody = await request.arrayBuffer();
      ${actualCap && !capAfterVerifier ? actualGuard : ""}
      const event = verifySignature(Buffer.from(rawBody), signature, secret);
      ${actualCap && capAfterVerifier ? actualGuard : ""}
      const claim = await claimWebhookDelivery(event.id);
      if (claim.status === "completed") return new Response("duplicate", { status: 200 });
      await handleBillingEvent(event);
      await completeWebhookDelivery(event.id);
      return new Response("ok", { status: 200 });
    }
  `;
}

describe("webhook architecture", () => {
  test("accepts a bounded stream before verify, claim, handle, complete, and acknowledge", () => {
    expect(check(streamingHandler())).toEqual([]);
  });

  test("accepts Stripe's Bun-compatible async webhook verifier", () => {
    const source = streamingHandler().replace(
      "const event = verifySignature(rawBody, signature, secret);",
      "const event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);",
    );
    expect(check(source)).toEqual([]);
  });

  test("accepts arrayBuffer only with strict declared and actual caps", () => {
    expect(check(cappedArrayBufferHandler())).toEqual([]);
  });

  test("accepts every generated Next provider route's bounded raw-byte lineage", () => {
    for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const generated = webhookContent(provider, "next", mode, database);
          expect(
            check(generated.content, generated.path),
            `${provider}/${mode}/${database}`,
          ).toEqual([]);
        }
      }
    }
  });

  test("production TanStack webhook routes delegate dynamically to fully audited server modules", () => {
    const verifierByProvider = {
      stripe: "stripe.webhooks.constructEventAsync",
      chargily: "verifySignature(",
      paddle: "paddle.webhooks.unmarshal",
      polar: "validateEvent(",
    } as const;

    for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const label = `${provider}/${mode}/${database}`;
          const root = mode === "monorepo" ? "apps/web/" : "";
          const routePath = `${root}src/routes/api/webhooks/${provider}.ts`;
          const serverPath = `${root}src/server/http/webhooks/${provider}.server.ts`;
          const generated = webhookRouteFiles(provider, "tanstack", mode, database);

          expect(
            generated.map(({ path }) => path),
            `${label} production paths`,
          ).toEqual([routePath, serverPath]);
          const route = generated[0]!;
          const server = generated[1]!;
          const routeParse = parseFile(route.content, ".ts");
          const serverParse = parseFile(server.content, ".ts");

          expect(routeParse.diagnostics, `${label} route parse`).toEqual([]);
          expect(serverParse.diagnostics, `${label} server parse`).toEqual([]);
          expect(
            routeParse.importReferences.map(({ kind, specifier }) => [kind, specifier]),
            `${label} route imports`,
          ).toEqual([
            ["import", "@tanstack/react-start"],
            ["import", "@tanstack/react-router"],
            ["dynamic-import", `@/server/http/webhooks/${provider}.server`],
          ]);
          expect(route.content, `${label} server-only wrapper`).toContain(
            `const dispatchWebhook = createServerOnlyFn(
  async (context: { request: Request }): Promise<Response> => {
    const { POST } = await import("@/server/http/webhooks/${provider}.server");
    return await POST(context);
  },
);`,
          );
          expect(route.content, `${label} handler delegation`).toContain(
            "POST: (context) => dispatchWebhook(context),",
          );
          expect(route.content, `${label} no handler-local import`).not.toContain(
            `(await import("@/server/http/webhooks/${provider}.server")).POST(context)`,
          );
          for (const forbidden of [
            'import "server-only"',
            "process.env",
            "body.getReader()",
            "readBoundedWebhookBody",
            "claimWebhookDelivery",
            "runBillingMutation",
          ]) {
            expect(route.content, `${label} thin route excludes ${forbidden}`).not.toContain(
              forbidden,
            );
          }

          expect(server.content, `${label} server-only marker`).toStartWith(
            'import "server-only";',
          );
          expect(server.content, `${label} exported handler`).toContain(
            "export async function POST(",
          );
          expect(server.content, `${label} no route registration`).not.toContain("createFileRoute");
          expect(server.content, `${label} bounded stream`).toContain("body.getReader()");
          expect(server.content, `${label} bounded reader call`).toContain(
            "readBoundedWebhookBody(declaredBodyRejection)",
          );
          expect(server.content, `${label} overflow cancellation`).toContain(
            "await reader.cancel(",
          );
          expect(server.content, `${label} provider verifier`).toContain(
            verifierByProvider[provider],
          );
          expect(server.content, `${label} durable claim`).toContain(
            database === "postgres"
              ? "claimWebhookDelivery("
              : 'runBillingMutation("claimWebhookEvent"',
          );
          expect(server.content, `${label} durable completion`).toContain(
            database === "postgres"
              ? "completeWebhookDelivery("
              : 'runBillingMutation("completeWebhookEvent"',
          );
          expect(check(route.content, route.path), `${label} route findings`).toEqual([]);
          expect(check(server.content, server.path), `${label} server findings`).toEqual([]);
        }
      }
    }
  });

  test("does not grant the TanStack delegation exemption to dead-string spoofs", () => {
    const source = `
      import { createServerOnlyFn } from "@tanstack/react-start";
      import { createFileRoute } from "@tanstack/react-router";

      const dispatchWebhook = createServerOnlyFn(
        async (context: { request: Request }): Promise<Response> => {
          const spoof = 'const { POST } = await import("@/server/http/webhooks/stripe.server"); return await POST(context);';
          return await verifySignature(context, spoof);
        },
      );

      export const Route = createFileRoute("/api/webhooks/stripe")({
        server: { handlers: { POST: (context) => dispatchWebhook(context) } },
      });
    `;

    expect(
      check(source, "apps/web/src/routes/api/webhooks/stripe.ts").map(({ id }) => id),
    ).toContain("webhook-body-read-count");
  });

  test("fully audits invalid split webhook server modules", () => {
    const source = `
      export async function POST({ request }: { request: Request }): Promise<Response> {
        await request.json();
        return new Response("ok", { status: 200 });
      }
    `;

    expect(
      check(source, "apps/web/src/server/http/webhooks/stripe.server.ts").map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining(["webhook-body-not-byte-preserving", "webhook-missing-verification"]),
    );
  });

  test("rejects unbounded, post-accumulation, and fixed-byte stream helper spoofs", () => {
    const noOverflowGuard = boundedStreamHelpers.replace(
      `if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {
          await reader.cancel("too large");
          return payloadTooLarge();
        }
        chunks.push(value);`,
      "chunks.push(value);",
    );
    const noIncomingChunkCap = boundedStreamHelpers.replace(
      "totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES",
      "totalBytes > MAX_WEBHOOK_BODY_BYTES",
    );
    const postAccumulationCap = boundedStreamHelpers.replace(
      `if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {
          await reader.cancel("too large");
          return payloadTooLarge();
        }
        chunks.push(value);`,
      `chunks.push(value);
        if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {
          await reader.cancel("too large");
          return payloadTooLarge();
        }`,
    );
    const fixedBytes = boundedStreamHelpers.replace(
      "return result;",
      'return Buffer.from("fixed");',
    );
    const oversizedLimit = boundedStreamHelpers.replace(
      "const MAX_WEBHOOK_BODY_BYTES = 1_048_576;",
      "const MAX_WEBHOOK_BODY_BYTES = 99_999_999;",
    );

    for (const source of [
      noOverflowGuard,
      noIncomingChunkCap,
      postAccumulationCap,
      fixedBytes,
      oversizedLimit,
    ]) {
      const ids = check(streamingHandler(source)).map(({ id }) => id);
      expect(ids).toContain("webhook-body-unbounded");
      expect(ids).toContain("webhook-verifier-reconstructed-body");
    }
  });

  test("rejects omitted Response guards and multiple body consumption", () => {
    const missingResultGuard = streamingHandler(
      boundedStreamHelpers,
      `
        const declaredBodyRejection = rejectDeclaredBodySize(request);
        if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
        const rawBody = await readBoundedWebhookBody(declaredBodyRejection);
      `,
    );
    expect(check(missingResultGuard).map(({ id }) => id)).toContain("webhook-body-unbounded");

    const missingDeclaredGuard = streamingHandler(
      boundedStreamHelpers,
      `
        const declaredBodyRejection = rejectDeclaredBodySize(request);
        const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
        if (bodyResult instanceof Response) return bodyResult;
        const rawBody = bodyResult;
      `,
    );
    expect(check(missingDeclaredGuard).map(({ id }) => id)).toContain("webhook-body-unbounded");

    const lateResultGuard = streamingHandler(
      boundedStreamHelpers,
      `
        const declaredBodyRejection = rejectDeclaredBodySize(request);
        if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
        const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
        const rawBody = bodyResult;
        verifySignature(rawBody, signature, secret);
        if (bodyResult instanceof Response) return bodyResult;
      `,
    );
    expect(check(lateResultGuard).map(({ id }) => id)).toContain("webhook-body-unbounded");

    const duplicateRead = streamingHandler(
      boundedStreamHelpers,
      `
        const declaredBodyRejection = rejectDeclaredBodySize(request);
        if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
        const first = await readBoundedWebhookBody(declaredBodyRejection);
        if (first instanceof Response) return first;
        const second = await readBoundedWebhookBody(declaredBodyRejection);
        if (second instanceof Response) return second;
        const rawBody = second;
      `,
    );
    expect(check(duplicateRead).map(({ id }) => id)).toContain("webhook-body-read-count");

    const mixedRead = streamingHandler(boundedStreamHelpers, undefined, "await request.text();");
    expect(check(mixedRead).map(({ id }) => id)).toEqual(
      expect.arrayContaining(["webhook-body-read-count", "webhook-body-not-byte-preserving"]),
    );
  });

  test("preserves bounded helper lineage into parse-before-verification detection", () => {
    expect(
      check(
        streamingHandler(boundedStreamHelpers, undefined, 'JSON.parse(rawBody.toString("utf-8"));'),
      ).map(({ id }) => id),
    ).toContain("webhook-parses-before-verification");
  });

  test("does not restore raw-byte lineage after decoding and re-encoding", () => {
    const reencoded = streamingHandler(
      boundedStreamHelpers,
      `
        const declaredBodyRejection = rejectDeclaredBodySize(request);
        if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
        const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
        if (bodyResult instanceof Response) return bodyResult;
        const rawText = bodyResult.toString("utf-8");
        const rawBody = Buffer.from(rawText);
      `,
    );
    expect(check(reencoded).map(({ id }) => id)).toContain("webhook-verifier-reconstructed-body");
  });

  test("rejects arrayBuffer without either cap or with the actual cap after processing", () => {
    expect(check(cappedArrayBufferHandler(false)).map(({ id }) => id)).toContain(
      "webhook-body-unbounded",
    );
    expect(check(cappedArrayBufferHandler(true, true)).map(({ id }) => id)).toContain(
      "webhook-body-unbounded",
    );
    const missingDeclared = cappedArrayBufferHandler().replace(
      /const contentLength[\s\S]*?const rawBody/,
      "const rawBody",
    );
    expect(check(missingDeclared).map(({ id }) => id)).toContain("webhook-body-unbounded");
    const unrelatedCap = cappedArrayBufferHandler().replace(
      "rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES",
      "otherBody.byteLength > MAX_WEBHOOK_BODY_BYTES",
    );
    expect(check(unrelatedCap).map(({ id }) => id)).toContain("webhook-body-unbounded");
    const loggingOnlyDeclaredCap = cappedArrayBufferHandler().replace(
      'if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_WEBHOOK_BODY_BYTES) return new Response("too large", { status: 413 });',
      'if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > MAX_WEBHOOK_BODY_BYTES) logger.warn("too large");',
    );
    expect(check(loggingOnlyDeclaredCap).map(({ id }) => id)).toContain("webhook-body-unbounded");
  });

  test("counts only the webhook Request consumers, not response or upload bodies", () => {
    const source = streamingHandler(
      boundedStreamHelpers,
      undefined,
      `
        const uploadBytes = await upload.arrayBuffer();
        const upstreamPayload = await response.json();
        void uploadBytes;
        void upstreamPayload;
      `,
    );
    expect(check(source)).toEqual([]);
  });

  test("rejects comment spoofing and parsed or reconstructed request bodies", () => {
    const findings = check(`
      export async function POST(request: Request) {
        // Buffer.from(await request.arrayBuffer()); completeWebhookDelivery();
        const parsed = await request.json();
        const event = verifySignature(Buffer.from(JSON.stringify(parsed)), signature, secret);
        return new Response("ok", { status: 200 });
      }
    `);
    expect(findings.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "webhook-body-not-byte-preserving",
        "webhook-verifier-reconstructed-body",
      ]),
    );
  });

  test("rejects body parsing before signature verification", () => {
    const findings = check(`
      export async function POST(request: Request) {
        const rawBody = Buffer.from(await request.arrayBuffer());
        const parsed = JSON.parse(rawBody.toString("utf-8"));
        const event = verifySignature(rawBody, signature, secret);
        const claim = await claimWebhookDelivery(event.id);
        await handleBillingEvent(parsed);
        await completeWebhookDelivery(claim.id);
        return new Response("ok", { status: 200 });
      }
    `);
    expect(findings.map(({ id }) => id)).toContain("webhook-parses-before-verification");
  });

  test("rejects logger-only handler failure followed by completion and 200", () => {
    const findings = check(`
      export async function POST(request: Request) {
        const rawBody = Buffer.from(await request.arrayBuffer());
        const event = verifySignature(rawBody, signature, secret);
        await claimWebhookDelivery(event.id);
        try { await handleBillingEvent(event); }
        catch (error) { logger.error(error); }
        await completeWebhookDelivery(event.id);
        return new Response("ok", { status: 200 });
      }
    `);
    expect(findings.map(({ id }) => id)).toContain("webhook-handler-failure-acknowledged");
  });

  test("rejects acknowledgement before completion and missing claims", () => {
    const findings = check(`
      export async function POST(request: Request) {
        const rawBody = Buffer.from(await request.arrayBuffer());
        const event = verifySignature(rawBody, signature, secret);
        await handleBillingEvent(event);
        if (event.id) return new Response("ok", { status: 200 });
        await completeWebhookDelivery(event.id);
        return new Response("ok", { status: 200 });
      }
    `);
    expect(findings.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["webhook-missing-durable-claim", "webhook-ack-before-completion"]),
    );
  });

  test("rejects provider verifier success branches not dominated by verification", () => {
    const findings = check(
      `
        export async function verifyPolarWebhook(input: { rawBody: Buffer }) {
          const rawBody = input.rawBody;
          if (!sdk) {
            const parsed = JSON.parse(rawBody.toString("utf-8"));
            return { valid: true, event: parsed };
          }
          const event = sdk.validateEvent(rawBody, headers, secret);
          return { valid: true, event };
        }
      `,
      "packages/billing/src/providers/polar/webhook.ts",
    );
    expect(findings.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "webhook-parses-before-verification",
        "webhook-success-before-verification",
      ]),
    );
  });

  test("rejects time or random fallback delivery identifiers", () => {
    const findings = check(`
      export async function POST(request: Request) {
        const rawBody = Buffer.from(await request.arrayBuffer());
        const event = verifySignature(rawBody, signature, secret);
        const eventId = event.id ?? \`evt_\${Date.now()}_\${Math.random()}\`;
        await claimWebhookDelivery(eventId);
        await handleBillingEvent(event);
        await completeWebhookDelivery(eventId);
        return new Response("ok", { status: 200 });
      }
    `);
    expect(findings.map(({ id }) => id)).toContain("webhook-random-event-id");
  });
});
