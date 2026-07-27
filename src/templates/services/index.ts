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

  // Single mode has no @repo/kernel package, and the service files import
  // `@/server/kernel/result.js`. Emit the module so those imports resolve —
  // without it every single-mode project failed to typecheck with TS2307.
  if (!isMonorepo) {
    files.push(
      file(
        "src/server/kernel/result.ts",
        `export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
`,
      ),
    );
    files.push(
      file("src/server/kernel/index.ts", `export { ok, err, type Result } from "./result.js";\n`),
    );
  }
  files.push(
    file(
      `${isMonorepo ? "packages/services" : "src/server/services"}/package.json`,
      packageJson({
        name: "@repo/services",
        exports: { ".": "./src/index.ts" },
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
  // The billing service module is only emitted when a billing provider is
  // selected, so the barrel must not re-export it unconditionally — doing so left
  // no-billing projects with a barrel importing a file that was never generated.
  const withBilling = hasBillingAddon(addons);
  const barrelLines = [
    ...(withBilling ? [`export * as billing from "./billing/index.js";`] : []),
    `export * as email from "./email/index.js";`,
    `export * as invoice from "./invoice/index.js";`,
  ];
  files.push(file(`${base}/index.ts`, `${barrelLines.join("\n")}\n`));
  if (withBilling) files.push(...billingServiceFiles(mode as ProjectMode));
  files.push(...emailServiceFiles(mode as ProjectMode));
  files.push(...invoiceServiceFiles(mode as ProjectMode));
  return files;
}
