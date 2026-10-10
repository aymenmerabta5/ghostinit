import type { DependencySecurityPolicy } from "../../lib/dependency-security/runtime-types.js";
import { runtime, supplyChain } from "../versions.js";
import { OPENNEXT_AWS_WINDOWS_PATCH_VERSION } from "../root/cloudflare.js";
import {
  BRACES_PATCH_ADVISORIES,
  BRACES_PATCH_KEY,
  NODE_FORGE_PATCH_ADVISORIES,
  NODE_FORGE_PATCH_KEY,
  dependencyAuditScriptContent,
  IMAGE_SIZE_PATCH_ADVISORIES,
  IMAGE_SIZE_PATCH_KEY,
} from "./dependency-audit-policy.js";

/** The host and generated runner receive the compiler's exact reviewed audit policy. */
export function dependencySecurityPolicy(
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
  hasExpoToolchainPatches = false,
): DependencySecurityPolicy {
  return {
    expectedBunVersion: runtime.bun,
    minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
    auditScriptContent: dependencyAuditScriptContent(
      hasImageSizePatch,
      hasOpenNextPatch,
      hasExpoToolchainPatches,
    ),
    patchedAdvisories: [
      ...(hasImageSizePatch
        ? IMAGE_SIZE_PATCH_ADVISORIES.map((id) => ({ package: "image-size", id }))
        : []),
      ...(hasExpoToolchainPatches
        ? BRACES_PATCH_ADVISORIES.map((id) => ({ package: "braces", id }))
        : []),
      ...(hasExpoToolchainPatches
        ? NODE_FORGE_PATCH_ADVISORIES.map((id) => ({ package: "node-forge", id }))
        : []),
    ],
    protectedPackageVersions: {
      ...(hasImageSizePatch
        ? { "image-size": IMAGE_SIZE_PATCH_KEY.slice("image-size@".length) }
        : {}),
      ...(hasOpenNextPatch ? { "@opennextjs/aws": OPENNEXT_AWS_WINDOWS_PATCH_VERSION } : {}),
      ...(hasExpoToolchainPatches
        ? {
            braces: BRACES_PATCH_KEY.slice("braces@".length),
            "node-forge": NODE_FORGE_PATCH_KEY.slice("node-forge@".length),
          }
        : {}),
    },
  };
}
