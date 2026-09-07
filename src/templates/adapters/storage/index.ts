import type { DatabaseProvider, ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { storagePackage } from "../../storage.js";
import * as v from "../../versions.js";
import { convexStorageFunctionsContent } from "./convex-functions.js";
import { convexStorageInternalContent } from "./convex-internal.js";
import { convexStorageSchemaContent } from "./convex-schema.js";
import { convexStorageAdapterContent } from "./convex-adapter.js";
import { postgresStorageAdapterContent } from "./postgres.js";
import { postgresStorageSchemaContent } from "./postgres-schema.js";
import { storageQuotaPolicyContent } from "../../services/storage.js";

export interface StorageAdapterRenderOptions {
  mode: ProjectMode;
  database: Exclude<DatabaseProvider, "none">;
  messaging?: boolean;
}

/** Standalone storage renderer; it is intentionally independent of messaging. */
export function storageAdapterFiles({
  mode,
  database,
  messaging = false,
}: StorageAdapterRenderOptions): TemplateFile[] {
  if (database === "postgres") {
    const adapterRoot =
      mode === "monorepo" ? "packages/api/src/adapters/storage" : "src/server/adapters/storage";
    return [
      ...storagePackage(mode),
      file(
        mode === "monorepo"
          ? "packages/database/src/schema/storage.ts"
          : "src/server/db/schema/storage.ts",
        postgresStorageSchemaContent(),
      ),
      file(`${adapterRoot}/postgres.ts`, postgresStorageAdapterContent(mode, messaging)),
    ];
  }
  return [
    file(
      mode === "monorepo"
        ? "packages/api/src/adapters/storage/convex.ts"
        : "src/server/adapters/storage/convex.ts",
      convexStorageAdapterContent(mode),
    ),
    file("convex/schema/storage.ts", convexStorageSchemaContent()),
    // Convex deploys a separate module graph, so mirror the application-owned
    // policy from the same renderer rather than maintaining adapter literals.
    file("convex/storagePolicy.ts", storageQuotaPolicyContent()),
    file("convex/storage.ts", convexStorageFunctionsContent()),
    file("convex/storageInternal.ts", convexStorageInternalContent(messaging)),
  ];
}

export const STORAGE_ADAPTER_ENV = Object.freeze({
  STORAGE_DRIVER: "local or s3; Postgres/server-host path only",
  STORAGE_BUCKET: "required for s3; keep REPLACE_WITH placeholder until configured",
  S3_REGION: "defaults to us-east-1",
  S3_ACCESS_KEY_ID: "optional server credential",
  S3_SECRET_ACCESS_KEY: "optional server credential; configure together with access key",
  S3_ENDPOINT: "optional HTTPS-compatible S3 endpoint",
});

export interface StorageAdapterIntegrationGuide {
  selection: readonly string[];
  validation: string;
  composerCall: string;
  convexSchemaImport: string | null;
  convexSchemaSpread: string | null;
  convexCronLine: string | null;
  schemaBarrelLine: string | null;
  compositionImport: string;
  dependencies: Readonly<Record<string, string>>;
  environment: typeof STORAGE_ADAPTER_ENV;
}

export function storageAdapterIntegrationGuide({
  mode,
  database,
}: StorageAdapterRenderOptions): StorageAdapterIntegrationGuide {
  return {
    selection: [
      'add "storage" to optionalAddons and AddonKey coverage',
      'resolve hasStorage = config.storage === true || hasAddon(addonMap, "storage") || hasMessaging',
      "pass hasStorage independently through generation-plan capability paths",
    ],
    validation:
      "Standalone storage requires auth, typed API, a server-capable web app, and database !== none.",
    composerCall: `files.push(...storageAdapterFiles({ mode: "${mode}", database: "${database}" }));`,
    convexSchemaImport:
      database === "convex" ? 'import { storageTables } from "./schema/storage";' : null,
    convexSchemaSpread: database === "convex" ? "...storageTables," : null,
    convexCronLine:
      database === "convex"
        ? 'crons.interval("cleanup pending uploads", { minutes: 15 }, internal.storageInternal.cleanupExpiredUploads, { limit: 500 });\ncrons.interval("stage managed storage orphans", { minutes: 5 }, internal.storageInternal.stageManagedOrphanPage, { limit: 50 });\ncrons.interval("cleanup managed storage blobs", { minutes: 5 }, internal.storageInternal.cleanupManagedBlobBatch, { limit: 25 });'
        : null,
    schemaBarrelLine:
      database === "postgres"
        ? 'export { storedObjects, storageBlobCleanupQueue } from "./storage";'
        : null,
    compositionImport:
      database === "postgres"
        ? mode === "monorepo"
          ? 'import { postgresOwnedStorageAdapter } from "../adapters/storage/postgres";'
          : 'import { postgresOwnedStorageAdapter } from "@/server/adapters/storage/postgres";'
        : "Use authenticated convex/storage.ts functions; they derive ownerId with requireActor.",
    dependencies:
      database === "postgres" && mode === "monorepo"
        ? {
            "@aws-sdk/client-s3": `^${v.storage["@aws-sdk/client-s3"]}`,
            "@repo/config": "workspace:*",
            "@repo/database": "workspace:*",
            "@repo/storage": "workspace:*",
            "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          }
        : database === "postgres"
          ? {
              "@aws-sdk/client-s3": `^${v.storage["@aws-sdk/client-s3"]}`,
              "drizzle-orm": `^${v.database["drizzle-orm"]}`,
            }
          : { convex: `^${v.convex.convex}` },
    environment: STORAGE_ADAPTER_ENV,
  };
}
