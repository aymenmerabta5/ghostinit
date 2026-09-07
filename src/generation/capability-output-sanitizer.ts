import type { ResolvedProjectConfig } from "../domain/project/config.js";
import type { TemplateFile } from "../templates/shared.js";
import { sanitizeLegacyCapabilityEnvironment } from "./capability-environment-sanitizer.js";

const AUTH_DATABASE_SYMBOLS = new Set([
  "accounts",
  "adminAuditEvents",
  "identityAuditEvents",
  "invitations",
  "members",
  "organizationRoles",
  "organizations",
  "passkeys",
  "posts",
  "rateLimits",
  "sessions",
  "teamMembers",
  "teams",
  "twoFactor",
  "twoFactors",
  "users",
  "verifications",
]);

const BILLING_DATABASE_SYMBOLS = new Set([
  "billingProviderEnum",
  "checkouts",
  "checkoutStatusEnum",
  "customers",
  "invoices",
  "invoiceStatusEnum",
  "license_keys",
  "licenseKeyStatusEnum",
  "products",
  "recurringIntervalEnum",
  "subscriptions",
  "subscriptionStatusEnum",
  "usage_events",
  "webhook_events",
]);

function filterLines(content: string, keep: (line: string) => boolean): string {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  return content.split(/\r?\n/).filter(keep).join(newline);
}

function databaseSymbol(line: string): string | null {
  const declaration = /^\s*export\s+const\s+([A-Za-z][A-Za-z0-9_]*)\b/.exec(line)?.[1];
  if (declaration) return declaration;
  return /^\s+([A-Za-z][A-Za-z0-9_]*)\s*,(?:\s*\/\/.*)?$/.exec(line)?.[1] ?? null;
}

