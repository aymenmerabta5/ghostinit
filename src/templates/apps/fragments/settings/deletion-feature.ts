import { file, type TemplateFile } from "../../../shared.js";
import { accountDeletionMutationContent, accountDeletionOwnerContent } from "./deletion.js";
import { accountDeletionWorkflowContent } from "./feature-workflows.js";
import { oauthDeletionViewContent, passwordDeletionViewContent } from "./deletion-view.js";

/** Account retirement has a different identity lifetime from ordinary settings writes. */
export function accountDeletionFeatureFiles(
  sourceRoot: string,
  router: "next" | "tanstack",
  hasEmail: boolean,
): TemplateFile[] {
  const root = `${sourceRoot}/features/account-deletion`;
  return [
    file(
      `${root}/model.ts`,
      `${accountDeletionOwnerContent()}
export function identityFailure(error: unknown): Error { return new Error("Identity operation failed", { cause: error }); }
export function identityErrorCode(error: unknown): string | undefined {
  const value = error instanceof Error ? error.cause : error;
  return value && typeof value === "object" && "code" in value && typeof value.code === "string" ? value.code : undefined;
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `"use client";
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { identityClient } from "@/lib/auth-client";
import { currentQueryAuthScope, currentQueryAuthIdentity, currentQueryAuthGeneration, subscribeQueryAuthGeneration, transitionQueryAuthScope } from "@/lib/query-client";
import { createAccountDeletionOwner, identityFailure } from "./model";
${accountDeletionMutationContent()}`,
    ),
    file(`${root}/use-account-deletion.ts`, accountDeletionWorkflowContent(router, hasEmail)),
    file(
      `${root}/components/danger-zone-view.tsx`,
      hasEmail ? passwordDeletionViewContent() : oauthDeletionViewContent(),
    ),
    file(
      `${root}/account-deletion.tsx`,
      `"use client";
import type * as React from "react";
import { useAccountDeletion } from "./use-account-deletion";
import { DangerZoneView } from "./components/danger-zone-view";
export function DangerZoneCard(): React.JSX.Element {
  const model = useAccountDeletion();
  return <DangerZoneView model={model} />;
}
`,
    ),
  ];
}
