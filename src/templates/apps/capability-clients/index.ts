import type { TemplateFile } from "../../shared.js";
import { authOwnedActionFile } from "../fragments/auth-owned-action.js";
import { featureFlagClientFiles } from "./feature-flags.js";
import { jobClientFiles } from "./jobs.js";
import { notificationClientFiles } from "./notifications.js";
import { appRoot, enabledTargets, type CapabilityClientOptions } from "./shared.js";
import { storageClientFiles } from "./storage.js";

export function capabilityClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  return [
    ...(options.jobs || options.storage || options.featureFlags
      ? enabledTargets(options).map((target) =>
          authOwnedActionFile(
            `${appRoot(options.mode, target)}src${target === "desktop" ? "/renderer" : ""}`,
          ),
        )
      : []),
    ...notificationClientFiles(options),
    ...storageClientFiles(options),
    ...featureFlagClientFiles(options),
    ...jobClientFiles(options),
  ];
}

export type { CapabilityClientOptions } from "./shared.js";
