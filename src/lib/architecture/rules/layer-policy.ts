/**
 * Versioned six-layer policy. Classification and allowed edges live together so
 * file-backed and package-backed imports cannot silently use different rules.
 */

import { builtinModules } from "node:module";
import type { LayerInfo } from "../types.js";
import { getBasePackage } from "../utils.js";
import { isPaddleBrowserAdapterFile, isVendorDirectImport } from "./vendor.js";

export type ArchitectureLayer =
  | "UI"
  | "Transport"
  | "Domain"
  | "Application"
  | "Vendors"
  | "Supporting";

export const ARCHITECTURE_POLICY_VERSION = 2;

/** Explicit form of GhostInit's downward-only six-layer policy. */
export const ALLOWED_LAYER_EDGES: Readonly<
  Record<ArchitectureLayer, ReadonlySet<ArchitectureLayer>>
> = {
  UI: new Set(["UI", "Transport", "Domain", "Application", "Vendors", "Supporting"]),
  Transport: new Set(["Transport", "Domain", "Application", "Vendors", "Supporting"]),
  Domain: new Set(["Domain", "Application", "Vendors", "Supporting"]),
  Application: new Set(["Application", "Vendors", "Supporting"]),
  Vendors: new Set(["Vendors", "Supporting"]),
  Supporting: new Set(["Supporting"]),
};

const LAYER_LEVEL: Record<ArchitectureLayer, number> = {
  UI: 1,
  Transport: 2,
  Domain: 3,
  Application: 4,
  Vendors: 5,
  Supporting: 6,
};

const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "bun",
  "bun:test",
  "bun:sqlite",
]);

function layer(name: ArchitectureLayer): LayerInfo {
  return { name, level: LAYER_LEVEL[name] };
}

export function isLayerEdgeAllowed(source: ArchitectureLayer, target: ArchitectureLayer): boolean {
  return ALLOWED_LAYER_EDGES[source].has(target);
}

