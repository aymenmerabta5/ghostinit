// @allow-long 430: central single-mode capability composition keeps canonical API renderers and request adapters together
import type { ProjectMode } from "../../../../lib/addons.js";
import { file, type TemplateFile } from "../../../shared.js";
import { identityApiFiles } from "../../../api/identity/index.js";
import { notificationsApiFiles } from "../../../api/notifications/index.js";
import { featureFlagsApiFiles } from "../../../api/feature-flags/index.js";
import { jobsApiFiles } from "../../../api/jobs/index.js";
import { messagingApiFiles } from "../../../api/messaging.js";
import { storageApiFiles } from "../../../api/storage/index.js";
import type { SingleApiCapabilitySelection } from "./routes.js";

export type SingleCapabilityDatabase = "postgres" | "convex";

function featureFlagsCompositionContent(): string {
  return `import "server-only";
import { getFeatureFlag } from "@/server/analytics/posthog-server";
import {
  createFeatureFlagService,
  FeatureFlagError,
  type FeatureFlagProviderEvaluation,
  type RemoteFeatureFlagPort,
} from "@/server/services/feature-flags";

const provider: RemoteFeatureFlagPort = {
  async evaluateMany({ subject, keys }) {
    const values: FeatureFlagProviderEvaluation[] = [];
    for (const key of keys) {
      const value = await getFeatureFlag(key, subject.key, {
        personProperties: Object.fromEntries(
          Object.entries({ ...subject.attributes, subjectKind: subject.kind }).map(([name, entry]) => [name, String(entry)]),
        ),
      });
      if (value === undefined) {
        throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "Remote feature flags are unavailable");
      }
      values.push({
        key,
        value,
        variant: typeof value === "string" ? value : null,
        reason: value === false ? "disabled" : "targeting-match",
        version: null,
      });
    }
    return values;
  },
};

export function createFeatureFlagServiceForRequest() {
  return createFeatureFlagService({ provider });
}
`;
}

function jobsCompositionContent(): string {
  return `import "server-only";
import { randomUUID } from "node:crypto";
import {
  createJobsService,
  JobError,
  type JobPersistencePort,
} from "@/server/services/jobs";

function unavailableJobOperation(): never {
  throw new JobError(
    "JOB_PERSISTENCE_FAILED",
    "The selected database jobs adapter is not configured",
  );
}

const unavailablePersistence: JobPersistencePort = {
  async getDefinition() { return unavailableJobOperation(); },
  async getSchedule() { return unavailableJobOperation(); },
  async listDueSchedules() { return unavailableJobOperation(); },
  async advanceSchedule() { return unavailableJobOperation(); },
  async enqueueRun() { return unavailableJobOperation(); },
  async getOwnedRun() { return unavailableJobOperation(); },
  async requestCancellationOwned() { return unavailableJobOperation(); },
  async claimNextRun() { return unavailableJobOperation(); },
  async getLeasedRun() { return unavailableJobOperation(); },
  async heartbeatRun() { return unavailableJobOperation(); },
  async completeRun() { return unavailableJobOperation(); },
  async settleFailedRun() { return unavailableJobOperation(); },
  async acknowledgeCancellation() { return unavailableJobOperation(); },
  async listExpiredLeases() { return unavailableJobOperation(); },
  async recoverExpiredLease() { return unavailableJobOperation(); },
};

export function createJobsServiceForRequest() {
  return createJobsService({
    persistence: unavailablePersistence,
    scheduleCalculator: {
      nextAfter() {
        throw new JobError("JOB_SCHEDULE_CALCULATION_FAILED", "No schedule calculator is configured");
      },
    },
    leaseTokens: { create: randomUUID },
  });
}
`;
}

/** Adapt the secure Postgres renderer to the flat single-mode import graph. */
export function singleMessagingApiFiles(): TemplateFile[] {
  const databaseImport = `import {
  conversationParticipants,
  conversations,
  db,
  messageAttachments,
  messagingRealtimeOutbox,
  messages,
  sessions,
  users,
} from "@repo/database";`;
  const singleDatabaseImport = `import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema/auth";
import {
  conversationParticipants,
  conversations,
  messageAttachments,
  messagingRealtimeOutbox,
  messages,
} from "@/server/db/schema/messaging";`;
  const outboxDatabaseImport = 'import { db, messagingRealtimeOutbox } from "@repo/database";';
  const singleOutboxDatabaseImport = `import { db } from "@/server/db";
import { messagingRealtimeOutbox } from "@/server/db/schema/messaging";`;
  const ticketDatabaseImport = 'import { db, messagingWebsocketTickets } from "@repo/database";';
  const singleTicketDatabaseImport = `import { db } from "@/server/db";
import { messagingWebsocketTickets } from "@/server/db/schema/messaging";`;
  return messagingApiFiles().map((templateFile) => ({
    path: templateFile.path.replace(/^packages\/api\/src\//, "src/server/api/"),
    content: templateFile.content
      .replace(databaseImport, singleDatabaseImport)
      .replace(outboxDatabaseImport, singleOutboxDatabaseImport)
      .replace(ticketDatabaseImport, singleTicketDatabaseImport)
      .replaceAll('from "@repo/realtime"', 'from "@/server/realtime"')
      .replaceAll('from "@repo/storage"', 'from "@/server/storage"')
      .replace(
        'import { messaging } from "@repo/services";',
        'import * as messaging from "@/server/services/messaging";',
      )
      .replace(
        'import { messaging, storage } from "@repo/services";',
        'import * as messaging from "@/server/services/messaging";\nimport * as storage from "@/server/services/storage";',
      )
      .replaceAll("z.string().uuid()", "z.string().min(1)"),
  }));
}

export function singleCapabilityApiFiles(
  selection: SingleApiCapabilitySelection,
  _database: SingleCapabilityDatabase,
): TemplateFile[] {
  const mode: ProjectMode = "single";
  return [
    ...(selection.identity ? identityApiFiles(mode) : []),
    ...(selection.notifications ? notificationsApiFiles(mode) : []),
    ...(selection.featureFlags ? featureFlagsApiFiles(mode) : []),
    ...(selection.jobs ? jobsApiFiles(mode) : []),
    ...(selection.messaging ? singleMessagingApiFiles() : []),
    ...(selection.storage ? storageApiFiles(mode) : []),
    ...(selection.featureFlags
      ? [file("src/server/api/composition/feature-flags.ts", featureFlagsCompositionContent())]
      : []),
    ...(selection.jobs
      ? [file("src/server/api/composition/jobs.ts", jobsCompositionContent())]
      : []),
  ];
}
