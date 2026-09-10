import type { TemplateFile } from "../../../shared.js";
import { convexWebMessagingFeatureFiles } from "./web-convex.js";

export function messagingConvexTanstackWebFiles(
  mode: "monorepo" | "single" = "monorepo",
): TemplateFile[] {
  return convexWebMessagingFeatureFiles(mode, "tanstack");
}
