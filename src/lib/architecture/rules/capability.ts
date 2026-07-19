/**
 * Capability isolation: capabilities must not import each other directly,
 * must go via @repo/services stable API root.
 * Split guards: billing providers are vendors, not capabilities.
 */

import { dirname, resolve } from "node:path";
import type { ArchitectureFinding, CapabilityInfo } from "../types.js";
import { normalizePath } from "../utils.js";

export function getCapabilityFromPath(p: string): CapabilityInfo | null {
  const file = p.replace(/\\/g, "/");

  if (file.includes("/billing/providers/") || file.includes("/billing/src/providers/")) {
    return null;
  }

  let m: RegExpExecArray | null = null;

  m = /[/]services[/]src[/]([^/]+)[/]/.exec(file);
  if (m) {
    const name = m[1];
    if (name && !["src", "lib", "index.ts", "index.js"].includes(name)) {
      return { kind: "service", name };
    }
  }
  m =
    /[/]server[/]services[/]([^/]+)[/]/.exec(file) ||
    /src[/]server[/]services[/]([^/]+)[/]/.exec(file);
  if (m) {
    const name = m[1];
    if (name && !["src", "lib", "index.ts", "index.js", "result.ts", "result"].includes(name)) {
      return { kind: "service", name };
    }
  }
  m = /[/]services[/]([^/]+)[/]/.exec(file);
  if (m) {
    const name = m[1];
    if (name && !["src", "lib"].includes(name) && !name.includes(".")) {
      if (
        file.includes("packages/services") ||
        file.includes("server/services") ||
        file.includes("/services/")
      ) {
        return { kind: "service", name };
      }
    }
  }

  const mod =
    /[/]modules[/]src[/]([^/]+)[/]/.exec(file) || /[/]modules[/]src[/]([^/]+)$/.exec(file);
  if (mod) {
    return { kind: "module", name: mod[1] };
  }

  if (file.includes("packages/billing/src") && !file.includes("/providers/")) {
    const bm = /[/]billing[/]src[/]([^/]+)[/]/.exec(file);
    if (bm) {
      return { kind: "billing", name: `billing:${bm[1]}` };
    }
    return { kind: "billing", name: "billing" };
  }
  if (file.includes("packages/billing/") && !file.includes("/providers/")) {
    return { kind: "billing", name: "billing" };
  }

  if (file.includes("packages/email/")) {
    return { kind: "email", name: "email" };
  }

  if (file.includes("packages/services/src/")) {
    const generic = /packages[/]services[/]src[/]([^/]+)/.exec(file);
    if (generic) return { kind: "service", name: generic[1] };
    return { kind: "service", name: "services" };
  }

  return null;
}

export function getTargetCapabilityFromImport(
  imp: string,
  resolvedNormalized?: string,
): CapabilityInfo | null {
  if (resolvedNormalized) {
    const cap = getCapabilityFromPath(resolvedNormalized);
    if (cap) return cap;
  }

  const normalized = imp.replace(/\\/g, "/");

  let m = /@repo[/]services[/]([^/\s"']+)/.exec(normalized);
  if (m) {
    const raw = m[1];
    const name = raw.split("/")[0].replace(/\..*$/, "");
    if (name) return { kind: "service", name };
  }

  if (normalized.startsWith("@repo/billing")) {
    if (normalized.includes("/providers") || normalized.includes("providers")) {
      return null;
    }
    const sub = /@repo[/]billing[/]([^/\s"']+)/.exec(normalized);
    if (sub) return { kind: "billing", name: `billing:${sub[1]}` };
    return { kind: "billing", name: "billing" };
  }

  if (normalized.startsWith("@repo/email")) {
    return { kind: "email", name: "email" };
  }

  m = /@repo[/]modules[/]([^/\s"']+)/.exec(normalized);
  if (m) return { kind: "module", name: m[1] };

  m = /[/]modules[/]src[/]([^/\s"']+)/.exec(normalized);
  if (m) return { kind: "module", name: m[1] };

  m =
    /[/]services[/]src[/]([^/]+)[/]/.exec(normalized) ||
    /[/]services[/]src[/]([^/]+)/.exec(normalized);
  if (m) return { kind: "service", name: m[1] };

  m = /[/]services[/]([^/]+)[/]/.exec(normalized);
  if (m && !["src", "lib"].includes(m[1])) {
    return { kind: "service", name: m[1] };
  }

  if (imp.startsWith(".")) {
    const parts = normalized.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    const secondLast = parts[parts.length - 2] || "";
    const knownCaps = [
      "billing",
      "email",
      "invoices",
      "identity",
      "storage",
      "analytics",
      "payments",
    ];
    for (const kc of knownCaps) {
      if (
        normalized.includes(`/${kc}/`) ||
        normalized.endsWith(`/${kc}`) ||
        last === kc ||
        secondLast === kc
      ) {
        return { kind: "service", name: kc };
      }
    }
  }

  return null;
}

export function checkCapabilityIsolation(
  findings: ArchitectureFinding[],
  file: string,
  absFile: string,
  imp: string,
): void {
  const current = getCapabilityFromPath(file);
  if (!current) return;

  if (
    file.endsWith("/services/src/index.ts") ||
    file.endsWith("/server/services/index.ts") ||
    file.endsWith("/services/index.ts") ||
    file.endsWith("/modules/src/index.ts") ||
    file.endsWith("packages/services/src/index.ts") ||
    (file.endsWith("src/index.ts") && file.includes("packages/services"))
  ) {
    return;
  }

  if (
    imp === "@repo/services" ||
    imp === "@repo/services/index" ||
    imp === "@repo/services/index.js"
  ) {
    return;
  }

  let target: CapabilityInfo | null = null;
  let resolvedNormalized: string | undefined;

  if (imp.startsWith(".")) {
    try {
      const resolved = resolve(dirname(absFile), imp);
      resolvedNormalized = normalizePath(resolved);
      target = getTargetCapabilityFromImport(imp, resolvedNormalized);
    } catch {
      target = getTargetCapabilityFromImport(imp);
    }
  } else {
    target = getTargetCapabilityFromImport(imp);
  }

  if (!target) return;
  if (target.name === current.name && target.kind === current.kind) return;
  if (current.kind === "billing" && target.kind === "billing") return;
  if (current.name.startsWith("billing") && target.name.startsWith("billing")) return;

  findings.push({
    id: "capability-cross-import",
    severity: "HIGH",
    message: `Capability ${current.kind}:${current.name} imports other capability ${target.kind}:${target.name} directly: ${imp} - must go via services stable API (@repo/services)`,
    file,
    rule: "capability-isolation",
  });
}