export function getLayerFromFilePath(path: string): LayerInfo | null {
  const file = `/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;

  if (/\/packages\/auth\/src\/client\.[cm]?[jt]sx?$/.test(file)) return layer("UI");
  if (isPaddleBrowserAdapterFile(file)) return layer("Transport");
  if (/^\/(?:apps\/(?:web|mobile|desktop)\/)?src\/contracts(?:\/|$)/.test(file))
    return layer("Supporting");

  // Native client adapters are typed transports. Classify them before the
  // generic `/adapters/` application rule and the enclosing app UI rule so
  // presentation can depend on the boundary without depending on its vendor.
  if (
    /\/apps\/desktop\/src\/renderer\/adapters(?:\/|$)/.test(file) ||
    /\/apps\/mobile\/src\/adapters(?:\/|$)/.test(file) ||
    file.startsWith("/src/renderer/adapters/") ||
    file.startsWith("/src/adapters/messaging/")
  ) {
    return layer("Transport");
  }

  // These exact client libraries own HTTP/WebSocket/auth transport. Their
  // historical `lib` location is not presentation ownership; treating them as
  // UI makes native transport adapters appear to depend upward on a route.
  if (
    /\/apps\/web\/src\/lib\/(?:orpc(?:\.server)?|server-functions|paddle-checkout-functions)\.[cm]?[jt]sx?$/.test(
      file,
    ) ||
    /\/apps\/mobile\/src\/lib\/(?:auth-client|orpc|realtime)\.[cm]?[jt]sx?$/.test(file) ||
    /\/apps\/desktop\/src\/renderer\/lib\/(?:auth|orpc|realtime)\.[cm]?[jt]sx?$/.test(file) ||
    /^\/src\/lib\/(?:auth-client|orpc(?:\.server)?|realtime|server-functions|paddle-checkout-functions)\.[cm]?[jt]sx?$/.test(
      file,
    ) ||
    /^\/src\/renderer\/lib\/(?:auth|orpc|realtime)\.[cm]?[jt]sx?$/.test(file)
  ) {
    return layer("Transport");
  }

  // Explicit adapters must win over the enclosing API transport package.
  if (/\/packages\/api\/src\/adapters(?:\/|$)/.test(file)) return layer("Application");

  // Transport boundaries must win over their enclosing UI application.
  if (
    /\/packages\/api\//.test(file) ||
    /\/apps\/api\//.test(file) ||
    /\/(?:src\/)?app(?:\/[^/]+)*\/actions\.[cm]?[jt]sx?$/.test(file) ||
    /\/(?:src\/)?app\/api\//.test(file) ||
    /\/(?:src\/)?routes\/api(?:\/|\.)/.test(file) ||
    /\/src\/server\/api(?:\/|$)/.test(file) ||
    /\/src\/server\/http(?:\/|$)/.test(file) ||
    /\/(?:src\/)?server\/transport(?:\/|$)/.test(file) ||
    /\/src\/(?:main|preload)\.[cm]?[jt]s$/.test(file)
  ) {
    return layer("Transport");
  }

  if (
    /\/billing\/(?:src\/)?providers\//.test(file) ||
    /\/src\/server\/billing\/providers\//.test(file) ||
    /\/vendors\//.test(file) ||
    file.startsWith("/convex/")
  ) {
    return layer("Vendors");
  }

  if (/\/domain\//.test(file) || /\/packages\/core\//.test(file)) {
    return layer("Domain");
  }

  if (
    /\/application\//.test(file) ||
    /\/adapters\//.test(file) ||
    /\/packages\/(?:services|modules|billing|email|auth)\//.test(file) ||
    /\/src\/server\/(?:services|billing|auth)\//.test(file) ||
    /\/apps\/eve\/(?:agent|src)\//.test(file) ||
    file.startsWith("/agent/")
  ) {
    return layer("Application");
  }

  if (
    /\/packages\/(?:database|config|kernel|observability|contracts|shared|ui|typescript-config|realtime|storage|testing|workflows)\//.test(
      file,
    ) ||
    /\/tooling\//.test(file) ||
    /\/src\/server\/(?:db|database|config|kernel|observability)(?:\/|$)/.test(file)
  ) {
    return layer("Supporting");
  }

  // Application-owned server helpers live inside the web app for framework
  // integration, but they are not UI. More specific API, provider, domain, and
  // supporting paths above retain their dedicated classifications.
  if (/\/apps\/(?:web|mobile|desktop)\/src\/server(?:\/|$)/.test(file)) {
    return layer("Application");
  }

  if (
    /\/apps\/(?:web|mobile|desktop)\//.test(file) ||
    /^\/(?:src\/(?:app|routes|renderer|components|features)|app)\//.test(file)
  ) {
    return layer("UI");
  }

  return null;
}

export function getLayerFromImport(specifier: string, resolvedPath?: string): LayerInfo | null {
  if (resolvedPath) {
    const resolvedLayer = getLayerFromFilePath(resolvedPath);
    if (resolvedLayer) return resolvedLayer;
  }

  const imp = specifier.replace(/\\/g, "/");
  const base = getBasePackage(imp);
  if (imp === "better-auth/react" || imp.startsWith("better-auth/client/")) {
    return layer("Vendors");
  }
  if (isVendorDirectImport(imp) || base === "better-auth") return layer("Vendors");
  if (BUILTINS.has(imp) || imp.startsWith("node:") || imp.startsWith("bun:")) {
    return layer("Supporting");
  }
  if (
    imp.startsWith("@repo/api") ||
    imp.startsWith("@orpc/") ||
    imp === "next/server" ||
    imp === "next/headers"
  ) {
    return layer("Transport");
  }
  if (imp.startsWith("@repo/modules") && imp.includes("/domain")) return layer("Domain");
  if (imp.startsWith("@repo/core") || imp.includes("/domain/")) return layer("Domain");
  if (imp.startsWith("@repo/billing") && imp.includes("/providers")) return layer("Vendors");
  if (imp.startsWith("@repo/services") || imp.startsWith("@repo/modules")) {
    return layer("Application");
  }
  if (imp.startsWith("@repo/billing") || imp.startsWith("@repo/email")) {
    return layer("Application");
  }
  if (
    /^@repo\/(?:database|config|kernel|observability|contracts|shared|ui|realtime|storage|testing|workflows)(?:\/|$)/.test(
      imp,
    )
  ) {
    return layer("Supporting");
  }
  if (/^(?:drizzle-orm|drizzle-kit|pg)(?:\/|$)/.test(imp)) return layer("Supporting");
  return null;
}
