import type { CapabilityId, CapabilityOperationEvidence } from "./types.js";

function behavioralEvidence(
  capability: CapabilityId,
  operationId: string,
  path: string,
  testName: string,
): CapabilityOperationEvidence {
  return {
    capability,
    operationId,
    artifacts: [{ kind: "bun-test", path, testName }],
  };
}

/**
 * Closed acceptance-evidence ledger for every operation advertised by the
 * support catalog. The release checker resolves every path and test name back
 * to an executable test registration; catalog labels and generated route names
 * are deliberately ineligible as evidence.
 */
export const CAPABILITY_OPERATION_EVIDENCE = [
  behavioralEvidence(
    "transport",
    "transport.health.v1",
    "tests/integration/e2e-build.test.ts",
    "builds and starts the default generated project",
  ),
  behavioralEvidence(
    "transport",
    "transport.roundtrip.v1",
    "tests/unit/native-orpc-transport.test.ts",
    "main-process transport binds URL, headers, cookies, and response size",
  ),
  behavioralEvidence(
    "auth",
    "auth.session.v1",
    "tests/unit/pdf-security.test.ts",
    "the shared API context bypasses cookie cache and fails closed on revoked identity",
  ),
  behavioralEvidence(
    "auth",
    "auth.sign-in.v1",
    "tests/unit/backend-capabilities/auth-sign-in-behavior.test.ts",
    "signs in verified credentials and rejects unverified, incorrect, and revoked sessions",
  ),
  ...[
    "identity.passkey.authenticate.v1",
    "identity.passkey.delete.v1",
    "identity.passkey.list.v1",
    "identity.passkey.register.v1",
    "identity.passkey.rename.v1",
  ].map((operationId) =>
    behavioralEvidence(
      "auth",
      operationId,
      "tests/integration/generated-passkey-webauthn.test.ts",
      "completes registration, authentication, listing, rename, and ownership-safe deletion",
    ),
  ),
  behavioralEvidence(
    "billing",
    "billing.checkout.v1",
    "tests/unit/billing-port-contract.test.ts",
    "checkout creates one owned provider customer and reuses it on the next request",
  ),
  behavioralEvidence(
    "billing",
    "billing.invoices.v1",
    "tests/unit/billing-ownership-event-order.test.ts",
    "Convex upgrades created invoices to paid and never downgrades paid invoices",
  ),
  behavioralEvidence(
    "billing",
    "billing.payment-link.v1",
    "tests/unit/request-application-facade.test.ts",
    "enforces authentication, verification, administration, and limiter order centrally",
  ),
  behavioralEvidence(
    "billing",
    "billing.portal.v1",
    "tests/unit/billing-portal-security.test.ts",
    "resolves the vendor customer id from authenticated actors in both packaging modes",
  ),
  behavioralEvidence(
    "billing",
    "billing.subscriptions.v1",
    "tests/unit/chargily-subscriptions-fail-closed.test.ts",
    "propagates SDK failures instead of fabricating an empty successful result",
  ),
  behavioralEvidence(
    "billing",
    "billing.webhook.v1",
    "tests/unit/billing-convex-authorization-lease.test.ts",
    "prevents a stale PostgreSQL worker from releasing or completing a reclaimed delivery",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.attachment.download.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "attachment download URLs require membership and protect pending ownership",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.attachment.upload.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "trusted messaging server action drives the real begin-bind-commit pipeline",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.conversation.create.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "public conversation creation normalizes untrusted peer id strings",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.list.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "public message pagination uses opaque cursors without duplicates or gaps",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.polling-fallback.v1",
    "tests/unit/realtime-native-ticket-parity.test.ts",
    "executes native typed ticket clients with typing, transport status, and polling fallback",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.send.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "internal conversations and messages enforce the public integrity contract",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.transport-status.v1",
    "tests/unit/realtime-native-ticket-parity.test.ts",
    "executes native typed ticket clients with typing, transport status, and polling fallback",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.typing.v1",
    "tests/integration/convex-messaging-behavior.test.ts",
    "typing updates use the current actor and require conversation membership",
  ),
  behavioralEvidence(
    "email",
    "email.send.v1",
    "tests/unit/backend-capabilities/email-delivery-behavior.test.ts",
    "sends transactional email through both generated provider paths and propagates delivery failure",
  ),
  behavioralEvidence(
    "storage",
    "storage.authorized-read.v1",
    "tests/unit/backend-capabilities/storage-read-behavior.test.ts",
    "reads owned bytes and rejects foreign, anonymous, and suspended actors before disclosure",
  ),
  behavioralEvidence(
    "storage",
    "storage.authorized-write.v1",
    "tests/unit/storage-upload-admission.test.ts",
    "authenticates the actor before reading the uploaded file",
  ),
  behavioralEvidence(
    "cache",
    "cache.get-set.v1",
    "tests/unit/backend-capabilities/cache-behavior.test.ts",
    "stores and retrieves values with expiry and scoped invalidation through the pinned Redis SDK",
  ),
  behavioralEvidence(
    "analytics",
    "analytics.capture.v1",
    "tests/unit/cloudflare-analytics-lifetime.test.ts",
    "concurrent requests never share provider clients, abort signals, or queues",
  ),
  behavioralEvidence(
    "i18n",
    "i18n.locale-routing.v1",
    "tests/unit/backend-capabilities/locale-routing-behavior.test.ts",
    "resolves request locale after persisted switches and preserves weighted fallback",
  ),
  behavioralEvidence(
    "pdf",
    "pdf.render.v1",
    "tests/unit/backend-capabilities/pdf-render-behavior.test.ts",
    "renders every generated document with local fonts after enforcing request authorization",
  ),
  {
    capability: "eve",
    operationId: "eve.invoke.v1",
    artifacts: [
      {
        kind: "bun-test",
        path: "tests/unit/eve-platform-client-parity.test.ts",
        testName:
          "the generated protocol follows create, catch-up, and fixed-session continuation semantics",
      },
      {
        kind: "bun-test",
        path: "tests/unit/eve-durable-lifecycle.test.ts",
        testName:
          "mounts the same private facade, callback, hook, and web client in both TanStack modes",
      },
    ],
  },
  behavioralEvidence(
    "notifications",
    "notifications.create.v1",
    "tests/unit/backend-capabilities/notifications-behavior.test.ts",
    "publishes a bounded notification only to the actor inbox",
  ),
  behavioralEvidence(
    "notifications",
    "notifications.list.v1",
    "tests/unit/backend-capabilities/notifications-behavior.test.ts",
    "lists only the actor inbox and rejects cross-user mark-read",
  ),
  behavioralEvidence(
    "notifications",
    "notifications.mark-read.v1",
    "tests/unit/backend-capabilities/notifications-behavior.test.ts",
    "marks owned notifications idempotently",
  ),
  behavioralEvidence(
    "notifications",
    "notifications.register-device.v1",
    "tests/unit/backend-capabilities/notifications-behavior.test.ts",
    "registers a device idempotently and never transfers it across actors",
  ),
  behavioralEvidence(
    "featureFlags",
    "feature-flags.resolve.v1",
    "tests/unit/backend-capabilities/feature-flags-behavior.test.ts",
    "passes only the trusted subject and preserves deterministic request order",
  ),
  behavioralEvidence(
    "jobs",
    "jobs.execute.v1",
    "tests/unit/backend-capabilities/jobs-execution-behavior.test.ts",
    "executes queued handlers with durable results, replay safety, ownership, retry, and cancellation",
  ),
  behavioralEvidence(
    "jobs",
    "jobs.schedule.v1",
    "tests/unit/backend-capabilities/jobs-behavior.test.ts",
    "materializes schedules replay-safely even when schedule advancement races",
  ),
] as const satisfies readonly CapabilityOperationEvidence[];
