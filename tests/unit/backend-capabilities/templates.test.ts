import { describe, expect, test } from "bun:test";
import {
  featureFlagsApiFiles,
  featureFlagsApiIntegrationGuide,
} from "../../../src/templates/api/feature-flags/index.js";
import { jobsApiFiles, jobsApiIntegrationGuide } from "../../../src/templates/api/jobs/index.js";
import {
  notificationsApiFiles,
  notificationsApiIntegrationGuide,
} from "../../../src/templates/api/notifications/index.js";
import {
  FEATURE_FLAGS_CAPABILITY_FRAGMENT,
  featureFlagsServiceFiles,
  featureFlagsServiceIntegrationGuide,
} from "../../../src/templates/services/feature-flags/index.js";
import {
  JOBS_CAPABILITY_FRAGMENT,
  jobsServiceFiles,
  jobsServiceIntegrationGuide,
} from "../../../src/templates/services/jobs/index.js";
import {
  NOTIFICATIONS_CAPABILITY_FRAGMENT,
  notificationsServiceFiles,
  notificationsServiceIntegrationGuide,
} from "../../../src/templates/services/notifications/index.js";

const serviceRenderers = [
  notificationsServiceFiles,
  featureFlagsServiceFiles,
  jobsServiceFiles,
] as const;
const apiRenderers = [notificationsApiFiles, featureFlagsApiFiles, jobsApiFiles] as const;

describe("auxiliary backend capability templates", () => {
  test("renders path-isomorphic single and monorepo services", () => {
    for (const render of serviceRenderers) {
      const monorepo = render("monorepo");
      const single = render("single");
      expect(monorepo.map(({ path }) => path.split("/").at(-1))).toEqual(
        single.map(({ path }) => path.split("/").at(-1)),
      );
      expect(monorepo.every(({ path }) => path.startsWith("packages/services/src/"))).toBe(true);
      expect(single.every(({ path }) => path.startsWith("src/server/services/"))).toBe(true);
    }
  });

  test("keeps application services independent of vendors and databases", () => {
    const content = serviceRenderers
      .flatMap((render) => render("monorepo"))
      .map(({ content }) => content)
      .join("\n");

    for (const forbidden of [
      "@repo/database",
      "drizzle-orm",
      "convex/server",
      "better-auth",
      "stripe",
      "posthog",
      "launchdarkly",
    ]) {
      expect(content).not.toContain(forbidden);
    }
    expect(content).toContain("interface PostgresJobsAdapter");
    expect(content).toContain("interface ConvexJobsAdapter");
    expect(content).toContain("JobsAdapterParity");
  });

  test("declares closed requirements and acceptance operation IDs", () => {
    expect(NOTIFICATIONS_CAPABILITY_FRAGMENT.requirements.map(({ kind }) => kind)).toEqual([
      "capability",
      "capability",
      "backend",
      "persistence",
      "target-binding",
    ]);
    expect(FEATURE_FLAGS_CAPABILITY_FRAGMENT.acceptanceOperationIds).toContain(
      "feature-flags.never-authorizes",
    );
    expect(FEATURE_FLAGS_CAPABILITY_FRAGMENT.acceptanceOperationIds).toContain(
      "feature-flags.static-config-separated",
    );
    expect(JOBS_CAPABILITY_FRAGMENT.acceptanceOperationIds).toEqual(
      expect.arrayContaining([
        "jobs.runs.enqueue-idempotent",
        "jobs.workers.claim-exclusive",
        "jobs.workers.heartbeat-lease",
        "jobs.workers.recover-expired-lease",
        "jobs.adapters.postgres-convex-parity",
      ]),
    );
  });

  test("encodes ownership, no-fallback flags, and compare-and-set lease semantics", () => {
    const notifications = notificationsServiceFiles("monorepo")
      .map(({ content }) => content)
      .join("\n");
    const flags = featureFlagsServiceFiles("monorepo")
      .map(({ content }) => content)
      .join("\n");
    const jobs = jobsServiceFiles("monorepo")
      .map(({ content }) => content)
      .join("\n");

    expect(notifications).toContain("markReadOwned");
    expect(notifications).toContain("owned-by-other-actor");
    expect(flags).toContain("FEATURE_FLAGS_ARE_NOT_AUTHORIZATION");
    expect(flags).toContain("FEATURE_FLAG_PROVIDER_UNAVAILABLE");
    expect(flags).not.toContain("fallbackValue");
    expect(jobs).toContain("createScheduledRunIdempotencyKey");
    expect(jobs).toContain("expectedLeaseToken");
    expect(jobs).toContain("expectedLeaseExpiresAt");
    expect(jobs).toContain("calculateJobRetryDelayMs");
  });

  test("renders typed public APIs without exposing worker lease tokens", () => {
    const jobApi = jobsApiFiles("monorepo");
    const jobContract = jobApi.find(({ path }) => path.endsWith("/contract.ts"))?.content ?? "";
    const jobDto = jobApi.find(({ path }) => path.endsWith("/dto.ts"))?.content ?? "";
    expect(jobContract).toContain("enqueue:");
    expect(jobContract).toContain("cancelRun:");
    expect(jobContract).not.toContain("heartbeat");
    expect(jobDto).not.toContain("value.lease.token");

    const flagContract =
      featureFlagsApiFiles("monorepo").find(({ path }) => path.endsWith("/contract.ts"))?.content ??
      "";
    expect(flagContract).toContain("never authorization decisions");
  });

  test("all rendered TypeScript parses", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const render of [...serviceRenderers, ...apiRenderers]) {
      for (const entry of render("monorepo")) {
        expect(() => transpiler.transformSync(entry.content), entry.path).not.toThrow();
      }
    }
  });

  test("publishes exact non-invasive integration edits", () => {
    expect(notificationsServiceIntegrationGuide("monorepo").packageExport).toEqual({
      "./notifications": "./src/notifications/index.ts",
    });
    expect(featureFlagsServiceIntegrationGuide("monorepo").serviceBarrelLine).toBe(
      'export * as featureFlags from "./feature-flags/index.js";',
    );
    expect(jobsServiceIntegrationGuide("monorepo").compositionInstruction).toContain(
      "compare-and-set",
    );
    expect(notificationsApiIntegrationGuide("monorepo").contractEntry).toBe(
      "notifications: notificationsContract,",
    );
    expect(featureFlagsApiIntegrationGuide("monorepo").contextField).toContain(
      "FeatureFlagSubject",
    );
    expect(jobsApiIntegrationGuide("monorepo").workerInstruction).toContain(
      "intentionally not public",
    );
  });
});
