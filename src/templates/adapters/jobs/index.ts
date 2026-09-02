import type { DatabaseProvider, ProjectMode } from "../../../lib/addons.js";
import {
  codeScripts,
  file,
  packageJson,
  tsconfig,
  type TemplateFile,
  type TemplateRuntime,
} from "../../shared.js";
import * as v from "../../versions.js";
import { convexJobActionContent } from "./convex-action.js";
import { convexJobsRequestAdapterContent } from "./convex-client.js";
import { convexJobCronsContent } from "./convex-crons.js";
import { convexJobsInternalContent } from "./convex-internal.js";
import { convexJobsPublicContent } from "./convex-public.js";
import { postgresJobsMappersContent } from "./postgres-mappers.js";
import { postgresJobsAdapterContent } from "./postgres.js";
import { jobHandlerRegistryContent } from "./registry.js";
import { jobProcessLifecycleContent } from "./lifecycle.js";
import { jobScheduleCalculatorContent } from "./schedule-calculator.js";
import { postgresJobSchedulerContent } from "./scheduler.js";
import { convexJobsSchemaContent, postgresJobsSchemaContent } from "./schema.js";
import {
  nodeTypeScriptWorkerLoaderContent,
  startPostgresJobsSupervisorContent,
} from "./scripts.js";
import { postgresJobWorkerContent } from "./worker.js";

export interface JobsAdapterRenderOptions {
  mode: ProjectMode;
  database: Exclude<DatabaseProvider, "none">;
  runtime?: TemplateRuntime;
  userFacingApi?: boolean;
}

function adapterRoot(mode: ProjectMode, userFacingApi: boolean): string {
  if (mode === "single") return "src/server/adapters/jobs";
  return userFacingApi
    ? "packages/api/src/adapters/jobs"
    : "packages/jobs-runtime/src/adapters/jobs";
}

function workerRoot(mode: ProjectMode, userFacingApi: boolean): string {
  if (mode === "single") return "src/server/workers/jobs";
  return userFacingApi ? "packages/api/src/workers/jobs" : "packages/jobs-runtime/src/workers/jobs";
}

