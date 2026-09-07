import type { FrameworkName, ProjectMode } from "../lib/addons.js";
import { type TemplateFile } from "./shared.js";

/**
 * Cloudflare keeps local variables outside Next/Vite dotenv discovery and uses
 * TanStack's server-only marker rather than the Next-specific poison package.
 */
export function normalizeCloudflareTemplateFiles(
  files: readonly TemplateFile[],
  framework: FrameworkName,
  mode: ProjectMode,
): TemplateFile[] {
  const normalized = files.map((file) => {
    const environmentPath =
      file.path === ".env.local" || file.path === "apps/web/.env.local"
        ? file.path.replace(/\.env\.local$/, ".dev.vars")
        : file.path;
    const deploymentInfrastructure =
      file.path.endsWith("scripts/cloudflare.mjs") ||
      file.path === "scripts/cloudflare-convex.mjs" ||
      file.path === "docs/CLOUDFLARE_DEPLOYMENT.md";
    return {
      ...file,
      path: environmentPath,
      content: deploymentInfrastructure
        ? file.content
        : file.content
            // Cloudflare's root Worker build rejects every runtime dotenv
            // variant. Native sibling builds receive reviewed public values
            // through the root wrapper, so their guidance must use the same
            // gitignored authority rather than recommend a conflicting file.
            .replaceAll(".env.production.local", ".dev.vars")
            .replaceAll(".env.local", ".dev.vars")
            .replaceAll(
              "# Set true only when the origin is private and your proxy overwrites X-Forwarded-For\n# Required for non-local BETTER_AUTH_URL values so rate limiting never shares one fallback bucket",
              "# Local Worker development keeps TRUSTED_PROXY=false\n# For production Convex auth, set TRUSTED_PROXY=true in the target Convex deployment environment; the generated Worker boundary validates CF-Connecting-IP and overwrites X-Forwarded-For",
            ),
    };
  });
  // TanStack's Vite adapter aliases the neutral `server-only` marker to
  // `@tanstack/react-start/server-only`. Keeping the source-level neutral marker
  // prevents framework dependencies from leaking into application packages.
  void framework;
  void mode;
  return normalized;
}
