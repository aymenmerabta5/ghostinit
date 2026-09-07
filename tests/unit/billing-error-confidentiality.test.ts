import { describe, expect, test } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";

interface TestContext {
  application: { billing: { subscriptions(): Promise<unknown> } };
}

type SubscriptionsHandler = (input: { context: TestContext }) => Promise<unknown>;

class TestORPCError extends Error {
  readonly code: string;

  constructor(code: string, options?: { message?: string; cause?: unknown }) {
    super(options?.message, { cause: options?.cause });
    this.code = code;
  }
}

function fluentContract() {
  const value = {
    errors: () => value,
    output: () => value,
  };
  return value;
}

function loadSubscriptionsHandler(content: string): SubscriptionsHandler {
  const start = content.indexOf("const contract = {");
  if (start < 0) throw new Error("Generated billing subscriptions contract is missing");
  const source = content.slice(start).replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const oc = { route: () => fluentContract() };
  const z = {
    object: () => ({}),
    array: () => ({}),
    record: () => ({}),
    string: () => ({}),
    unknown: () => ({}),
  };
  const implement = () => ({ list: { handler: (handler: SubscriptionsHandler) => handler } });
  const createServiceORPCError = (
    error: unknown,
    options: { codeMap: Record<string, string>; fallbackMessage: string },
  ): never => {
    if (error instanceof TestORPCError) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? options.codeMap[String(error.code)]
        : undefined;
    throw new TestORPCError(code ?? "INTERNAL_SERVER_ERROR", {
      message: options.fallbackMessage,
      cause: error,
    });
  };

  return new Function(
    "oc",
    "implement",
    "ORPCError",
    "z",
    "createServiceORPCError",
    `${javascript}; return billingSubscriptions;`,
  )(oc, implement, TestORPCError, z, createServiceORPCError) as SubscriptionsHandler;
}

describe("billing transport error confidentiality", () => {
  function billingSubscriptionSources(): Array<readonly [string, string]> {
    const monorepo =
      apiPackage(true).find((entry) => entry.path.endsWith("procedures/billing/subscriptions.ts"))
        ?.content ?? "";
    const single =
      singleBillingApiFiles().find((entry) =>
        entry.path.endsWith("procedures/billing/subscriptions.ts"),
      )?.content ?? "";
    return [
      ["monorepo", monorepo],
      ["single", single],
    ];
  }

  test("does not expose repository failures through either packaging mode", async () => {
    for (const [mode, content] of billingSubscriptionSources()) {
      const handler = loadSubscriptionsHandler(content);
      const failure = await handler({
        context: {
          application: {
            billing: {
              async subscriptions() {
                throw new Error("postgres://billing-user:database-password@db.internal/private");
              },
            },
          },
        },
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, mode).toBeInstanceOf(TestORPCError);
      expect(failure, mode).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to load billing data",
      });
      expect(String(failure), mode).not.toContain("database-password");
      expect(String(failure), mode).not.toContain("db.internal");
    }
  });

  test("requires verified email identically in both packaging modes", async () => {
    for (const [mode, content] of billingSubscriptionSources()) {
      const handler = loadSubscriptionsHandler(content);
      const failure = await handler({
        context: {
          application: {
            billing: {
              async subscriptions() {
                throw new TestORPCError("FORBIDDEN", { message: "Verified email required" });
              },
            },
          },
        },
      }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, mode).toMatchObject({
        code: "FORBIDDEN",
        message: "Verified email required",
      });
    }
  });
});
