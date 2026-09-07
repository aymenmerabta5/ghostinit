import type { DesktopMode } from "../model.js";

export function desktopKernelSpecifier(mode: DesktopMode): string {
  return mode === "monorepo" ? "@repo/kernel" : "@/renderer/lib/kernel";
}

export function desktopOrpcSpecifier(mode: DesktopMode): string {
  return mode === "monorepo" ? "@/lib/orpc" : "@/renderer/lib/orpc";
}
