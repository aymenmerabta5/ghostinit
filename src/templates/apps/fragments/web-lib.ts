import type { TemplateFile } from "../../shared.js";
import { animationsLibFiles } from "./lib/animations.js";
import { featureFlagsLibFiles } from "./lib/feature-flags.js";
import { storageLibFiles } from "./lib/storage.js";
import { surfaceStylesLibFiles } from "./lib/surface-styles.js";
import { notificationsLibFiles } from "./lib/notifications.js";
import { hooksLibFiles } from "./lib/hooks.js";

// Unified web lib — generic scaffolder patterns (animations, flags, storage, styles, notifications, hooks)
// Form-fields and dialogs are emitted via web-ui fragments (webUiFiles), not here, to avoid duplicate paths.
// Expo mobile excluded — it uses React Native primitives.
export function webLibFiles(
  base = "apps/web/src",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): TemplateFile[] {
  return [
    ...animationsLibFiles(base),
    ...featureFlagsLibFiles(base, framework),
    ...storageLibFiles(base, framework),
    ...surfaceStylesLibFiles(base),
    ...notificationsLibFiles(base),
    ...hooksLibFiles(base),
  ];
}
