import type { TemplateFile } from "../../shared.js";
import type { CapabilityClientOptions } from "./shared.js";
import { storageClientFiles as composeStorageClients } from "./storage-surfaces.js";

export function storageClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  return composeStorageClients(options);
}
