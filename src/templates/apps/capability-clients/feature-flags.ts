import {
  featureFlagQueriesContent,
  featureFlagWorkflowContent,
  featureFlagScreenContent,
  featureFlagWorkspaceContent,
} from "./feature-flag-workspace.js";
import { file, type TemplateFile } from "../../shared.js";
import {
  appRoot,
  enabledTargets,
  featureRoot,
  routeFile,
  type CapabilityClientOptions,
  type ClientTarget,
} from "./shared.js";

function queriesContent(_options: CapabilityClientOptions, _target: ClientTarget): string {
  return featureFlagQueriesContent();
}

function featureFlagTanstackRouteContent(): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { FeatureFlagsPage } from "@/features/feature-flags/page";
import { loadInitialUserFeatureFlag, resolveRouteAuth } from "@/lib/protected-route";

export const Route = createFileRoute("/feature-flags")({
  beforeLoad: ({ context }) => resolveRouteAuth(context.queryClient),
  loader: ({ context }) =>
    context.queryScope ? loadInitialUserFeatureFlag({ ...context, queryScope: context.queryScope }) : null,
  component: FeatureFlagsPage,
});
`;
}

function featureFlagNextRouteContent(
  mode: CapabilityClientOptions["mode"],
  requestApplication: boolean,
): string {
  if (!requestApplication) {
    return `import type * as React from "react";
import { FeatureFlagsPage } from "@/features/feature-flags/page";

export default function Page(): React.JSX.Element {
  return <FeatureFlagsPage initialResult={null} />;
}
`;
  }
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { Suspense } from "react";
import {
  createRequestApplicationForRequest,
  evaluateAuthenticatedFeatureFlag,
} from "${applicationModule}";
import { FeatureFlagsPage } from "@/features/feature-flags/page";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";

async function FeatureFlagData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const current = await application.me();
  const principal = application.principal;
  if (!current.user || current.user.banned || !principal) return <FeatureFlagsPage initialResult={null} />;
  const scope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  let initialResult = null;
  try {
    initialResult = await evaluateAuthenticatedFeatureFlag(current.user, "new-dashboard");
  } catch {
    // Feature flags are advisory and must never make the page unavailable.
  }
  return <RequestOwnedSnapshot scope={scope}><FeatureFlagsPage initialResult={initialResult} /></RequestOwnedSnapshot>;
}

export default function Page(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><FeatureFlagData /></Suspense>;
}
`;
}

function domPageContent(options: CapabilityClientOptions, target: "web" | "desktop"): string {
  return featureFlagScreenContent(options, target);
}

function expoPageContent(options: CapabilityClientOptions): string {
  return featureFlagScreenContent(options, "mobile");
}

function featureFlagFilesForTarget(
  options: CapabilityClientOptions,
  target: ClientTarget,
): TemplateFile[] {
  const base = featureRoot(options.mode, target, "feature-flags");
  const tanstackWeb = target === "web" && options.framework === "tanstack-start";
  return [
    file(`${base}/queries.ts`, queriesContent(options, target)),
    file(`${base}/use-feature-flag-evaluation.ts`, featureFlagWorkflowContent(options, target)),
    file(
      `${base}/components/feature-flag-workspace.tsx`,
      featureFlagWorkspaceContent(options, target),
    ),
    file(
      `${base}/page.tsx`,
      target === "mobile" ? expoPageContent(options) : domPageContent(options, target),
    ),
    tanstackWeb
      ? file(
          `${appRoot(options.mode, target)}src/routes/feature-flags.tsx`,
          featureFlagTanstackRouteContent(),
        )
      : target === "web" && options.framework === "nextjs"
        ? file(
            `${appRoot(options.mode, target)}src/app/feature-flags/page.tsx`,
            featureFlagNextRouteContent(options.mode, options.requestApplication),
          )
        : routeFile(options, target, "feature-flags", "FeatureFlagsPage", "feature-flags"),
  ];
}

export function featureFlagClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  if (!options.featureFlags) return [];
  return enabledTargets(options).flatMap((target) => featureFlagFilesForTarget(options, target));
}
