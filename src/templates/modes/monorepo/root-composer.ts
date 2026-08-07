import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { rootFiles as genRootFiles } from "../../root.js";
import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";
import { filteredEnvExample, filteredEnvLocal } from "./utils.js";
import type { FrameworkName, AppName } from "../../../lib/addons.js";

type Runtime = "node" | "bun";
type GenerateCtx = { dryRun?: boolean };

export function rootComposerFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateCtx,
  runtime: Runtime,
  selectedBilling: BillingProviderName[],
  addonMap?: AddonInstallerMap,
  database: "postgres" | "convex" | "none" | string = "postgres",
  framework?: FrameworkName,
  apps?: AppName[],
  deploy: string = "none",
): TemplateFile[] {
  const raw = genRootFiles(
    projectName,
    secrets,
    { dryRun: Boolean(ctx.dryRun) },
    runtime,
    addonMap as AddonInstallerMap,
    deploy as unknown as import("../../../lib/addons.js").DeployTarget,
  );
  const effectiveDb = database ?? "postgres";
  // Only emit the public env prefix the project actually validates.
  const audience = {
    framework: framework ?? "nextjs",
    hasMobile: (apps ?? ["web"]).includes("mobile" as AppName),
  };
  const filteredExample = filteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    true,
    runtime,
    effectiveDb,
    audience,
  );
  const filteredLocal = filteredEnvLocal(
    projectName,
    secrets,
    selectedBilling,
    runtime,
    effectiveDb,
    audience,
  );
  return raw.map((f: TemplateFile) => {
    if (f.path === ".env.example") return filteredExample;
    if (f.path === ".env.local") return filteredLocal;
    return f;
  });
}
