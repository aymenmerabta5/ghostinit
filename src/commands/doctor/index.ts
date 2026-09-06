// @allow-long 750: doctor checks and transaction-safe repair reporting share one command envelope
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ExitCode } from "../../lib/errors.js";
import {
  dotenvFieldsEqual,
  isDotenvDocumentationFileName,
  isRuntimeDotenvFileName,
  MAX_DOTENV_FILE_BYTES,
} from "../../lib/dotenv.js";
import { envelope, printJson } from "../../lib/json.js";
import { loadState } from "../../lib/state.js";
import { ghostinitVersion } from "../../templates/versions.js";
import type { GlobalOptions } from "../types.js";
import { loadEnvMap } from "./env.js";
import { collectToolVersions } from "./versions.js";
import { FsTransaction } from "../../lib/fs.js";
import {
  acquireEnvironmentLifecycleLease,
  environmentLifecycleGuidance,
  listEnvironmentLifecyclePaths,
  type EnvironmentLifecycleLease,
} from "../../lib/environment-lifecycle.js";
import { fixTurboEnv } from "../check.js";
import { acquireLock } from "../../lib/lock.js";
import type { State } from "../../lib/config.js";
import {
  checkDatabase,
  checkDatabaseConnectivity,
  checkSecretStrength,
  type Check,
} from "./checks.js";

function mintSecret(): string {
  return randomBytes(48).toString("base64url");
}

/** Unlike existsSync, lstat also reports a dangling symbolic-link entry. */
function hasFilesystemEntry(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    return (error as { code?: string }).code !== "ENOENT";
  }
}

function checkConfiguredValue(name: string, value: string | undefined, url = false): Check {
  const trimmed = value?.trim() ?? "";
  const generatedExamples = new Set([
    "dev:example-123",
    "https://example-123.convex.cloud",
    "https://example-123.convex.cloud/",
    "https://example-123.convex.site",
    "https://example-123.convex.site/",
  ]);
  const configured = Boolean(
    trimmed && !trimmed.startsWith("REPLACE_WITH") && !generatedExamples.has(trimmed),
  );
  if (!configured)
    return { name: name.toLowerCase(), ok: false, message: `${name} not configured` };
  if (!url) return { name: name.toLowerCase(), ok: true, message: `${name} is configured` };
  try {
    const parsed = new URL(trimmed);
    const localHttp =
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase());
    if (parsed.protocol !== "https:" && !localHttp) throw new Error();
    return { name: name.toLowerCase(), ok: true, message: `${name} is a valid URL` };
  } catch {
    return { name: name.toLowerCase(), ok: false, message: `${name} is not a valid HTTPS URL` };
  }
}

function cloudflareEnvironmentRoots(cwd: string, monorepo: boolean) {
  return [
    { absolute: cwd, prefix: "" },
    ...(monorepo ? [{ absolute: join(cwd, "apps", "web"), prefix: "apps/web/" }] : []),
  ];
}

