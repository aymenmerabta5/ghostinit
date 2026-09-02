export function notificationsProceduresContent(): string {
  return `import { implement } from "@orpc/server";
import { createNotificationActions } from "./actions.js";
import { notificationsContract } from "./contract.js";
import type { NotificationsTransportContext } from "./context.js";

export function createNotificationProcedures<TContext extends NotificationsTransportContext>() {
  const implementer = implement<typeof notificationsContract, TContext>(notificationsContract);
  const actions = createNotificationActions<TContext>();
  return {
    createSelf: implementer.createSelf.handler(actions.createSelf),
    listInbox: implementer.listInbox.handler(actions.listInbox),
    markRead: implementer.markRead.handler(actions.markRead),
    registerDevice: implementer.registerDevice.handler(actions.registerDevice),
  };
}

export type NotificationProcedures<TContext extends NotificationsTransportContext> = ReturnType<
  typeof createNotificationProcedures<TContext>
>;
`;
}
