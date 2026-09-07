import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { notificationsActionsContent } from "./actions.js";
import { notificationsContextContent } from "./context.js";
import { notificationsContractContent } from "./contract.js";
import { notificationsProceduresContent } from "./procedures.js";
import { notificationsSchemasContent } from "./schemas.js";
import { notificationsApiRoot } from "./shared.js";

function notificationsApiIndexContent(): string {
  return `export { notificationsContract } from "./contract.js";
export { createNotificationActions } from "./actions.js";
export { createNotificationProcedures, type NotificationProcedures } from "./procedures.js";
export { type NotificationsTransportContext } from "./context.js";
`;
}

export function notificationsApiFiles(mode: ProjectMode): TemplateFile[] {
  const root = notificationsApiRoot(mode);
  return [
    file(`${root}/schemas.ts`, notificationsSchemasContent()),
    file(`${root}/contract.ts`, notificationsContractContent()),
    file(`${root}/context.ts`, notificationsContextContent(mode)),
    file(`${root}/actions.ts`, notificationsActionsContent()),
    file(`${root}/procedures.ts`, notificationsProceduresContent()),
    file(`${root}/index.ts`, notificationsApiIndexContent()),
  ];
}

export interface NotificationsApiIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  contractImport: string;
  contractEntry: string;
  contextField: string;
  routerEntry: string;
  compositionInstruction: string;
}

export function notificationsApiIntegrationGuide(
  mode: ProjectMode,
): NotificationsApiIntegrationGuide {
  const serviceModule =
    mode === "monorepo" ? "@repo/services/notifications" : "@/server/services/notifications";
  return {
    rendererImport: `import { notificationsApiFiles } from "./api/notifications/index.js";`,
    rendererCall: `files.push(...notificationsApiFiles("${mode}"));`,
    contractImport: `import { notificationsContract } from "./notifications/contract.js";`,
    contractEntry: `notifications: notificationsContract,`,
    contextField: `notificationActor?: import("${serviceModule}").NotificationActor | null;`,
    routerEntry: `notifications: createNotificationProcedures<ApiContext>(),`,
    compositionInstruction:
      "Adapt the selected database and a cryptographic token fingerprinter behind NotificationRepositoryPort and NotificationDeviceTokenPort.",
  };
}
