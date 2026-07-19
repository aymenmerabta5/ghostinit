import { file, type TemplateFile } from "../../../shared.js";
import type { ProjectMode } from "../../../../lib/addons.js";
import type { AddonInstallerMap } from "../../../../lib/addons.js";
import { normalize, selectedProviders } from "./shared.js";
import { billingIconsContent } from "./icons.js";
import { billingHeaderContent } from "./header.js";
import { billingEmptyContent } from "./empty.js";
import { billingHookContent } from "./hook.js";
import { providerPanelContent } from "./providers.js";
import { billingTabsContent } from "./tabs.js";
import { mainPageContent, packageMainPageContent } from "./main.js";

type Runtime = "node" | "bun";

export function billingUiFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, addons } = normalize(modeOrOpts, runtimeOrAddons, maybeAddons);
  const selected = selectedProviders(addons);
  const effective = selected;
  const icons = billingIconsContent();
  const header = billingHeaderContent();
  const empty = billingEmptyContent();
  const hook = billingHookContent();
  const tabs = billingTabsContent(effective);
  const main = mainPageContent(effective);
  const pkgMain = packageMainPageContent(effective);
  const files: TemplateFile[] = [];

  if (mode === "monorepo") {
    files.push(file("apps/web/src/app/billing/components/icons.tsx", icons));
    files.push(file("apps/web/src/app/billing/components/billing-header.tsx", header));
    files.push(file("apps/web/src/app/billing/components/billing-empty.tsx", empty));
    files.push(file("apps/web/src/app/billing/hooks/use-billing-page.ts", hook));
    files.push(file("apps/web/src/hooks/use-billing-page.ts", hook));
    for (const p of effective)
      files.push(
        file(
          `apps/web/src/app/billing/components/providers/${p}-panel.tsx`,
          providerPanelContent(p, "../../hooks/use-billing-page"),
        ),
      );
    files.push(file("apps/web/src/app/billing/components/billing-tabs.tsx", tabs));
    files.push(file("apps/web/src/app/billing/page.tsx", main));
    files.push(file("packages/billing/src/ui/components/icons.tsx", icons));
    files.push(file("packages/billing/src/ui/components/billing-header.tsx", header));
    files.push(file("packages/billing/src/ui/components/billing-empty.tsx", empty));
    files.push(file("packages/billing/src/ui/hooks/use-billing-page.ts", hook));
    for (const p of effective)
      files.push(
        file(
          `packages/billing/src/ui/components/providers/${p}-panel.tsx`,
          providerPanelContent(p, "../../hooks/use-billing-page"),
        ),
      );
    files.push(file("packages/billing/src/ui/components/billing-tabs.tsx", tabs));
    files.push(file("packages/billing/src/ui/billing-page.tsx", pkgMain));
    files.push(
      file("packages/billing/src/ui/index.ts", `export { default } from "./billing-page.js";\n`),
    );
  } else {
    files.push(file("src/app/billing/components/icons.tsx", icons));
    files.push(file("src/app/billing/components/billing-header.tsx", header));
    files.push(file("src/app/billing/components/billing-empty.tsx", empty));
    files.push(file("src/app/billing/hooks/use-billing-page.ts", hook));
    files.push(file("src/hooks/use-billing-page.ts", hook));
    for (const p of effective)
      files.push(
        file(
          `src/app/billing/components/providers/${p}-panel.tsx`,
          providerPanelContent(p, "../../hooks/use-billing-page"),
        ),
      );
    files.push(file("src/app/billing/components/billing-tabs.tsx", tabs));
    files.push(file("src/app/billing/page.tsx", main));
    files.push(file("src/server/billing/ui/components/icons.tsx", icons));
    files.push(file("src/server/billing/ui/components/billing-header.tsx", header));
    files.push(file("src/server/billing/ui/components/billing-empty.tsx", empty));
    files.push(file("src/server/billing/ui/hooks/use-billing-page.ts", hook));
    for (const p of effective)
      files.push(
        file(
          `src/server/billing/ui/components/providers/${p}-panel.tsx`,
          providerPanelContent(p, "../../hooks/use-billing-page"),
        ),
      );
    files.push(file("src/server/billing/ui/components/billing-tabs.tsx", tabs));
    files.push(file("src/server/billing/ui/billing-page.tsx", pkgMain));
    files.push(
      file("src/server/billing/ui/index.ts", `export { default } from "./billing-page.js";\n`),
    );
  }
  return files;
}

export const billingPageFiles = billingUiFiles;
export const billingUiPackage = billingUiFiles;
