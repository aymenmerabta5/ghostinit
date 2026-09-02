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
    "tests/unit/identity-ui-flows.test.ts",
    "generated shared schemas reject invalid structured form values",
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
      "tests/unit/auth-passkey-platform-parity.test.ts",
      "forwards registration, authentication, listing, rename, and owner deletion",
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
    "tests/unit/billing-chargily.test.ts",
    "exposes merchant payment links through the typed application security facade",
  ),
  behavioralEvidence(
    "billing",
    "billing.portal.v1",
    "tests/unit/billing-portal-security.test.ts",
    "emits customer-id-free oRPC portal inputs in both packaging modes",
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
    "failed server uploads abort owned blobs while cleanup preserves committed storage",
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
    "tests/unit/messaging-storage-security.test.ts",
    "desktop Postgres messaging degrades to polling when native websocket tickets are unavailable",
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
    "tests/unit/messaging-storage-security.test.ts",
    "websocket handshakes reject cross-site origins and expose one typed oRPC endpoint",
  ),
  behavioralEvidence(
    "messaging",
    "messaging.typing.v1",
    "tests/unit/messaging-storage-security.test.ts",
    "websocket handshakes reject cross-site origins and expose one typed oRPC endpoint",
  ),
  behavioralEvidence(
    "email",
    "email.send.v1",
    "tests/unit/transactional-email-i18n.test.ts",
    "resolves cookie and weighted Accept-Language preferences and formats subjects",
  ),
  behavioralEvidence(
    "storage",
    "storage.authorized-read.v1",
    "tests/unit/convex-storage-security.test.ts",
    "keeps storage IDs behind a server-owned action and internal registry",
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
    "tests/unit/generated-audience-cache-matrix.test.ts",
    "configuration and provider failures reject instead of fabricating success",
  ),
  behavioralEvidence(
    "analytics",
    "analytics.capture.v1",
    "tests/unit/expo-analytics.test.ts",
    "implements the PostHog 4.x provider, opt-out, and manual Expo screen APIs",
  ),
  behavioralEvidence(
    "i18n",
    "i18n.locale-routing.v1",
    "tests/unit/transactional-email-i18n.test.ts",
    "resolves cookie and weighted Accept-Language preferences and formats subjects",
  ),
  behavioralEvidence(
    "pdf",
    "pdf.render.v1",
    "tests/unit/pdf-security.test.ts",
    "revives only template date fields and rejects invalid dates before rendering",
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
    "tests/unit/backend-capabilities/jobs-behavior.test.ts",
    "deduplicates enqueue deterministically and denies cross-user access",
  ),
  behavioralEvidence(
    "jobs",
    "jobs.schedule.v1",
    "tests/unit/backend-capabilities/jobs-behavior.test.ts",
    "materializes schedules replay-safely even when schedule advancement races",
  ),
] as const satisfies readonly CapabilityOperationEvidence[];
