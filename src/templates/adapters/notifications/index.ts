import type { DatabaseProvider, ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";
import { convexNotificationFunctionsContent } from "./convex-functions.js";
import { convexNotificationTokenProtectionContent } from "./convex-token-protection.js";
import { convexNotificationAdapterContent } from "./convex.js";
import { postgresNotificationAdapterContent } from "./postgres.js";
import { convexNotificationsSchemaContent, postgresNotificationsSchemaContent } from "./schema.js";
import { notificationTokenProtectionContent } from "./token-protection.js";

export interface NotificationAdapterRenderOptions {
  mode: ProjectMode;
  database: Exclude<DatabaseProvider, "none">;
}

function adapterRoot(mode: ProjectMode): string {
  return mode === "monorepo"
    ? "packages/services/src/application/composition/adapters/notifications"
    : "src/server/services/application/composition/adapters/notifications";
}

export function notificationAdapterFiles({
  mode,
  database,
}: NotificationAdapterRenderOptions): TemplateFile[] {
  const root = adapterRoot(mode);
  const common = [file(`${root}/token-protection.ts`, notificationTokenProtectionContent())];
  if (database === "postgres") {
    return [
      ...common,
      file(
        mode === "monorepo"
          ? "packages/database/src/schema/notifications.ts"
          : "src/server/db/schema/notifications.ts",
        postgresNotificationsSchemaContent(),
      ),
      file(`${root}/postgres.ts`, postgresNotificationAdapterContent(mode)),
    ];
  }
  return [
    ...common,
    file("convex/schema/notifications.ts", convexNotificationsSchemaContent()),
    file("convex/lib/notification-token-protection.ts", convexNotificationTokenProtectionContent()),
    file("convex/notifications.ts", convexNotificationFunctionsContent()),
    file(`${root}/convex.ts`, convexNotificationAdapterContent(mode)),
  ];
}

export interface NotificationAdapterIntegrationGuide {
  schemaBarrelLine: string | null;
  convexSchemaImport: string | null;
  convexSchemaSpread: string | null;
  compositionImport: string;
  apiDependencies: Readonly<Record<string, string>>;
  environment: typeof NOTIFICATION_ADAPTER_ENV;
}

export const NOTIFICATION_ADAPTER_ENV = Object.freeze({
  name: "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
  exampleLine: "NOTIFICATION_TOKEN_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64URL_KEY",
  serverSchemaLine: "NOTIFICATION_TOKEN_ENCRYPTION_KEY: z.string().min(43)",
  runtimeLine: "NOTIFICATION_TOKEN_ENCRYPTION_KEY: process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY",
  turboGlobalEnv: "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
  materialization:
    'Mint randomBytes(32).toString("base64url") in .env.local and set the same value on the Convex deployment; keep the example placeholder.',
});

export function notificationAdapterIntegrationGuide({
  mode,
  database,
}: NotificationAdapterRenderOptions): NotificationAdapterIntegrationGuide {
  return {
    schemaBarrelLine:
      database === "postgres"
        ? 'export { notificationDeviceTokens, notifications } from "./notifications";'
        : null,
    convexSchemaImport:
      database === "convex" ? 'import { notificationTables } from "./schema/notifications";' : null,
    convexSchemaSpread: database === "convex" ? "...notificationTables," : null,
    compositionImport:
      database === "postgres"
        ? mode === "monorepo"
          ? 'import { postgresNotificationAdapter } from "../adapters/notifications/postgres";'
          : 'import { postgresNotificationAdapter } from "@/server/services/application/composition/adapters/notifications/postgres";'
        : mode === "monorepo"
          ? 'import { createConvexNotificationAdapter } from "../adapters/notifications/convex";'
          : 'import { createConvexNotificationAdapter } from "@/server/services/application/composition/adapters/notifications/convex";',
    apiDependencies:
      database === "postgres"
        ? {
            "@repo/database": "workspace:*",
            "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          }
        : {},
    environment: NOTIFICATION_ADAPTER_ENV,
  };
}
