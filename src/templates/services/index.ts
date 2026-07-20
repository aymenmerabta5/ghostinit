import {
  codeScripts,
  file,
  packageJson,
  tsconfig,
  normalizeTemplateArgs,
  type TemplateFile,
} from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, ProjectMode } from "../../lib/addons.js";
import { billingServiceFiles } from "./billing.js";
import { emailServiceFiles } from "./email.js";
import { invoiceServiceFiles } from "./invoice.js";
import { hasBillingAddon } from "./shared.js";

export function servicesFiles(a?: unknown, b?: unknown, c?: unknown): TemplateFile[] {
  const { mode, addons } = normalizeTemplateArgs(
    a as ProjectMode | string | Record<string, unknown> | undefined,
    b as string | AddonInstallerMap | Record<string, unknown> | undefined,
    c as AddonInstallerMap | Record<string, unknown> | undefined,
  );
  const isMonorepo = mode === "monorepo";
  const base = isMonorepo ? "packages/services/src" : "src/server/services";
  const files: TemplateFile[] = [];
  files.push(
    file(
      `${isMonorepo ? "packages/services" : "src/server/services"}/package.json`,
      packageJson({
        name: "@repo/services",
        scripts: codeScripts(),
        dependencies: { "@repo/kernel": "workspace:*", zod: `^${v.validation.zod}` },
      }),
    ),
  );
  files.push(
    file(
      `${isMonorepo ? "packages/services" : "src/server/services"}/tsconfig.json`,
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: { composite: true, declaration: true, outDir: "./dist", rootDir: "./src" },
      }),
    ),
  );
  files.push(
    file(
      `${base}/index.ts`,
      `export * as billing from "./billing/index.js";\nexport * as email from "./email/index.js";\nexport * as invoice from "./invoice/index.js";\n`,
    ),
  );
  if (hasBillingAddon(addons)) files.push(...billingServiceFiles(mode as ProjectMode));
  files.push(...emailServiceFiles(mode as ProjectMode));
  files.push(...invoiceServiceFiles(mode as ProjectMode));
  return files;
}