function sanitizeDatabaseNoneSurface(
  path: string,
  content: string,
  config: ResolvedProjectConfig,
): string {
  let result = filterLines(content, (line) => {
    const symbol = databaseSymbol(line);
    if (!symbol) return true;
    if (!config.capabilities.auth && AUTH_DATABASE_SYMBOLS.has(symbol)) return false;
    if (!config.capabilities.billing.enabled && BILLING_DATABASE_SYMBOLS.has(symbol)) return false;
    return true;
  });
  if (path === "packages/database/src/index.ts") {
    result = result
      .replace(/import\s*\{\s*db\s*,\s*users\s*\}/, "import { db }")
      .replace(/export\s*\{\s*\}\s*from\s*["']\.\/schema\/index(?:\.js)?["'];?\r?\n?/m, "");
  }
  if (path === "packages/database/src/schema/index.ts" && !result.includes("export const ")) {
    result = result.replace(
      /^\s*import\s*\{\s*disabledDatabaseValue\s*\}\s*from\s*["']\.\.\/disabled(?:\.js)?["'];?\r?\n+/m,
      "",
    );
    result = `${result.trimEnd()}\n\nexport {};\n`;
  }
  return result;
}

function keepFeatureFile(path: string, config: ResolvedProjectConfig): boolean {
  const capabilities = config.capabilities;
  if (
    !capabilities.auth &&
    (/^(?:apps\/web\/)?src\/(?:app|routes)\/(?:forbidden|unauthorized)\.tsx$/.test(path) ||
      /^(?:apps\/web\/)?src\/hooks\/use-logout\.ts$/.test(path) ||
      /^(?:apps\/web\/)?src\/components\/shell\//.test(path) ||
      path === "src/lib/access.ts" ||
      path === "packages/kernel/src/admin.ts" ||
      /^packages\/modules\/(?:src|tests)\/identity\//.test(path) ||
      /^(?:packages\/database\/src|src\/server\/db)\/schema\/(?:auth|posts)\.ts$/.test(path))
  ) {
    return false;
  }
  if (
    !capabilities.billing.enabled &&
    (path === "packages/kernel/src/billing.ts" ||
      /^(?:packages\/database\/src|src\/server\/db)\/schema\/(?:billing|enums)\.ts$/.test(path) ||
      path.startsWith("packages/services/src/invoice/") ||
      path.startsWith("src/server/services/invoice/"))
  ) {
    return false;
  }
  if (
    !capabilities.storage &&
    !capabilities.messaging &&
    /^(?:apps\/web\/)?src\/lib\/storage(?:-server)?\.ts$/.test(path)
  ) {
    return false;
  }
  if (
    !capabilities.notifications &&
    (/^(?:apps\/web\/)?src\/components\/NotificationBell\.tsx$/.test(path) ||
      /^(?:apps\/web\/)?src\/hooks\/use-notifications\.ts$/.test(path) ||
      /^(?:apps\/web\/)?src\/lib\/notifications\.ts$/.test(path))
  ) {
    return false;
  }
  if (
    !capabilities.featureFlags.enabled &&
    /^(?:apps\/web\/)?src\/lib\/feature-flags(?:-client)?\.ts$/.test(path)
  ) {
    return false;
  }
  if (
    !capabilities.messaging &&
    !capabilities.eve &&
    /^(?:apps\/web\/)?src\/components\/ui\/chat(?:\/.*)?\.tsx$/.test(path)
  ) {
    return false;
  }
  return true;
}

function removeBarrelExports(content: string, segments: readonly string[]): string {
  let result = content;
  for (const segment of segments) {
    result = result.replace(
      new RegExp(
        `^[ \\t]*export\\s+(?:(?:type\\s+)?\\{[^}]*\\}|\\*\\s*(?:as\\s+[A-Za-z_$][\\w$]*)?)\\s+from\\s+["']\\./${segment}(?:/[^"']*|\\.js)?["'];?[ \\t]*\\r?\\n?`,
        "gm",
      ),
      "",
    );
  }
  return result;
}

function sanitizeBarrel(path: string, content: string, config: ResolvedProjectConfig): string {
  if (path === "packages/kernel/src/index.ts") {
    const disabled = [
      ...(!config.capabilities.auth ? ["admin"] : []),
      ...(!config.capabilities.billing.enabled ? ["billing"] : []),
    ];
    return removeBarrelExports(content, disabled);
  }
  if (path === "packages/modules/src/index.ts" && !config.capabilities.auth) {
    const result = removeBarrelExports(content, ["identity"]);
    return /\bexport\b/.test(result) ? result : `${result.trimEnd()}\n\nexport {};\n`;
  }
  if (
    (path === "packages/services/src/index.ts" || path === "src/server/services/index.ts") &&
    !config.capabilities.billing.enabled
  ) {
    return removeBarrelExports(content, ["invoice"]);
  }
  return content;
}

function sanitizeAuthlessNavigation(content: string, config: ResolvedProjectConfig): string {
  if (config.capabilities.auth) return content;
  let result = content
    .replace(
      /\s*<Button\b(?:(?!<\/Button>)[\s\S])*?render=\{<Link\s+(?:href|to)="\/sign-(?:in|up)"\s*\/?>\}(?:(?!<\/Button>)[\s\S])*?<\/Button>/g,
      "",
    )
    .replace(
      /\s*<Link\s+(?:href|to)="\/(?:sign-in|sign-up|dashboard|settings|admin)"[^>]*>[\s\S]*?<\/Link>/g,
      "",
    )
    .replace(
      "authClient.signIn.email callbackURL /dashboard",
      "Optional capabilities compose through typed adapters",
    )
    .replace(" --billing stripe,chargily", "")
    .replace(/^.*Better Auth [^\r\n]*\r?\n/gm, "");
  if (!result.includes("<Link")) {
    result = result.replace(/^import Link from "next\/link";\r?\n/m, "");
    result = result.replace(/^import \{ Link \} from "@tanstack\/react-router";\r?\n/m, "");
  }
  if (!result.includes("<Button")) {
    result = result.replace(
      /^import \{ Button \} from ["']@\/components\/ui\/button["'];\r?\n/m,
      "",
    );
  }
  return result;
}

function removeEmptyModuleTestScripts(
  files: readonly TemplateFile[],
  file: TemplateFile,
): TemplateFile {
  if (file.path !== "packages/modules/package.json") return file;
  if (files.some(({ path }) => path.startsWith("packages/modules/tests/"))) return file;
  const manifest = JSON.parse(file.content) as { scripts?: Record<string, string> };
  if (manifest.scripts) {
    delete manifest.scripts.test;
    delete manifest.scripts["test:unit"];
  }
  return { ...file, content: `${JSON.stringify(manifest, null, 2)}\n` };
}

/** Remove legacy template residue that is not owned by any resolved capability. */
export function sanitizeLegacyCapabilityOutput(
  files: readonly TemplateFile[],
  config: ResolvedProjectConfig,
): TemplateFile[] {
  const retained = files.filter(({ path }) => keepFeatureFile(path, config));
  return retained.map((original) => {
    let file = removeEmptyModuleTestScripts(retained, original);
    let content = sanitizeLegacyCapabilityEnvironment(file.path, file.content, config);
    if (
      config.backend === false &&
      (file.path === "packages/database/src/index.ts" ||
        file.path === "packages/database/src/schema/index.ts")
    ) {
      content = sanitizeDatabaseNoneSurface(file.path, content, config);
    }
    content = sanitizeBarrel(file.path, content, config);
    if (file.path.includes("/components/marketing/")) {
      content = sanitizeAuthlessNavigation(content, config);
    }
    if (!config.capabilities.auth && /(?:^|\/)sitemap(?:\.ts|\.xml)$/.test(file.path)) {
      content = filterLines(
        content,
        (line) => !/\/(?:dashboard|settings|admin)(?:[\x60<])/u.test(line),
      );
    }
    if (/\.[cm]?ts$/.test(file.path) && content.trim().length === 0) {
      content = "export {};\n";
    }
    file = content === file.content ? file : { ...file, content };
    return file;
  });
}