function cloudflareRuntimeEnvironmentPaths(cwd: string, monorepo: boolean): string[] {
  const forbidden: string[] = [];
  for (const root of cloudflareEnvironmentRoots(cwd, monorepo)) {
    if (!hasFilesystemEntry(root.absolute)) {
      if (root.prefix !== "") continue;
      throw new Error("project root does not exist");
    }
    const metadata = lstatSync(root.absolute);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${root.prefix || "project root"} is not a safe directory`);
    }
    for (const entry of readdirSync(root.absolute, { withFileTypes: true })) {
      if (isRuntimeDotenvFileName(entry.name)) forbidden.push(`${root.prefix}${entry.name}`);
    }
  }
  return forbidden.sort();
}

function cloudflareUnsafeDocumentationEnvironmentPaths(cwd: string, monorepo: boolean): string[] {
  const unsafe: string[] = [];
  for (const root of cloudflareEnvironmentRoots(cwd, monorepo)) {
    if (!hasFilesystemEntry(root.absolute)) {
      if (root.prefix !== "") continue;
      throw new Error("project root does not exist");
    }
    const rootMetadata = lstatSync(root.absolute);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      throw new Error(`${root.prefix || "project root"} is not a safe directory`);
    }
    for (const entry of readdirSync(root.absolute, { withFileTypes: true })) {
      if (!isDotenvDocumentationFileName(entry.name)) continue;
      const metadata = lstatSync(join(root.absolute, entry.name));
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size > MAX_DOTENV_FILE_BYTES
      ) {
        unsafe.push(`${root.prefix}${entry.name}`);
      }
    }
  }
  return unsafe.sort();
}

function cloudflareEnvironmentCheck(cwd: string, monorepo: boolean): Check {
  try {
    const roots = cloudflareEnvironmentRoots(cwd, monorepo).map(({ absolute }) => absolute);
    const lifecycle = listEnvironmentLifecyclePaths(cwd);
    const unsafeDocumentation = cloudflareUnsafeDocumentationEnvironmentPaths(cwd, monorepo);
    const forbidden = cloudflareRuntimeEnvironmentPaths(cwd, monorepo);
    const localFiles = roots.map((root) => join(root, ".dev.vars"));
    const missing = localFiles.filter((path) => !hasFilesystemEntry(path));
    const unsafe = localFiles.filter((path) => {
      if (!hasFilesystemEntry(path)) return false;
      const metadata = lstatSync(path);
      return (
        !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DOTENV_FILE_BYTES
      );
    });
    const diverged =
      missing.length === 0 &&
      unsafe.length === 0 &&
      localFiles.length > 1 &&
      !dotenvFieldsEqual(readFileSync(localFiles[0], "utf8"), readFileSync(localFiles[1], "utf8"));
    return {
      name: "cloudflare-environment-files",
      ok:
        lifecycle.length === 0 &&
        unsafeDocumentation.length === 0 &&
        forbidden.length === 0 &&
        missing.length === 0 &&
        unsafe.length === 0 &&
        !diverged,
      message:
        lifecycle.length > 0
          ? environmentLifecycleGuidance(lifecycle)
          : unsafeDocumentation.length > 0
            ? `Unsafe or oversized Cloudflare environment documentation files: ${unsafeDocumentation.join(", ")}. Replace them with regular files no larger than 1 MiB before continuing.`
            : forbidden.length > 0
              ? `Forbidden Cloudflare runtime env files: ${forbidden.join(", ")}. Migrate local values to .dev.vars and production values to Workers Builds or Worker bindings, then remove the runtime dotenv files.`
              : missing.length > 0
                ? "Cloudflare local .dev.vars is missing"
                : unsafe.length > 0
                  ? "Cloudflare local .dev.vars is unsafe or exceeds 1 MiB"
                  : diverged
                    ? "Root and web .dev.vars files diverged"
                    : "Cloudflare local variables use .dev.vars",
      ...(lifecycle.length > 0 ||
      unsafeDocumentation.length > 0 ||
      forbidden.length > 0 ||
      missing.length > 0 ||
      unsafe.length > 0 ||
      diverged
        ? {
            meta: {
              lifecycle,
              unsafeDocumentation,
              forbidden,
              missing: missing.length,
              unsafe: unsafe.length,
              diverged,
            },
          }
        : {}),
    };
  } catch {
    return {
      name: "cloudflare-environment-files",
      ok: false,
      message: "Cloudflare local environment files could not be inspected safely",
    };
  }
}

async function resolvedProjectEnvironmentChecks(
  cwd: string,
  state: State,
  envVars: Record<string, string>,
  logger: GlobalOptions["logger"],
): Promise<Check[]> {
  const checks: Check[] = [];
  if (!state.resolvedConfig.apps.some(({ deploy }) => deploy === "cloudflare")) {
    try {
      const lifecycle = listEnvironmentLifecyclePaths(cwd);
      if (lifecycle.length > 0)
        checks.push({
          name: "environment-lifecycle",
          ok: false,
          message: environmentLifecycleGuidance(lifecycle),
        });
    } catch {
      checks.push({
        name: "environment-lifecycle",
        ok: false,
        message: "Environment lifecycle could not be inspected safely",
      });
    }
  }
  const webApp = state.resolvedConfig.apps.find(
    ({ target }) => target === "nextjs" || target === "tanstack-start",
  );
  const database =
    state.resolvedConfig.backend === false ? "none" : state.resolvedConfig.backend.database;

  if (state.resolvedConfig.capabilities.auth) {
    checks.push(checkSecretStrength("BETTER_AUTH_SECRET", envVars.BETTER_AUTH_SECRET_LENGTH));
    checks.push(checkConfiguredValue("BETTER_AUTH_URL", envVars.BETTER_AUTH_URL, true));
  }
  if (webApp?.target === "nextjs") {
    checks.push(checkConfiguredValue("NEXT_PUBLIC_APP_URL", envVars.NEXT_PUBLIC_APP_URL, true));
  } else if (webApp?.target === "tanstack-start") {
    checks.push(checkConfiguredValue("VITE_APP_URL", envVars.VITE_APP_URL, true));
  }

  if (database === "postgres") {
    checks.push(await checkDatabase(envVars));
    const pwLengthRaw = envVars.POSTGRES_PASSWORD_LENGTH;
    const pwLengthNum = pwLengthRaw === undefined ? 0 : Number.parseInt(pwLengthRaw, 10);
    const pwPresent = Number.isFinite(pwLengthNum) && pwLengthNum > 0;
    checks.push({
      name: "postgres_password",
      ok: pwPresent,
      message: pwPresent ? "POSTGRES_PASSWORD is set" : "POSTGRES_PASSWORD not set",
    });
    const connectivity = await checkDatabaseConnectivity(envVars, logger);
    if (connectivity) checks.push(connectivity);
  } else if (database === "convex") {
    checks.push(checkConfiguredValue("CONVEX_DEPLOYMENT", envVars.CONVEX_DEPLOYMENT));
    checks.push(checkConfiguredValue("CONVEX_URL", envVars.CONVEX_URL, true));
    const publicConvexKey =
      webApp?.target === "tanstack-start" ? "VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL";
    checks.push(checkConfiguredValue(publicConvexKey, envVars[publicConvexKey], true));
  }

  if (webApp?.deploy === "cloudflare") {
    checks.push(cloudflareEnvironmentCheck(cwd, state.resolvedConfig.mode === "monorepo"));
    if (database === "convex") {
      checks.push({
        name: "convex-deployment-environment",
        ok: true,
        message:
          "Remote Convex function environment is deployment-scoped and requires separate `bun --env-file=.dev.vars x --no-install convex env list` (plus explicit --prod) or dashboard verification; local .dev.vars does not configure it",
        meta: { manualRemoteVerificationRequired: true },
      });
    }
  }

  if (state.resolvedConfig.apps.some(({ target }) => target === "expo")) {
    const expoAppUrl = envVars.EXPO_PUBLIC_APP_URL;
    const expoApiUrl = envVars.EXPO_PUBLIC_API_URL;
    checks.push({
      name: "expo_public_app_url",
      ok: Boolean(expoAppUrl),
      message: expoAppUrl
        ? "EXPO_PUBLIC_APP_URL is set"
        : "EXPO_PUBLIC_APP_URL not set — device builds will fallback to http://localhost:3000 and fail in production",
    });
    if (!expoApiUrl && envVars.NODE_ENV !== "test") {
      checks.push({
        name: "expo_public_api_url",
        ok: false,
        message:
          "EXPO_PUBLIC_API_URL not set — Expo will use EXPO_PUBLIC_APP_URL or http://localhost:3000",
      });
    }
  }
  return checks;
}

async function fixEnvSecrets(
  cwd: string,
  _logger: GlobalOptions["logger"],
  options: {
    dryRun?: boolean;
    environmentFile?: ".env.local" | ".dev.vars";
    mirrorEnvironmentFile?: "apps/web/.dev.vars";
    cloudflare?: boolean;
    environmentLease?: EnvironmentLifecycleLease;
  } = {},
): Promise<{ fixed: string[]; wouldFix: string[]; messages: string[] }> {
  const fixed: string[] = [];
  const wouldFix: string[] = [];
  const messages: string[] = [];
  const environmentFile = options.environmentFile ?? ".env.local";
  const envLocalPath = join(cwd, environmentFile);
  const envExamplePath = join(cwd, ".env.example");
  const mirrorEnvironmentFile = options.mirrorEnvironmentFile;
  const mirrorPath = mirrorEnvironmentFile ? join(cwd, mirrorEnvironmentFile) : undefined;
  try {
    options.environmentLease?.assertIdle();
    const lifecycle = options.environmentLease ? [] : listEnvironmentLifecyclePaths(cwd);
    if (lifecycle.length > 0) {
      messages.push(environmentLifecycleGuidance(lifecycle));
      return { fixed, wouldFix, messages };
    }
  } catch (error) {
    messages.push(
      `Refused to inspect environment lifecycle: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { fixed, wouldFix, messages };
  }
  if (options.cloudflare) {
    try {
      const unsafeDocumentation = cloudflareUnsafeDocumentationEnvironmentPaths(
        cwd,
        Boolean(mirrorEnvironmentFile),
      );
      if (unsafeDocumentation.length > 0) {
        messages.push(
          `Refused to update ${environmentFile} while unsafe or oversized Cloudflare environment documentation files exist: ${unsafeDocumentation.join(", ")}. Replace them with regular files no larger than 1 MiB, then rerun doctor --fix. No local environment file was created or changed.`,
        );
        return { fixed, wouldFix, messages };
      }
      const forbidden = cloudflareRuntimeEnvironmentPaths(cwd, Boolean(mirrorEnvironmentFile));
      const legacyPaths = new Set([".env.local", "apps/web/.env.local"]);
      if (forbidden.some((path) => !legacyPaths.has(path))) {
        messages.push(
          `Refused to update ${environmentFile} while Cloudflare runtime dotenv files exist: ${forbidden.join(", ")}. Migrate every operator-owned value explicitly: local values to ${environmentFile}${mirrorEnvironmentFile ? ` and ${mirrorEnvironmentFile}` : ""}, production build variables to Workers Builds, and runtime values to Worker bindings or secrets. Remove the runtime dotenv files and rerun doctor --fix. No local environment file was created or changed.`,
        );
        return { fixed, wouldFix, messages };
      }
    } catch (error) {
      messages.push(
        `Refused to inspect Cloudflare runtime environment files safely: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { fixed, wouldFix, messages };
    }
  }
  const alternateEnvironmentFile = environmentFile === ".dev.vars" ? ".env.local" : ".dev.vars";
  const alternateMirrorEnvironmentFile = mirrorEnvironmentFile
    ? mirrorEnvironmentFile.replace(/\.dev\.vars$/, ".env.local")
    : undefined;
  const ambiguousPaths = [alternateEnvironmentFile, alternateMirrorEnvironmentFile].filter(
    (path): path is string => Boolean(path && hasFilesystemEntry(join(cwd, path))),
  );
  if (ambiguousPaths.length > 0) {
    messages.push(
      `Refused to update ${environmentFile} while alternate local environment files exist: ${ambiguousPaths.sort().join(", ")}. Move their values explicitly and remove the obsolete files first.`,
    );
    return { fixed, wouldFix, messages };
  }

  const selectedFiles = [
    { relative: environmentFile, absolute: envLocalPath },
    ...(mirrorEnvironmentFile && mirrorPath
      ? [{ relative: mirrorEnvironmentFile, absolute: mirrorPath }]
      : []),
  ];
  let unsafe: string[];
  try {
    unsafe = selectedFiles
      .filter(({ absolute }) => hasFilesystemEntry(absolute))
      .filter(({ absolute }) => {
        const metadata = lstatSync(absolute);
        return (
          !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DOTENV_FILE_BYTES
        );
      })
      .map(({ relative }) => relative);
  } catch (error) {
    messages.push(
      `Refused to inspect local environment files safely: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { fixed, wouldFix, messages };
  }
  if (unsafe.length > 0) {
    messages.push(`Refused to update unsafe local environment files: ${unsafe.sort().join(", ")}`);
    return { fixed, wouldFix, messages };
  }

  const environmentExists = hasFilesystemEntry(envLocalPath);
  const mirrorExists = mirrorPath ? hasFilesystemEntry(mirrorPath) : false;
  if (mirrorEnvironmentFile && environmentExists !== mirrorExists) {
    const source = environmentExists ? environmentFile : mirrorEnvironmentFile;
    const destination = environmentExists ? mirrorEnvironmentFile : environmentFile;
    messages.push(
      `Refused to guess a missing environment mirror. Copy ${source} to ${destination} without changing any key/value, then rerun doctor --fix.`,
    );
    return { fixed, wouldFix, messages };
  }

  let content: string | undefined;
  let originalContent: string | null = null;
  let originalMirrorContent: string | null = null;
  let createsEnvironment = false;
  let createsMirror = false;

  if (environmentExists) {
    try {
      originalContent = await readFile(envLocalPath, "utf-8");
      content = originalContent;
      if (mirrorPath && mirrorExists) {
        originalMirrorContent = await readFile(mirrorPath, "utf8");
        if (!dotenvFieldsEqual(originalMirrorContent, originalContent)) {
          messages.push(
            `Refused to update divergent ${environmentFile} and ${mirrorEnvironmentFile}`,
          );
          return { fixed, wouldFix, messages };
        }
      }
    } catch (error) {
      messages.push(
        `Refused to read local environment files safely: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { fixed, wouldFix, messages };
    }
  } else if (hasFilesystemEntry(envExamplePath)) {
    try {
      const exampleMetadata = lstatSync(envExamplePath);
      if (
        !exampleMetadata.isFile() ||
        exampleMetadata.isSymbolicLink() ||
        exampleMetadata.size > MAX_DOTENV_FILE_BYTES
      ) {
        messages.push("Refused to read an unsafe or oversized .env.example");
        return { fixed, wouldFix, messages };
      }
      content = await readFile(envExamplePath, "utf-8");
      createsEnvironment = true;
      createsMirror = Boolean(mirrorEnvironmentFile);
      wouldFix.push(environmentFile);
      if (mirrorEnvironmentFile) wouldFix.push(mirrorEnvironmentFile);
    } catch (err) {
      messages.push(
        `Failed to create ${environmentFile}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (content === undefined) return { fixed, wouldFix, messages };

  try {
    let changed = false;
    const repairedSecretLabels = new Set<string>();
    const replacements: Array<[RegExp, string]> = [
      [/REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS/g, "BETTER_AUTH_SECRET"],
      [/REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD/g, "POSTGRES_PASSWORD"],
      [/REPLACE_WITH_BETTER_AUTH_SECRET/g, "BETTER_AUTH_SECRET"],
    ];
    for (const [pattern, label] of replacements) {
      if (pattern.test(content)) {
        if (!wouldFix.includes(label)) wouldFix.push(label);
        repairedSecretLabels.add(label);
        if (!options.dryRun) content = content.replace(pattern, mintSecret());
        changed = true;
      }
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
    }
    // Also fix bare empty values: BETTER_AUTH_SECRET=  or POSTGRES_PASSWORD=
    const emptySecretLines = content.split("\n");
    let emptyFixed = false;
    const updatedLines = emptySecretLines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("BETTER_AUTH_SECRET=") && trimmed.split("=")[1].trim().length < 32) {
        const val = trimmed.split("=")[1].trim();
        if (val.length === 0 || val.startsWith("REPLACE_WITH")) {
          emptyFixed = true;
          repairedSecretLabels.add("BETTER_AUTH_SECRET");
          return options.dryRun ? line : `BETTER_AUTH_SECRET=${mintSecret()}`;
        }
      }
      if (trimmed.startsWith("POSTGRES_PASSWORD=") && trimmed.split("=")[1].trim().length < 8) {
        const val = trimmed.split("=")[1].trim();
        if (val.length === 0 || val.startsWith("REPLACE_WITH")) {
          emptyFixed = true;
          repairedSecretLabels.add("POSTGRES_PASSWORD");
          return options.dryRun ? line : `POSTGRES_PASSWORD=${mintSecret()}`;
        }
      }
      return line;
    });
    if (emptyFixed) {
      content = updatedLines.join("\n");
      changed = true;
      for (const label of repairedSecretLabels) {
        if (!wouldFix.includes(label)) wouldFix.push(label);
      }
    }

    if (options.dryRun && createsEnvironment) {
      messages.push(`Would create ${environmentFile} from .env.example`);
    }
    if (options.dryRun && createsMirror && mirrorEnvironmentFile) {
      messages.push(`Would create ${mirrorEnvironmentFile} from the same local values`);
    }
    if (options.dryRun) {
      for (const label of repairedSecretLabels) messages.push(`Would mint ${label}`);
    }

    if ((changed || createsEnvironment || createsMirror) && !options.dryRun) {
      const environmentLease = options.environmentLease ?? acquireEnvironmentLifecycleLease(cwd);
      try {
        environmentLease.assertIdle();
        if (options.cloudflare) {
          const unsafeDocumentation = cloudflareUnsafeDocumentationEnvironmentPaths(
            cwd,
            Boolean(mirrorEnvironmentFile),
          );
          if (unsafeDocumentation.length > 0) {
            throw new Error(
              `Cloudflare environment documentation became unsafe during repair: ${unsafeDocumentation.join(", ")}. No local environment file was changed.`,
            );
          }
          const appeared = cloudflareRuntimeEnvironmentPaths(cwd, Boolean(mirrorEnvironmentFile));
          if (appeared.length > 0) {
            throw new Error(
              `Cloudflare runtime dotenv files appeared during repair: ${appeared.join(", ")}. No local environment file was changed.`,
            );
          }
        }
        const tx = new FsTransaction(cwd);
        await tx.writeIfUnchanged(environmentFile, content, originalContent);
        if (mirrorEnvironmentFile) {
          await tx.writeIfUnchanged(mirrorEnvironmentFile, content, originalMirrorContent);
        }
        environmentLease.assertIdle();
        await tx.commit();
        fixed.push(...new Set(wouldFix));
        if (createsEnvironment) messages.push(`Created ${environmentFile} from .env.example`);
        if (createsMirror && mirrorEnvironmentFile) {
          messages.push(`Created ${mirrorEnvironmentFile} from the same local values`);
        }
        for (const label of repairedSecretLabels) messages.push(`Minted ${label}`);
      } finally {
        if (!options.environmentLease) environmentLease.release();
      }
    }
  } catch (err) {
    messages.push(`Failed to fix env secrets: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { fixed, wouldFix, messages };
}

export async function doctorCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const checks: Check[] = [];

  const { bun, node, tsc } = await collectToolVersions(options.cwd);

  checks.push({
    name: "bun",
    ok: bun.ok,
    message: bun.ok ? `Bun ${bun.version}` : "Bun not found",
  });
  checks.push({
    name: "node",
    ok: node.ok,
    message: node.ok ? `Node ${node.version}` : "Node not found",
  });
  checks.push({
    name: "typescript",
    ok: tsc.ok,
    message: tsc.ok ? `TypeScript ${tsc.version}` : "TypeScript not found",
  });
  checks.push({ name: "ghostinit-version", ok: true, message: `ghostinit ${ghostinitVersion}` });

  const state = await loadState(options.cwd);
  const usesCloudflare =
    state?.resolvedConfig.apps.some(({ deploy }) => deploy === "cloudflare") === true;
  const envVars = await loadEnvMap(options.cwd, { cloudflare: usesCloudflare });
  let environmentCheckStart = checks.length;
  let environmentCheckCount = 0;

  if (state) {
    checks.push({
      name: "ghostinit-state",
      ok: true,
      message: `Project state found for ${state.project.name}`,
    });
    environmentCheckStart = checks.length;
    const environmentChecks = await resolvedProjectEnvironmentChecks(
      options.cwd,
      state,
      envVars,
      options.logger,
    );
    checks.push(...environmentChecks);
    environmentCheckCount = environmentChecks.length;
  } else {
    checks.push({
      name: "ghostinit-state",
      ok: false,
      message: "No GhostInit project state found",
    });
  }

  const wantsFix = Boolean(options.fix);
  const fixed: string[] = [];
  const wouldFix: string[] = [];
  const fixMessages: string[] = [];

  if (wantsFix) {
    const lock = options.dryRun
      ? undefined
      : await acquireLock(options.cwd, options.logger, { force: options.force });
    let environmentLease: EnvironmentLifecycleLease | undefined;
    try {
      if (!options.dryRun) environmentLease = acquireEnvironmentLifecycleLease(options.cwd);
      else {
        const lifecycle = listEnvironmentLifecyclePaths(options.cwd);
        if (lifecycle.length > 0) throw new Error(environmentLifecycleGuidance(lifecycle));
      }
      const needsSecretFix = Boolean(
        state &&
        (state.resolvedConfig.capabilities.auth ||
          (state.resolvedConfig.backend !== false &&
            state.resolvedConfig.backend.database === "postgres")),
      );
      if (needsSecretFix || usesCloudflare) {
        const envFix = await fixEnvSecrets(options.cwd, options.logger, {
          dryRun: options.dryRun,
          environmentLease,
          environmentFile: usesCloudflare ? ".dev.vars" : ".env.local",
          cloudflare: usesCloudflare,
          mirrorEnvironmentFile:
            usesCloudflare && state?.resolvedConfig.mode === "monorepo"
              ? "apps/web/.dev.vars"
              : undefined,
        });
        if (envFix.fixed.length > 0) fixed.push(...envFix.fixed);
        wouldFix.push(...envFix.wouldFix);
        fixMessages.push(...envFix.messages);
      }
      environmentLease?.assertIdle();
      const turboFix = await fixTurboEnv(options.cwd, options.logger, {
        dryRun: options.dryRun,
      });
      if (turboFix.fixed) {
        fixed.push("turbo.json");
        fixMessages.push(turboFix.message);
      } else if (turboFix.wouldFix) {
        wouldFix.push("turbo.json");
        fixMessages.push(turboFix.message);
      } else if (turboFix.message) {
        fixMessages.push(turboFix.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fixMessages.push(message);
      checks.push({ name: "environment-repair", ok: false, message });
    } finally {
      try {
        environmentLease?.release();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fixMessages.push(message);
        checks.push({ name: "environment-lease-release", ok: false, message });
      }
      await lock?.release();
    }
    // Re-load and rebuild every environment-dependent check after a fix. In
    // particular, a newly created pair of .dev.vars mirrors must not leave the
    // pre-fix missing-file result behind in the final doctor envelope.
    if (fixed.length > 0 && state) {
      const reloaded = await loadEnvMap(options.cwd, { cloudflare: usesCloudflare });
      const refreshed = await resolvedProjectEnvironmentChecks(
        options.cwd,
        state,
        reloaded,
        options.logger,
      );
      checks.splice(environmentCheckStart, environmentCheckCount, ...refreshed);
    }
  }

  const requiredChecks = checks.filter((c) => {
    if (c.name === "database-connectivity") {
      const meta = c.meta as Record<string, unknown> | undefined;
      if (meta?.skipped) return false;
      if (meta?.optional) return false;
    }
    return true;
  });
  const allOk = requiredChecks.every((c) => c.ok);

  if (options.json) {
    printJson(
      envelope({
        success: allOk,
        exitCode: allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR,
        data: {
          checks,
          fixed: wantsFix ? fixed : undefined,
          wouldFix: wantsFix && options.dryRun ? [...new Set(wouldFix)] : undefined,
          fixMessages: wantsFix ? fixMessages : undefined,
        },
        error: allOk
          ? undefined
          : {
              message: "One or more required doctor checks failed",
              code: "GENERAL_ERROR",
              details: {
                failed: requiredChecks.filter((check) => !check.ok).map((check) => check.name),
              },
            },
        command: "doctor",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    if (wantsFix && options.dryRun && wouldFix.length > 0) {
      options.logger.info(`[dry-run] Would auto-fix: ${[...new Set(wouldFix)].join(", ")}`);
      for (const m of fixMessages) options.logger.info(m);
    } else if (wantsFix && fixed.length > 0) {
      options.logger.info(`Auto-fixed ${fixed.length} issue(s): ${fixed.join(", ")}`);
      for (const m of fixMessages) options.logger.info(m);
    } else if (wantsFix) {
      options.logger.info("No auto-fixable issues found.");
      for (const m of fixMessages) if (m) options.logger.info(m);
    }
    for (const check of checks) {
      options.logger[check.ok ? "info" : "error"](
        `[${check.ok ? "OK" : "FAIL"}] ${check.name}: ${check.message}`,
        ...(check.meta ? [{ meta: check.meta }] : []),
      );
    }
  }

  return allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
