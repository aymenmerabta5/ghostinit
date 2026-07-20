import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { rootFiles as genRootFiles } from "../../root.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { filteredEnvExample, filteredEnvLocal } from "./utils.js";

type Runtime = "node" | "bun";
type GenerateCtx = { dryRun?: boolean };

export function rootComposerFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateCtx,
  runtime: Runtime,
  selectedBilling: BillingProviderName[],
): TemplateFile[] {
  const raw = genRootFiles(projectName, secrets, { dryRun: Boolean(ctx.dryRun) }, runtime);
  const filteredExample = filteredEnvExample(projectName, secrets, selectedBilling, true, runtime);
  const filteredLocal = filteredEnvLocal(projectName, secrets, selectedBilling, runtime);
  return raw.map((f: TemplateFile) => {
    if (f.path === ".env.example") return filteredExample;
    if (f.path === ".env.local") return filteredLocal;
    return f;
  });
}
