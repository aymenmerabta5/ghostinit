export const NOTIFICATIONS_CAPABILITY_FRAGMENT = Object.freeze({
  id: "notifications",
  description: "Authenticated, ownership-scoped notification inbox and device registration.",
  requirements: Object.freeze([
    Object.freeze({ kind: "capability", capability: "auth" }),
    Object.freeze({ kind: "capability", capability: "transport" }),
    Object.freeze({ kind: "backend" }),
    Object.freeze({ kind: "persistence" }),
    Object.freeze({
      kind: "target-binding",
      subject: "backend-host",
      targets: Object.freeze(["nextjs", "tanstack-start"]),
    }),
  ]),
  acceptanceOperationIds: Object.freeze([
    "notifications.inbox.list",
    "notifications.inbox.mark-read",
    "notifications.devices.register",
    "notifications.ownership.cross-user-denied",
  ]),
} as const);
