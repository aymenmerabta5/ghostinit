import { describe, expect, test } from "bun:test";
import { webhookContent } from "../../src/templates/billing/webhooks/providers";
import {
  MAX_WEBHOOK_BODY_BYTES,
  webhookBodyLimitHelpers,
  webhookBodyReadLines,
} from "../../src/templates/billing/webhooks/providers/shared";

describe("billing webhook body limits", () => {
  test("shared reader rejects declared and streamed oversize bodies before unbounded buffering", async () => {
    const source = [
      ...webhookBodyLimitHelpers(),
      "",
      "export async function readForTest(request: Request): Promise<Buffer | Response> {",
      ...webhookBodyReadLines("request"),
      "  return buf;",
      "}",
    ].join("\n");
    const javascript = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(source);
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
    const readerModule = await import(moduleUrl);

    let declaredBodyConsumed = false;
    const declaredOversizeRequest = {
      headers: new Headers({ "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) }),
      get body() {
        declaredBodyConsumed = true;
        return new ReadableStream<Uint8Array>();
      },
    } as Request;
    const declaredResult = await readerModule.readForTest(declaredOversizeRequest);
    expect(declaredResult).toBeInstanceOf(Response);
    expect((declaredResult as Response).status).toBe(413);
    expect(declaredBodyConsumed).toBe(false);

    const invalidLengthResult = await readerModule.readForTest({
      headers: new Headers({ "content-length": "12bytes" }),
      get body() {
        declaredBodyConsumed = true;
        return new ReadableStream<Uint8Array>();
      },
    } as Request);
    expect(invalidLengthResult).toBeInstanceOf(Response);
    expect((invalidLengthResult as Response).status).toBe(400);
    expect(declaredBodyConsumed).toBe(false);

    let cancelled = false;
    let pulls = 0;
    const actualOversizeRequest = {
      // A lying declared size must not bypass the streaming enforcement.
      headers: new Headers({ "content-length": "1" }),
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls++;
          if (pulls === 1) controller.enqueue(new Uint8Array(700_000));
          else if (pulls === 2) controller.enqueue(new Uint8Array(400_000));
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      }),
      arrayBuffer: async () => {
        throw new Error("unbounded arrayBuffer() must never be called");
      },
    } as unknown as Request;
    const actualResult = await readerModule.readForTest(actualOversizeRequest);
    expect(actualResult).toBeInstanceOf(Response);
    expect((actualResult as Response).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(2);

    const originalBytes = new Uint8Array([0, 255, 7, 128]);
    const validRequest = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(originalBytes.subarray(0, 2));
          controller.enqueue(originalBytes.subarray(2));
          controller.close();
        },
      }),
      arrayBuffer: async () => {
        throw new Error("unbounded arrayBuffer() must never be called");
      },
    } as unknown as Request;
    const validResult = await readerModule.readForTest(validRequest);
    expect(Buffer.isBuffer(validResult)).toBe(true);
    expect([...validResult]).toEqual([...originalBytes]);
  });

  for (const provider of ["stripe", "chargily"] as const) {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["next", "tanstack"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          test(`${provider} ${mode}/${framework}/${database} rejects oversized bytes before verification`, () => {
            const content = webhookContent(provider, framework, mode, database).content;
            const declaredCheck = content.indexOf(
              "const declaredBodyRejection = rejectDeclaredBodySize(",
            );
            const boundedRead = content.indexOf("readBoundedWebhookBody(declaredBodyRejection)");
            const verification = content.indexOf(
              provider === "stripe"
                ? "stripe.webhooks.constructEventAsync("
                : "verifySignature(buf",
            );
            expect(content).toContain(`const MAX_WEBHOOK_BODY_BYTES = ${1024 * 1024}`);
            expect(content).toContain('headers.get("content-length")');
            expect(content).toContain("body.getReader()");
            expect(content).toContain("await reader.cancel(");
            expect(content).toContain("status: 413");
            expect(declaredCheck).toBeGreaterThan(-1);
            expect(boundedRead).toBeGreaterThan(declaredCheck);
            expect(verification).toBeGreaterThan(boundedRead);
            expect(content).not.toContain(".arrayBuffer(");
            if (framework === "tanstack") {
              expect(content).toContain("rejectDeclaredBodySize(request)");
              expect(content).not.toContain("rejectDeclaredBodySize(req)");
            }
          });
        }
      }
    }
  }
});
