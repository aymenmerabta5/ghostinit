import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { notificationsAdapterContractsContent } from "./adapter-contracts.js";
import { notificationsContractsContent } from "./contracts.js";
import { notificationsErrorsContent } from "./errors.js";
import { notificationsPortsContent } from "./ports.js";
import { notificationsServiceContent } from "./service.js";
import { notificationsServiceRoot } from "./shared.js";

function notificationsIndexContent(): string {
  return `import "server-only";
export { createNotificationService, type NotificationService, type NotificationServiceDependencies } from "./service.js";
export { NotificationError, NOTIFICATION_ERROR_CODES, isNotificationError } from "./errors.js";
export { NOTIFICATION_DEVICE_PLATFORMS } from "./contracts.js";
export { defineConvexNotificationAdapter, definePostgresNotificationAdapter } from "./adapter-contracts.js";
export type {
  NotificationActor,
  NotificationDevicePlatform,
  NotificationDeviceRegistration,
  NotificationInboxPage,
  NotificationMutationResult,
  NotificationPublishInput,
  NotificationRecord,
} from "./contracts.js";
export type {
  NotificationDeviceTokenPort,
  NotificationRepositoryPort,
  RegisterNotificationDeviceResult,
} from "./ports.js";
export type {
  ConvexNotificationAdapter,
  NotificationAdapterParity,
  PostgresNotificationAdapter,
} from "./adapter-contracts.js";
`;
}

export function notificationsServiceFiles(mode: ProjectMode): TemplateFile[] {
  const root = notificationsServiceRoot(mode);
  return [
    file(`${root}/contracts.ts`, notificationsContractsContent()),
    file(`${root}/errors.ts`, notificationsErrorsContent()),
    file(`${root}/ports.ts`, notificationsPortsContent()),
    file(`${root}/adapter-contracts.ts`, notificationsAdapterContractsContent()),
    file(`${root}/service.ts`, notificationsServiceContent()),
    file(`${root}/index.ts`, notificationsIndexContent()),
  ];
}

export interface NotificationsServiceIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  serviceBarrelLine: string;
  packageExport: Readonly<Record<string, string>> | null;
}

export function notificationsServiceIntegrationGuide(
  mode: ProjectMode,
): NotificationsServiceIntegrationGuide {
  return {
    rendererImport: `import { notificationsServiceFiles } from "./notifications/index.js";`,
    rendererCall: `files.push(...notificationsServiceFiles("${mode}"));`,
    serviceBarrelLine: `export * as notifications from "./notifications/index.js";`,
    packageExport:
      mode === "monorepo" ? { "./notifications": "./src/notifications/index.ts" } : null,
  };
}

export { NOTIFICATIONS_CAPABILITY_FRAGMENT } from "./capability.js";
