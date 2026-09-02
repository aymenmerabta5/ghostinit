// @allow-long 345: one configuration-aware agent-document template keeps every conditional claim in one audited place
import * as v from "../../versions.js";
import type { TemplateFile } from "../../shared.js";
import { file } from "../../shared.js";
import type {
  AppName,
  BillingProviderName,
  DatabaseProvider,
  FrameworkName,
} from "../../../lib/addons.js";

export interface MonorepoAgentDocsOptions {
  readonly runtime?: "bun" | "node";
  readonly database?: DatabaseProvider;
  readonly apps?: readonly AppName[];
  readonly auth?: boolean;
  readonly api?: boolean;
  readonly analytics?: boolean;
  readonly messaging?: boolean;
  readonly storage?: boolean;
  readonly notifications?: boolean;
  readonly featureFlags?: boolean;
  readonly jobs?: boolean;
  readonly jobsApi?: boolean;
  readonly pdf?: boolean;
  readonly cache?: boolean;
}

function enabledCapabilities(
  selectedBilling: readonly BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  hasEmail: boolean,
  options: MonorepoAgentDocsOptions,
): string[] {
  return [
    options.auth === true ? "auth" : undefined,
    options.api === true ? "typed-api" : undefined,
    selectedBilling.length > 0 ? "billing" : undefined,
    hasEmail ? "email" : undefined,
    options.analytics === true ? "analytics" : undefined,
    hasI18n ? "i18n" : undefined,
    hasEve ? "eve" : undefined,
    options.messaging === true ? "messaging" : undefined,
    options.storage === true ? "storage" : undefined,
    options.notifications === true ? "notifications" : undefined,
    options.featureFlags === true ? "feature-flags" : undefined,
    options.jobs === true ? "jobs" : undefined,
    options.pdf === true ? "pdf" : undefined,
    options.cache === true ? "cache" : undefined,
  ].filter((name): name is string => name !== undefined);
}

function databaseDescription(database: DatabaseProvider): string {
  if (database === "convex") return "Convex, with generated functions in `convex/`";
  if (database === "none") return "none, with the typed disabled database package only";
  return "PostgreSQL through Drizzle in `packages/database`";
}

