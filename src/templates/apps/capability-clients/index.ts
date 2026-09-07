import type { TemplateFile } from "../../shared.js";
import { featureFlagClientFiles } from "./feature-flags.js";
import { jobClientFiles } from "./jobs.js";
import { notificationClientFiles } from "./notifications.js";
import type { CapabilityClientOptions } from "./shared.js";
import { storageClientFiles } from "./storage.js";

export function capabilityClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  return [
    ...notificationClientFiles(options),
    ...storageClientFiles(options),
    ...featureFlagClientFiles(options),
    ...jobClientFiles(options),
  ];
}

export type { CapabilityClientOptions } from "./shared.js";
