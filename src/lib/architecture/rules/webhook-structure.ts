/** Security invariants for unauthenticated billing webhook boundaries. */

import { parseSync } from "oxc-parser";
import type { ArchitectureFinding } from "../types.js";
import { inspectWebhookFunctions } from "./webhook-ast.js";

function isWebhookSource(file: string): boolean {
  const normalized = `/${file.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  return (
    /\/(?:api\/)?webhooks?\//.test(normalized) ||
    /\/billing\/(?:src\/)?providers\/(?:stripe|chargily|paddle|polar)\/webhook\.[cm]?[jt]s$/.test(
      normalized,
    )
  );
}

function astShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(astShape);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["start", "end", "raw", "loc", "range"].includes(key))
      .map(([key, child]) => [key, astShape(child)]),
  );
}

function tanstackWebhookDelegationSource(provider: string): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchWebhook = createServerOnlyFn(
  async (context: { request: Request }): Promise<Response> => {
    const { POST } = await import("@/server/http/webhooks/${provider}.server");
    return await POST(context);
  },
);

export const Route = createFileRoute("/api/webhooks/${provider}")({
  server: {
    handlers: {
      POST: (context) => dispatchWebhook(context),
    },
  },
});
`;
}

function tanstackWebhookRouteProvider(file: string): string | undefined {
  const normalized = file.replace(/\\/g, "/");
  return normalized.match(
    /(?:^|\/)src\/routes\/api\/webhooks\/(stripe|chargily|paddle|polar)\.ts$/,
  )?.[1];
}

function isVerifiedTanstackWebhookDelegation(file: string, source: string): boolean {
  const provider = tanstackWebhookRouteProvider(file);
  if (!provider) return false;
  const actual = parseSync("webhook-delegation.ts", source, {
    lang: "ts",
    sourceType: "module",
  });
  if (actual.errors.length > 0) return false;
  const expected = parseSync("webhook-delegation.ts", tanstackWebhookDelegationSource(provider), {
    lang: "ts",
    sourceType: "module",
  });
  return (
    JSON.stringify(astShape(actual.program.body)) ===
    JSON.stringify(astShape(expected.program.body))
  );
}

function finding(findings: ArchitectureFinding[], file: string, id: string, message: string): void {
  findings.push({ id, severity: "HIGH", message, file, rule: "webhook-structure" });
}

export function checkWebhookStructure(
  findings: ArchitectureFinding[],
  file: string,
  source: string,
  extension: string,
): void {
  if (!isWebhookSource(file)) return;
  const functions = inspectWebhookFunctions(source, extension);
  const verifiedDelegation = isVerifiedTanstackWebhookDelegation(file, source);
  const invalidDelegation = tanstackWebhookRouteProvider(file) !== undefined && !verifiedDelegation;

  if (invalidDelegation) {
    finding(
      findings,
      file,
      "webhook-body-read-count",
      "TanStack webhook routes must be exact thin delegators to their audited .server handler",
    );
  }

  for (const facts of functions) {
    const subject = facts.name === "anonymous" ? "webhook function" : facts.name;
    const firstVerifier = facts.verifierCalls[0];
    const finalSuccess = facts.successReturns.at(-1)?.position;

    if (
      facts.routeHandler &&
      facts.bodyReads.length !== 1 &&
      !verifiedDelegation &&
      !invalidDelegation
    ) {
      finding(
        findings,
        file,
        "webhook-body-read-count",
        `${subject} must consume the request body exactly once through a byte-preserving bounded reader`,
      );
    }
    if (facts.routeHandler && facts.unboundedBodyReads.length > 0) {
      finding(
        findings,
        file,
        "webhook-body-unbounded",
        `${subject} consumes request bytes without both declared and actual bounds`,
      );
    }
    if (facts.forbiddenBodyReads.length > 0) {
      finding(
        findings,
        file,
        "webhook-body-not-byte-preserving",
        `${subject} uses json/text/formData/blob instead of preserving the request bytes`,
      );
    }
    if (facts.invalidVerifierCalls.length > 0) {
      finding(
        findings,
        file,
        "webhook-verifier-reconstructed-body",
        `${subject} invokes a signature verifier without the original raw-body lineage`,
      );
    }
    if (firstVerifier === undefined && facts.successReturns.length > 0) {
      finding(
        findings,
        file,
        "webhook-missing-verification",
        `${subject} can acknowledge or return a valid event without verified request bytes`,
      );
    }
    if (
      firstVerifier !== undefined &&
      facts.bodyParses.some((position) => position < firstVerifier)
    ) {
      finding(
        findings,
        file,
        "webhook-parses-before-verification",
        `${subject} parses body-derived data before signature verification`,
      );
    }
    if (
      firstVerifier !== undefined &&
      facts.successReturns.some(
        ({ position, duplicateGuard }) => position < firstVerifier && !duplicateGuard,
      )
    ) {
      finding(
        findings,
        file,
        "webhook-success-before-verification",
        `${subject} has a success path not dominated by signature verification`,
      );
    }
    if (facts.randomEventIds.length > 0) {
      finding(
        findings,
        file,
        "webhook-random-event-id",
        `${subject} derives an idempotency key from time or randomness instead of delivery bytes`,
      );
    }

    if (!facts.routeHandler || firstVerifier === undefined) continue;
    const completionSet = new Set(facts.completions);
    const businessEffects = facts.sideEffects.filter(
      (position) => position > firstVerifier && !completionSet.has(position),
    );
    const firstBusiness = businessEffects[0];
    const lastBusiness = businessEffects.at(-1);
    const firstClaim = facts.claims[0];
    const finalCompletion = facts.completions.at(-1);

    if (firstBusiness !== undefined && firstClaim === undefined) {
      finding(
        findings,
        file,
        "webhook-missing-durable-claim",
        `${subject} performs business side effects without first claiming the delivery`,
      );
    } else if (
      firstBusiness !== undefined &&
      firstClaim !== undefined &&
      firstClaim > firstBusiness
    ) {
      finding(
        findings,
        file,
        "webhook-claim-after-side-effect",
        `${subject} claims the delivery after a business side effect`,
      );
    }

    if (lastBusiness !== undefined && finalCompletion === undefined) {
      finding(
        findings,
        file,
        "webhook-missing-durable-completion",
        `${subject} does not durably complete a successfully handled delivery`,
      );
    } else if (
      lastBusiness !== undefined &&
      finalCompletion !== undefined &&
      finalCompletion < lastBusiness
    ) {
      finding(
        findings,
        file,
        "webhook-completion-before-side-effect",
        `${subject} marks a delivery complete before all business side effects finish`,
      );
    }

    if (
      finalSuccess !== undefined &&
      finalCompletion !== undefined &&
      facts.successReturns.some(
        ({ position, duplicateGuard }) =>
          position > firstVerifier && position < finalCompletion && !duplicateGuard,
      )
    ) {
      finding(
        findings,
        file,
        "webhook-ack-before-completion",
        `${subject} returns a success response before durable completion`,
      );
    }
    if (
      finalSuccess !== undefined &&
      facts.unsafeCatches.some((position) => position > firstVerifier && position < finalSuccess)
    ) {
      finding(
        findings,
        file,
        "webhook-handler-failure-acknowledged",
        `${subject} swallows a handler or persistence failure and can still acknowledge success`,
      );
    }
  }
}