function buildAgentsMdContent(
  projectName: string,
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  framework: FrameworkName = "nextjs",
  hasEmail = true,
  options: MonorepoAgentDocsOptions = {},
): string {
  const runtime = options.runtime ?? "bun";
  const database = options.database ?? "postgres";
  const apps = options.apps?.length ? [...options.apps] : (["web"] as AppName[]);
  const hasWeb = apps.includes("web");
  const usesProductionSupervisor =
    hasWeb && database === "postgres" && (options.jobs === true || options.storage === true);
  const hasAuth = options.auth ?? true;
  const hasApi = options.api ?? true;
  const hasAdmin = hasWeb && hasAuth && hasApi && database !== "none";
  const capabilities = enabledCapabilities(selectedBilling, hasEve, hasI18n && hasWeb, hasEmail, {
    ...options,
    jobs: options.jobs === true && database !== "none",
  });
  const isTanstack = framework === "tanstack-start";
  const usesCustomNextServer =
    hasWeb && !isTanstack && database === "postgres" && options.messaging === true;
  const nextDevCommand = usesCustomNextServer
    ? runtime === "bun"
      ? "bun --conditions=react-server server.ts"
      : "node --import ../../scripts/typescript-runtime-loader.mjs --conditions=react-server --experimental-strip-types server.ts"
    : runtime === "bun"
      ? "bun ./node_modules/next/dist/bin/next dev"
      : "next dev";
  const typescriptSummary =
    hasWeb && !isTanstack
      ? `${v.typescript.typescriptNext} in apps/web via Next's project-local tsc CLI; TypeScript ${v.typescript.typescript} for shared compiler-API tooling`
      : v.typescript.typescript;
  const frameworkLabel = isTanstack
    ? `TanStack Start ${v.tanstackStart["@tanstack/react-start"]}`
    : `Next.js ${v.nextStack.next}`;
  const webRoot = "apps/web/src";
  const routeRoot = isTanstack ? `${webRoot}/routes` : `${webRoot}/app`;
  const rpcRoute = isTanstack
    ? `${routeRoot}/api/rpc/$splat.ts`
    : `${routeRoot}/api/rpc/[...path]/route.ts`;
  const authRoute = isTanstack
    ? `${routeRoot}/api/auth/$splat.ts`
    : `${routeRoot}/api/auth/[...all]/route.ts`;
  const publicPrefix = isTanstack ? "VITE_" : "NEXT_PUBLIC_";
  const clientPrefixes = [
    ...(hasWeb ? [publicPrefix] : []),
    ...(apps.includes("mobile") ? ["EXPO_PUBLIC_"] : []),
    ...(apps.includes("desktop") ? ["VITE_", "DESKTOP_"] : []),
  ];

  const lines: string[] = [
    `# AGENTS.md — ${projectName}`,
    "",
    "> Generated for this exact GhostInit configuration. Do not add a package, route, or capability merely because another GhostInit variant has it.",
    "",
    "## Snapshot",
    "",
    "- Mode: monorepo with `apps/*`, `packages/*`, and `tooling/*` workspaces.",
    `- Package manager: Bun ${v.runtime.bun} (\`packageManager: bun@${v.runtime.bun}\`). Do not use npm, pnpm, or Yarn.`,
    `- Supply-chain delay: \`bunfig.toml\` rejects packages newer than ${v.supplyChain.minimumReleaseAgeSeconds} seconds and has no exclusions.`,
    `- Backend execution target: ${runtime === "bun" ? `Bun ${v.runtime.bun}` : `Node ${v.runtime.node}`}. Installation and repository scripts still use Bun.`,
    `- Frontend apps: ${apps.join(", ")}.`,
    `- Web framework: ${hasWeb ? frameworkLabel : "not emitted because the web app is disabled"}.`,
    `- Database: ${databaseDescription(database)}.`,
    `- TypeScript: ${typescriptSummary}. React: ${v.nextStack.react}.`,
    `- Enabled capabilities: ${capabilities.length > 0 ? capabilities.join(", ") : "foundation only"}.`,
    `- Billing providers: ${selectedBilling.length > 0 ? selectedBilling.join(", ") : hasWeb && hasAuth ? "none; the web billing UI is an empty state and provider adapters/webhooks are absent" : "none; billing UI, provider adapters, and webhooks are absent"}.`,
    "",
    "## Architecture",
    "",
    "Keep the dependency direction: presentation -> typed transport/contracts -> application services -> domain and application-owned ports -> adapters -> supporting infrastructure.",
    "",
    "- `packages/services` owns application policies and ports. Transport handlers call services; they do not reimplement business rules.",
    "- `packages/modules` owns domain/application modules. Provider SDKs stay in adapters or provider packages.",
    "- `packages/config`, `packages/contracts`, `packages/kernel`, `packages/observability`, and `packages/database` are supporting packages.",
    "- Import public package entry points. Do not reach into another package's private source path.",
    "",
    "## Package Roles",
    "",
  ];

  if (hasWeb) {
    lines.push(
      `- \`apps/web\`: ${frameworkLabel} presentation and transport; routes live in \`${routeRoot}/\`.`,
    );
  }
  if (apps.includes("mobile")) lines.push("- `apps/mobile`: Expo mobile client.");
  if (apps.includes("desktop")) lines.push("- `apps/desktop`: desktop client.");
  if (hasEve) lines.push("- `apps/eve`: generated Eve durable-agent application.");
  if (hasApi)
    lines.push("- `packages/api`: oRPC contracts, procedures, composition, and adapters.");
  if (hasAuth) lines.push("- `packages/auth`: Better Auth server and client boundary.");
  if (selectedBilling.length > 0) {
    lines.push(
      "- `packages/billing`: application-owned billing port plus selected provider adapters.",
    );
  }
  if (hasEmail) {
    lines.push(
      "- `packages/email`: `@repo/email/templates` (with `@repo/email` as its compatibility alias) is the environment-neutral React template surface; `@repo/email/server` is the guarded delivery boundary.",
    );
  }
  lines.push(
    "- `packages/services`: capability use cases and ports.",
    "- `packages/ui`: shared design tokens, contracts, and utilities; web primitives stay app-local.",
    "- `packages/database`: selected database adapter or the explicit disabled stub.",
    "- `packages/modules`, `packages/testing`, `packages/workflows`, and `packages/typescript-config`: shared domain and tooling foundations.",
    "- `tooling/architecture`: generated import-boundary policy and checker configuration.",
  );
  if (options.analytics) lines.push("- `packages/analytics`: analytics contracts and adapters.");
  if (options.cache) lines.push("- `packages/cache`: selected cache adapter.");
  if (options.pdf) lines.push("- `packages/pdf`: PDF capability boundary.");
  if (options.messaging && database === "postgres") {
    lines.push("- `packages/realtime`: PostgreSQL-backed realtime transport.");
  }
  if (options.storage && database === "postgres") {
    lines.push("- `packages/storage`: local/S3 blob-storage implementation for this composition.");
  }

  if (hasWeb) {
    lines.push("", `## ${frameworkLabel} Routes`, "");
    if (isTanstack) {
      lines.push(
        `- File routes live under \`${routeRoot}/\`; \`routeTree.gen.ts\` is generated by the router tooling.`,
        "- Use TanStack Router navigation and route context. Server handlers receive `{ request }: { request: Request }`.",
        "- `bun run typecheck` runs route generation before TypeScript through the workspace script.",
      );
    } else {
      lines.push(
        `- App Router files live under \`${routeRoot}/\`.`,
        "- Use server/client component boundaries deliberately; route handlers use the Web `Request` API.",
      );
    }
    if (hasApi) lines.push(`- oRPC transport: \`${rpcRoute}\`.`);
    else lines.push("- The typed API capability is disabled; no oRPC transport route is emitted.");
    if (hasAuth && hasApi) lines.push(`- Auth transport: \`${authRoute}\`.`);
    if (hasAdmin) {
      lines.push(
        isTanstack
          ? `- Admin routes: \`${routeRoot}/admin.tsx\`, \`${routeRoot}/admin.users.tsx\`, and \`${routeRoot}/admin.users.create.tsx\`.`
          : `- Admin routes: \`${routeRoot}/admin/page.tsx\`, \`${routeRoot}/admin/users/page.tsx\`, and \`${routeRoot}/admin/users/create/page.tsx\`, protected by the generated admin guard.`,
      );
    }
    if (selectedBilling.length > 0) {
      const providerPattern = isTanstack
        ? `${routeRoot}/api/webhooks/<provider>.ts`
        : `${routeRoot}/api/webhooks/<provider>/route.ts`;
      lines.push(
        `- Selected-provider webhook routes follow \`${providerPattern}\` and consume bounded raw request bodies.`,
      );
    }
    lines.push(
      isTanstack
        ? `- \`apps/web\` scripts use \`vite dev --port 3000\`, \`vite build\`, \`${runtime === "bun" ? "bun" : "node"} .output/server/index.mjs\`, and \`tsr generate && tsc --noEmit\`.`
        : `- \`apps/web\` development runs \`${nextDevCommand}\`${usesCustomNextServer ? " so the generated oRPC WebSocket upgrade is available during ordinary development" : " through Next's stock development server"}. Build and package-local start remain \`${runtime === "bun" ? "bun ./node_modules/next/dist/bin/next build" : "next build"}\` and \`${runtime === "bun" ? "bun ./node_modules/next/dist/bin/next start" : "next start"}\`; repository-level \`bun run start\` owns any generated custom production server.`,
    );
  }

  lines.push("", "## Capability Rules", "");
  if (options.messaging) {
    lines.push(
      "- Messaging requires authenticated membership checks; storage is enabled for attachments.",
    );
  }
  if (options.notifications) {
    lines.push(
      "- Notifications use application-owned ports; provider tokens remain encrypted at rest.",
    );
  }
  if (options.featureFlags) {
    lines.push("- Feature flags fail closed through the generated service and adapter boundary.");
  }
  if (options.jobs && database !== "none") {
    lines.push(
      `- Jobs provide worker/scheduler scripts${options.jobsApi ? " and an authenticated user-facing API" : "; no user-facing jobs API was selected"}.`,
    );
  }
  if (hasI18n && hasWeb) {
    lines.push(
      isTanstack
        ? "- i18n uses the generated EN/FR/AR provider, locale cookie, and document lang/dir synchronization."
        : "- i18n uses the generated next-intl request/config/navigation boundary with non-prefixed application routes.",
    );
  }
  if (hasEve) {
    lines.push(
      isTanstack || !hasWeb
        ? "- Eve is emitted as `apps/eve`; do not assume a web-framework mounting adapter that was not generated."
        : '- Eve is emitted as `apps/eve` and mounted by the web configuration with `eveRoot: "../eve"`.',
    );
    if (!isTanstack && hasWeb) {
      lines.push(
        "- Next/withEve owns integrated dev and start. Use `bun run eve:dev` or `bun run eve:start` only as standalone diagnostics, never beside the web lifecycle.",
        "- Outside Vercel, `bun run build` finishes Eve before Next. On Vercel, withEve owns the generated Eve service build.",
        "- Self-hosting must follow `docs/EVE_SELF_HOSTING.md`, including persistent Workflow state and both proxy route families for a separate Eve service.",
      );
    }
  }
  if (selectedBilling.length === 0) {
    lines.push(
      "- Billing is not configured. Keep vendor credentials, provider SDKs, and webhook routes absent.",
    );
  }
  if (database === "convex") {
    lines.push(
      "- Database scripts are `bun run convex:dev`, `bun run convex:deploy`, and `bun run convex:codegen`.",
    );
  } else if (database === "postgres") {
    lines.push(
      "- Database scripts are `bun run db:generate`, `bun run db:migrate`, and `bun run db:push`.",
    );
  }

  lines.push(
    "",
    "## Frontend Conventions",
    "",
    ...(hasWeb
      ? [
          "- Reuse `apps/web/src/components/ui` primitives and `packages/ui` semantic design tokens before creating a new primitive.",
          `- Run shadcn from the web app with the exact catalog pin: \`cd apps/web && bunx --bun shadcn@${v.ui.shadcn} add <component>\`. Never use floating tags or another package runner.`,
        ]
      : [
          "- Reuse the selected app's local UI primitives and `packages/ui` semantic design tokens.",
        ]),
    ...(hasWeb
      ? [
          "- Use TanStack Query for remote state and TanStack Form for interactive forms; keep pending and error states explicit.",
        ]
      : []),
    "- Preserve logical CSS properties, keyboard access, visible focus, reduced-motion behavior, and EN/FR/AR layout safety.",
    "- Split large components by responsibility. The 300-line policy is a review guideline, not a claim that every generated file is below a fixed maximum.",
    "",
    "## Quality Gates",
    "",
    "Run from the repository root with Bun:",
    "",
    "```bash",
    "bun install",
    "bun run dev",
    "bun run typecheck",
    "bun run lint",
    "bun run format:check",
    "bun run test",
    "bun run build",
    usesProductionSupervisor ? "bun run start:production" : "bun run start",
    "ghostinit check",
    "```",
    "",
    usesProductionSupervisor
      ? "`bun run start` starts only the web process. Use `bun run start:production` to supervise the web process and selected PostgreSQL workers; Fly runs them as separate process groups."
      : "Use `bun run start` for the generated production web process; do not replace it with an npm command.",
    "",
    "## Security",
    "",
    "- Never commit `.env` or `.env.local`. Vendor credentials remain `REPLACE_WITH_*` until supplied by the operator.",
    `- Client-visible variables use only these generated prefixes: ${clientPrefixes.map((prefix) => `\`${prefix}\``).join(", ") || "none"}. Keep all other credentials server-only.`,
    "- Preserve raw-body verification, deterministic webhook idempotency, actor-derived resource ownership, auth guards, and secret-safe logging.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

export function agentsComposerFiles(
  projectName: string,
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  framework: FrameworkName = "nextjs",
  hasEmail = true,
  options: MonorepoAgentDocsOptions = {},
): TemplateFile[] {
  const content = buildAgentsMdContent(
    projectName,
    selectedBilling,
    hasEve,
    hasI18n,
    framework,
    hasEmail,
    options,
  );
  const agents = file("AGENTS.md", content);
  const claude = file("CLAUDE.md", content);
  const cursor = file(
    ".cursor/rules/ghostinit.mdc",
    [
      "---",
      `description: GhostInit monorepo (${framework}) generated-project rules`,
      "globs:",
      '  - "**/*"',
      "alwaysApply: true",
      "---",
      "",
      content,
    ].join("\n"),
  );
  const windsurf = file(".windsurf/rules/ghostinit.md", content);
  return [agents, claude, cursor, windsurf];
}

export { buildAgentsMdContent };
