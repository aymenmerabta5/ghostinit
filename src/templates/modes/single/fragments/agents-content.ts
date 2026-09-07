// @allow-long 325: single-mode target-aware agent guidance keeps conditional path claims in one audited template
import * as v from "../../../versions.js";
import { customNextServerCommand, nextRuntimeCommand } from "../../../root/next-server-runtime.js";
import type {
  AppName,
  BillingProviderName,
  DatabaseProvider,
  DeployTarget,
  FrameworkName,
} from "../../../../lib/addons.js";

export interface SingleAgentDocsOptions {
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
  readonly deploy?: DeployTarget;
}

function enabledCapabilities(
  selectedBilling: readonly BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  hasEmail: boolean,
  options: SingleAgentDocsOptions,
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
  ].filter((name): name is string => name !== undefined);
}

function databaseDescription(database: DatabaseProvider): string {
  if (database === "convex") return "Convex, with generated functions in `convex/`";
  if (database === "none") return "none, with the explicit disabled adapter in `src/server/db`";
  return "PostgreSQL through Drizzle in `src/server/db`";
}

export function buildAgentsMdContent(
  projectName: string,
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  hasEmail = true,
  framework: FrameworkName = "nextjs",
  options: SingleAgentDocsOptions = {},
): string {
  const runtime = options.runtime ?? "bun";
  const database = options.database ?? "postgres";
  const apps = options.apps?.length ? [...options.apps] : (["web"] as AppName[]);
  const hasWeb = apps.includes("web");
  const isCloudflare = options.deploy === "cloudflare";
  const isMobileOnly = apps.includes("mobile") && !hasWeb;
  const isDesktopOnly = apps.includes("desktop") && !hasWeb && !isMobileOnly;
  const isNativeOnly = isMobileOnly || isDesktopOnly;
  const usesProductionSupervisor =
    hasWeb && database === "postgres" && (options.jobs === true || options.storage === true);
  const hasAuth = options.auth ?? true;
  const hasApi = options.api ?? true;
  const hasLocalBackend = hasWeb;
  const documentedEmail = hasEmail && hasLocalBackend;
  const documentedEve = hasEve && hasLocalBackend;
  const hasAdmin = hasWeb && hasAuth && hasApi && database !== "none";
  const capabilities = enabledCapabilities(
    selectedBilling,
    documentedEve,
    hasI18n,
    documentedEmail,
    hasLocalBackend
      ? { ...options, jobs: options.jobs === true && database !== "none" }
      : { auth: options.auth },
  );
  const isTanstack = framework === "tanstack-start";
  const usesCustomNextServer =
    hasWeb && !isTanstack && database === "postgres" && options.messaging === true;
  const nextDevCommand = documentedEve
    ? "bun scripts/start-development.mjs"
    : usesCustomNextServer
      ? customNextServerCommand(runtime, "dev")
      : nextRuntimeCommand(runtime, "dev", options.pdf);
  const typescriptVersion =
    hasWeb && !isTanstack ? v.typescript.typescriptNext : v.typescript.typescript;
  const nextBuildCommand = `${usesCustomNextServer ? "bun run build:server && " : ""}${nextRuntimeCommand(runtime, "build", options.pdf)}`;
  const frameworkLabel = isTanstack
    ? `TanStack Start ${v.tanstackStart["@tanstack/react-start"]}`
    : `Next.js ${v.nextStack.next}`;
  const routeRoot = isTanstack ? "src/routes" : "src/app";
  const rpcRoute = isTanstack
    ? `${routeRoot}/api/rpc/$.ts`
    : `${routeRoot}/api/rpc/[...path]/route.ts`;
  const authRoute = isTanstack
    ? `${routeRoot}/api/auth/$.ts`
    : `${routeRoot}/api/auth/[...all]/route.ts`;
  const publicPrefix = isTanstack ? "VITE_" : "NEXT_PUBLIC_";
  const clientPrefixes = [
    ...(hasWeb ? [publicPrefix] : []),
    ...(apps.includes("mobile") ? ["EXPO_PUBLIC_"] : []),
    ...(apps.includes("desktop") ? ["VITE_", "DESKTOP_"] : []),
  ];
  const qualityCommands = [
    "bun run install:verified # use bun run install:bootstrap only for fresh --no-install output",
    "bun run dev",
    "bun run typecheck",
    "bun run lint",
  ];
  if (!isDesktopOnly) qualityCommands.push("bun run format:check", "bun run test");
  qualityCommands.push(isCloudflare ? "bun run build:worker" : "bun run build");
  if (isCloudflare) qualityCommands.push("bun run cloudflare:dry-run");
  if (!isMobileOnly && !isCloudflare)
    qualityCommands.push(usesProductionSupervisor ? "bun run start:production" : "bun run start");
  qualityCommands.push("ghostinit check");

  const lines: string[] = [
    `# AGENTS.md — ${projectName}`,
    "",
    "> Generated for this exact GhostInit single-mode configuration. Use the emitted single-package paths and do not add capabilities that were not selected.",
    "",
    "## Snapshot",
    "",
    "- Mode: single package with no root workspaces; any emitted backend source is colocated in this repository.",
    `- Package manager: Bun ${v.runtime.bun} (\`packageManager: bun@${v.runtime.bun}\`). Do not use npm, pnpm, or Yarn.`,
    `- Supply-chain delay: \`bunfig.toml\` rejects packages newer than ${v.supplyChain.minimumReleaseAgeSeconds} seconds and has no exclusions.`,
    `- Backend execution target: ${runtime === "bun" ? `Bun ${v.runtime.bun}` : `Node ${v.runtime.node}`}. Installation and repository scripts still use Bun.`,
    `- Frontend apps: ${apps.join(", ")}.`,
    `- Web framework: ${hasWeb ? frameworkLabel : "not emitted because the web app is disabled"}.`,
    `- Database: ${isNativeOnly ? "none; single native mode does not generate a local backend adapter" : databaseDescription(database)}.`,
    `- Backend host: ${isNativeOnly ? "not generated. The CLI permits only frontend-local capabilities; external remote-backend selection is not implemented" : "this web application owns the selected server capabilities"}.`,
    `- TypeScript: ${typescriptVersion}. React: ${v.nextStack.react}.`,
    ...(hasWeb && !isTanstack
      ? [
          "- Next development and builds executed by Bun use the supported Webpack compatibility profile; Node uses Turbopack. PDF-enabled Bun commands preload the declared renderer before Next initializes.",
        ]
      : []),
    `- Enabled capabilities: ${capabilities.length > 0 ? capabilities.join(", ") : "foundation only"}.`,
    `- Billing providers: ${selectedBilling.length > 0 ? (isNativeOnly ? "unsupported in single native mode; this template-only configuration is not CLI-reachable" : selectedBilling.join(", ")) : hasWeb && hasAuth ? "none; the web billing UI is an empty state and provider adapters/webhooks are absent" : "none; billing UI, provider adapters, and webhooks are absent"}.`,
    "",
    "## Architecture",
    "",
    "Keep the dependency direction: presentation -> typed transport/contracts -> application services -> domain and application-owned ports -> adapters -> supporting infrastructure.",
    "",
    ...(isNativeOnly
      ? [
          isDesktopOnly
            ? "- `src/renderer` owns desktop presentation and client-local integrations; `src/main.ts` and `src/preload.ts` keep privileged Electron APIs outside the renderer."
            : "- `app/` owns Expo routes and `src/` owns mobile presentation, client-local state, and platform adapters.",
        ]
      : [
          "- `src/server/services` owns application policies and ports. Route handlers call services instead of reimplementing business rules.",
          "- `src/server/api` owns oRPC contracts/procedures when the typed API capability is enabled.",
          "- When emitted, `src/server/adapters` owns external integrations; selected billing SDKs stay under `src/server/billing/providers`.",
          "- `src/server/db`, `src/server/kernel`, and `src/server/observability` are supporting infrastructure.",
        ]),
    "- Use the `@/*` alias for `src/*`; never invent `@repo/*` imports in single mode.",
    "",
    "## Package Roles",
    "",
  ];

  if (hasWeb) {
    lines.push(`- \`${routeRoot}\`: ${frameworkLabel} presentation and route entry points.`);
    lines.push(
      "- `src/components` and `src/components/ui`: shared application and Base UI components.",
    );
  }
  if (apps.includes("mobile")) lines.push("- `app/` and `src/`: Expo mobile client.");
  if (apps.includes("desktop"))
    lines.push("- `src/main.ts` and `src/renderer/`: Electron desktop client.");
  if (hasApi && hasLocalBackend)
    lines.push("- `src/server/api`: oRPC contracts, procedures, composition, and adapters.");
  if (hasAuth) {
    lines.push(
      isDesktopOnly
        ? "- `src/renderer/lib/auth.ts`: desktop authentication client boundary."
        : "- `src/server/auth`: Better Auth server boundary.",
    );
    if (!documentedEmail && hasLocalBackend) {
      lines.push(
        "- Email/password signup, sign-in, verification, magic-link, and reset are disabled; only configured OAuth providers may establish identity until the email capability is enabled.",
      );
    }
  }
  if (selectedBilling.length > 0) {
    lines.push(
      isDesktopOnly
        ? "- `src/renderer/routes/billing.tsx`: desktop billing client route; provider SDKs remain on the backend."
        : "- `src/server/billing`: application-owned billing port plus selected provider adapters.",
    );
  }
  if (documentedEmail) {
    lines.push("- `src/server/email`: typed React email delivery boundary.");
  }
  if (documentedEve) lines.push("- `agent/`: generated Eve durable-agent application.");
  if (hasLocalBackend) {
    lines.push(
      "- `src/server/services`: capability use cases and ports.",
      "- `src/server/db`: selected database adapter or explicit disabled stub.",
    );
  }
  if (options.analytics && hasLocalBackend)
    lines.push("- `src/server/analytics`: analytics contracts and adapters.");
  if (options.pdf && hasLocalBackend) lines.push("- `src/server/pdf`: PDF capability boundary.");
  if (options.storage && database === "postgres" && hasLocalBackend) {
    lines.push("- `src/server/storage`: PostgreSQL-backed storage implementation.");
  }

  if (hasWeb) {
    lines.push("", `## ${frameworkLabel} Routes`, "");
    if (isTanstack) {
      lines.push(
        "- File routes live under `src/routes/`; `src/routeTree.gen.ts` is generated by the router tooling.",
        "- Use TanStack Router navigation and route context. Server handlers receive `{ request }: { request: Request }`.",
        "- `bun run typecheck` runs `tsr generate && tsc --noEmit`; do not bypass route generation.",
      );
    } else {
      lines.push(
        "- App Router files live under `src/app/`.",
        "- Use server/client component boundaries deliberately; route handlers use the Web `Request` API.",
      );
    }
    if (hasApi) lines.push(`- oRPC transport: \`${rpcRoute}\`.`);
    else lines.push("- The typed API capability is disabled; no oRPC transport route is emitted.");
    if (hasAuth) lines.push(`- Auth transport: \`${authRoute}\`.`);
    if (hasAdmin) {
      lines.push(
        isTanstack
          ? "- Admin routes: `src/routes/admin.tsx`, `src/routes/admin.users.tsx`, and `src/routes/admin.users.create.tsx`."
          : "- Admin routes: `src/app/admin/page.tsx`, `src/app/admin/users/page.tsx`, and `src/app/admin/users/create/page.tsx`, protected by the generated admin guard.",
      );
    }
    if (selectedBilling.length > 0) {
      const providerPattern = isTanstack
        ? "src/routes/api/webhooks/<provider>.ts"
        : "src/app/api/webhooks/<provider>/route.ts";
      lines.push(
        `- Selected-provider webhook routes follow \`${providerPattern}\` and consume bounded raw request bodies.`,
      );
    }
    lines.push(
      isCloudflare
        ? `- The manifest uses the generated Cloudflare ${isTanstack ? "Vite" : "OpenNext"} adapter. Use \`build:worker\`, \`cloudflare:dry-run\`, \`preview\`, and \`deploy\`; there is no long-lived Node/Bun production process.`
        : isTanstack
          ? `- Manifest scripts use \`vite dev --port 3000\`, \`vite build\`, \`${runtime === "bun" ? "bun" : "node"} .output/server/index.mjs\`, and \`tsr generate && tsc --noEmit\`.`
          : `- The manifest development script runs \`${nextDevCommand}\`${usesCustomNextServer ? " so the generated oRPC WebSocket upgrade is available during ordinary development" : " through Next's stock development server"}. Build runs \`${nextBuildCommand}\`; \`bun run start\` uses the generated custom server only when selected capabilities require it.${usesCustomNextServer ? " Production start executes the existing custom server artifact without compiling or writing build output." : ""}`,
    );
  }

  lines.push("", "## Capability Rules", "");
  if (options.messaging && hasLocalBackend) {
    lines.push(
      "- Messaging requires authenticated membership checks; storage is enabled for attachments.",
    );
  }
  if (options.notifications && hasLocalBackend) {
    lines.push(
      "- Notifications use application-owned ports; provider tokens remain encrypted at rest.",
    );
  }
  if (options.featureFlags && hasLocalBackend) {
    lines.push("- Feature flags fail closed through the generated service and adapter boundary.");
  }
  if (options.jobs && database !== "none" && hasLocalBackend) {
    lines.push(
      `- Jobs provide worker/scheduler scripts${options.jobsApi ? " and an authenticated user-facing API" : "; no user-facing jobs API was selected"}.`,
    );
  }
  if (hasI18n) {
    lines.push(
      isMobileOnly
        ? "- i18n uses Expo locale detection, persisted EN/FR/AR selection, and RTL direction handling."
        : isDesktopOnly
          ? "- i18n uses Electron locale IPC, persisted EN/FR/AR selection, and renderer RTL synchronization."
          : isTanstack
            ? "- i18n uses the generated EN/FR/AR provider, locale cookie, and document lang/dir synchronization."
            : "- i18n uses the generated next-intl request/config/navigation boundary with non-prefixed application routes.",
    );
  }
  if (documentedEve) {
    lines.push(
      isTanstack || !hasWeb
        ? "- The project root is the Eve application root and `agent/` is its authored surface. No web-framework mounting adapter is generated for this target; `bun run eve:dev` and `bun run eve:start` operate the standalone backend."
        : "- The project root is the Eve application root and `agent/` is its authored surface. Next.js mounts the routes with `withEve(config)`; root `dev`/`start` own the integrated lifecycle, while `eve:dev`/`eve:start` are explicit backend diagnostics.",
    );
  }
  if (selectedBilling.length === 0) {
    lines.push(
      "- Billing is not configured. Keep vendor credentials, provider SDKs, and webhook routes absent.",
    );
  }
  if (database === "convex" && hasLocalBackend) {
    lines.push(
      isCloudflare
        ? "- Run `bun run convex:bootstrap` once, then use `bun run convex:dev`, `bun run convex:deploy`, and `bun run convex:codegen`; the wrapper keeps `.dev.vars` authoritative."
        : "- Database scripts are `bun run convex:dev`, `bun run convex:deploy`, and `bun run convex:codegen`.",
    );
  } else if (database === "postgres" && hasLocalBackend) {
    lines.push(
      "- Database scripts are `bun run db:generate`, `bun run db:migrate`, and `bun run db:push`.",
    );
  }

  lines.push(
    "",
    "## Frontend Conventions",
    "",
    "- Reuse `src/components/ui` and semantic design tokens before creating a new primitive.",
    ...(hasWeb
      ? [
          `- Add shadcn components with the exact catalog pin: \`bunx --bun shadcn@${v.ui.shadcn} add <component>\`. Never use floating tags or another package runner.`,
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
    ...qualityCommands,
    "```",
    "",
    isCloudflare
      ? "Cloudflare production is a Worker deployment, not `bun run start`; use `bun run preview` locally and `bun run deploy` for release."
      : hasWeb
        ? usesProductionSupervisor
          ? "`bun run start` starts only the web process. Use `bun run start:production` to supervise it with selected PostgreSQL workers; Fly runs them as separate process groups."
          : "Use `bun run start` for the generated production web process, including any custom server."
        : isMobileOnly
          ? "The mobile manifest uses Expo for `dev` and `build`; it does not expose a `start` script."
          : "The desktop manifest uses electron-vite/electron-builder and exposes `start` without a test or format-check script.",
    "Do not replace generated Bun scripts with npm commands.",
    "",
    "## Security",
    "",
    isCloudflare
      ? "- Never commit `.env*` or `.dev.vars`. Cloudflare builds reject runtime dotenv files; runtime values belong in Worker bindings and build variables are configured separately."
      : "- Never commit `.env` or `.env.local`. Vendor credentials remain `REPLACE_WITH_*` until supplied by the operator.",
    `- Client-visible variables use only these generated prefixes: ${clientPrefixes.map((prefix) => `\`${prefix}\``).join(", ") || "none"}. Keep all other credentials server-only.`,
    isDesktopOnly
      ? "- Keep provider credentials and privileged Electron APIs out of the renderer; preserve context isolation and the preload boundary. No backend is generated in this mode."
      : isMobileOnly
        ? "- Keep server credentials out of the Expo bundle. This mode generates no backend or remote-host contract; add a web host through monorepo mode before enabling server-backed capabilities."
        : "- Preserve raw-body verification, deterministic webhook idempotency, actor-derived resource ownership, auth guards, and secret-safe logging.",
    "",
  );

  return `${lines.join("\n")}\n`;
}
