import type { TemplateFile } from "../../shared.js";
import type { CapabilityClientOptions } from "./shared.js";
import { jobClientFiles as composeJobClients } from "./jobs-surfaces.js";

export function jobClientFiles(options: CapabilityClientOptions): TemplateFile[] {
  return composeJobClients(options);
}
