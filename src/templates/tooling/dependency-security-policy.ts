import type { DependencySecurityPolicy } from "../../lib/dependency-security/runtime-types.js";
import { runtime, supplyChain } from "../versions.js";
import { OPENNEXT_AWS_WINDOWS_PATCH_VERSION } from "../root/cloudflare.js";
import {
  dependencyAuditScriptContent,
  IMAGE_SIZE_PATCH_ADVISORIES,
  IMAGE_SIZE_PATCH_KEY,
} from "./dependency-audit-policy.js";

/** The host and generated runner receive the compiler's exact reviewed audit policy. */
export function dependencySecurityPolicy(
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
): DependencySecurityPolicy {
  return {
    expectedBunVersion: runtime.bun,
    minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
    auditScriptContent: dependencyAuditScriptContent(hasImageSizePatch, hasOpenNextPatch),
    patchedAdvisories: hasImageSizePatch
      ? IMAGE_SIZE_PATCH_ADVISORIES.map((id) => ({ package: "image-size", id }))
      : [],
    protectedPackageVersions: {
      ...(hasImageSizePatch
        ? { "image-size": IMAGE_SIZE_PATCH_KEY.slice("image-size@".length) }
        : {}),
      ...(hasOpenNextPatch ? { "@opennextjs/aws": OPENNEXT_AWS_WINDOWS_PATCH_VERSION } : {}),
    },
  };
}
