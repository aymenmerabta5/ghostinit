import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { rootFiles as genRootFiles } from "../../root.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { filteredEnvExample } from "./utils.js";

export function rootComposerFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: { dryRun?: boolean },
  runtime: "node" | "bun",
  selectedBilling: BillingProviderName[],
): TemplateFile[] {
  const raw = genRootFiles(
    projectName,
    secrets,
    { dryRun: Boolean(ctx.dryRun) } as any,
    runtime as any,
  );
  const filtered = filteredEnvExample(projectName, secrets, selectedBilling, true, runtime);
  return raw.map((f: TemplateFile) => (f.path === ".env.example" ? filtered : f));
}