function internalJobsRuntimePackage(): TemplateFile[] {
  return [
    file(
      "packages/jobs-runtime/package.json",
      packageJson({
        name: "@repo/jobs-runtime",
        private: true,
        type: "module",
        scripts: codeScripts(),
        dependencies: {
          "@repo/database": "workspace:*",
          "@repo/services": "workspace:*",
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          "server-only": `^${v.runtime["server-only"]}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/jobs-runtime/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          outDir: "./dist",
          rootDir: "./src",
          declaration: true,
        },
      }),
    ),
  ];
}

export function jobsAdapterFiles(options: JobsAdapterRenderOptions): TemplateFile[] {
  const { mode, database } = options;
  const userFacingApi = options.userFacingApi ?? true;
  const adapters = adapterRoot(mode, userFacingApi);
  if (database === "convex") {
    return [
      file("convex/schema/jobs.ts", convexJobsSchemaContent(userFacingApi)),
      ...(userFacingApi ? [file("convex/jobs.ts", convexJobsPublicContent())] : []),
      file("convex/jobsInternal.ts", convexJobsInternalContent()),
      file("convex/jobActions.ts", convexJobActionContent()),
      file("convex/crons.ts", convexJobCronsContent()),
      ...(userFacingApi
        ? [file(`${adapters}/convex-client.ts`, convexJobsRequestAdapterContent(mode))]
        : []),
    ];
  }
  const workers = workerRoot(mode, userFacingApi);
  return [
    ...(mode === "monorepo" && !userFacingApi ? internalJobsRuntimePackage() : []),
    file(
      mode === "monorepo" ? "packages/database/src/schema/jobs.ts" : "src/server/db/schema/jobs.ts",
      postgresJobsSchemaContent(userFacingApi),
    ),
    file(`${adapters}/postgres-mappers.ts`, postgresJobsMappersContent(mode)),
    file(`${adapters}/postgres.ts`, postgresJobsAdapterContent(mode)),
    file(`${adapters}/schedule-calculator.ts`, jobScheduleCalculatorContent(mode)),
    file(`${workers}/lifecycle.ts`, jobProcessLifecycleContent()),
    file(`${workers}/registry.ts`, jobHandlerRegistryContent()),
    file(`${workers}/worker.ts`, postgresJobWorkerContent(mode)),
    file(`${workers}/scheduler.ts`, postgresJobSchedulerContent(mode)),
    file("scripts/typescript-worker-loader.mjs", nodeTypeScriptWorkerLoaderContent()),
    file("scripts/start-jobs.mjs", startPostgresJobsSupervisorContent(mode, userFacingApi)),
  ];
}

export const JOBS_ADAPTER_ENV = Object.freeze({
  JOB_WORKER_ID: {
    exampleLine: "JOB_WORKER_ID=",
    serverSchemaLine: "JOB_WORKER_ID: z.string().min(1).optional()",
    runtimeLine: "JOB_WORKER_ID: process.env.JOB_WORKER_ID",
    turboGlobalEnv: "JOB_WORKER_ID",
  },
  JOB_WORKER_POLL_MS: {
    exampleLine: "JOB_WORKER_POLL_MS=1000",
    serverSchemaLine:
      "JOB_WORKER_POLL_MS: z.coerce.number().int().min(250).max(60000).default(1000)",
    runtimeLine: "JOB_WORKER_POLL_MS: process.env.JOB_WORKER_POLL_MS",
    turboGlobalEnv: "JOB_WORKER_POLL_MS",
  },
  JOB_HEARTBEAT_MS: {
    exampleLine: "JOB_HEARTBEAT_MS=10000",
    serverSchemaLine:
      "JOB_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(60000).default(10000)",
    runtimeLine: "JOB_HEARTBEAT_MS: process.env.JOB_HEARTBEAT_MS",
    turboGlobalEnv: "JOB_HEARTBEAT_MS",
  },
  JOB_LEASE_MS: {
    exampleLine: "JOB_LEASE_MS=30000",
    serverSchemaLine: "JOB_LEASE_MS: z.coerce.number().int().min(3000).max(900000).default(30000)",
    runtimeLine: "JOB_LEASE_MS: process.env.JOB_LEASE_MS",
    turboGlobalEnv: "JOB_LEASE_MS",
    crossFieldPolicy: "must be greater than two times JOB_HEARTBEAT_MS",
  },
  JOB_SCHEDULER_TICK_MS: {
    exampleLine: "JOB_SCHEDULER_TICK_MS=30000",
    serverSchemaLine:
      "JOB_SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).max(300000).default(30000)",
    runtimeLine: "JOB_SCHEDULER_TICK_MS: process.env.JOB_SCHEDULER_TICK_MS",
    turboGlobalEnv: "JOB_SCHEDULER_TICK_MS",
  },
});

export interface JobsAdapterIntegrationGuide {
  schemaBarrelLine: string | null;
  convexSchemaImport: string | null;
  convexSchemaSpread: string | null;
  compositionImport: string;
  packageScripts: Readonly<Record<string, string>>;
  apiDependencies: Readonly<Record<string, string>>;
  deploymentInstruction: string;
  resultInstruction: string;
}

export function jobsAdapterIntegrationGuide({
  mode,
  database,
  runtime = "bun",
  userFacingApi = true,
}: JobsAdapterRenderOptions): JobsAdapterIntegrationGuide {
  const runner =
    runtime === "bun"
      ? "bun --conditions=react-server"
      : "node --import ./scripts/typescript-worker-loader.mjs --conditions=react-server --experimental-strip-types";
  const base =
    mode === "monorepo"
      ? userFacingApi
        ? "packages/api/src"
        : "packages/jobs-runtime/src"
      : "src/server";
  return {
    schemaBarrelLine:
      database === "postgres"
        ? 'export { jobDefinitions, jobRunEvents, jobRuns, jobRunState, jobSchedules } from "./jobs";'
        : null,
    convexSchemaImport: database === "convex" ? 'import { jobTables } from "./schema/jobs";' : null,
    convexSchemaSpread: database === "convex" ? "...jobTables," : null,
    compositionImport:
      database === "postgres"
        ? mode === "monorepo"
          ? 'import { postgresJobsAdapter } from "../adapters/jobs/postgres";'
          : 'import { postgresJobsAdapter } from "@/server/adapters/jobs/postgres";'
        : mode === "monorepo"
          ? 'import { createConvexJobsRequestAdapter } from "../adapters/jobs/convex-client";'
          : 'import { createConvexJobsRequestAdapter } from "@/server/adapters/jobs/convex-client";',
    packageScripts:
      database === "postgres"
        ? {
            "jobs:worker": `${runner} ${base}/workers/jobs/worker.ts`,
            "jobs:scheduler": `${runner} ${base}/workers/jobs/scheduler.ts`,
            "jobs:start": `bun scripts/start-jobs.mjs --runtime=${runtime}`,
          }
        : { "jobs:deploy": "bun x --no-install convex deploy" },
    apiDependencies:
      database === "postgres"
        ? {
            "@repo/database": "workspace:*",
            "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          }
        : {},
    deploymentInstruction:
      database === "postgres"
        ? "Run jobs:start as a persistent process; deploy worker and scheduler together with the web release."
        : "Run jobs:deploy; convex/crons.ts is registered by convex deploy and invokes only internal mutations/actions.",
    resultInstruction:
      database === "postgres"
        ? "Expose postgresJobsAdapter.getOwnedResult only through an actor-owned service query."
        : "Use the authenticated convex/jobs.result query; it derives ownership from requireActor.",
  };
}
