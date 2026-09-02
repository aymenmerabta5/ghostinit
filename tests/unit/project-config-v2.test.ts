import { describe, expect, test } from "bun:test";
import { runtime } from "../../packages/versions/src/index.js";
import {
  desiredToProjectConfig,
  projectConfigToDesired,
  resolveDesiredProjectConfig,
} from "../../src/lib/project-config";
import { PROJECT_CONFIG_SCHEMA_URI } from "../../src/lib/config";
import type { DesiredProjectConfig } from "../../src/domain/project/config";
import { resolveCreateConfig } from "../../src/commands/create/resolution";

describe("V2 desired config compatibility projection", () => {
  test("preserves supported auth, transport, and internal jobs", () => {
    const desired: DesiredProjectConfig = {
      $schema: PROJECT_CONFIG_SCHEMA_URI,
      schemaVersion: 2,
      name: "closure-demo",
      mode: "monorepo",
      packageManager: { name: "bun", version: runtime.bun },
      apps: [{ id: "web", target: "nextjs", deploy: "none" }],
      backend: { hostApp: "web", executionRuntime: "bun", database: "postgres" },
      capabilities: {
        auth: true,
        transport: true,
        jobs: { userFacingApi: false },
      },
    };
    const resolved = resolveDesiredProjectConfig(desired);
    const legacy = desiredToProjectConfig(desired, undefined, resolved);
    expect(resolved.capabilities.auth).toBe(true);
    expect(resolved.capabilities.transport).toBe(true);
    expect(legacy.auth).toBe(true);
    expect(legacy.api).toBe(true);
    expect(legacy.jobs).toBe(true);
  });

  test("preserves TanStack Eve after its client binding was behaviorally verified", () => {
    const desired: DesiredProjectConfig = {
      $schema: PROJECT_CONFIG_SCHEMA_URI,
      schemaVersion: 2,
      name: "tanstack-eve-client",
      mode: "monorepo",
      packageManager: { name: "bun", version: runtime.bun },
      apps: [{ id: "web", target: "tanstack-start", deploy: "none" }],
      backend: { hostApp: "web", executionRuntime: "bun", database: "postgres" },
      capabilities: { eve: true },
    };
    const resolved = resolveDesiredProjectConfig(desired);
    expect(resolved.enabledCapabilities).toEqual(["auth", "eve", "transport"]);
    expect(resolved.apps).toEqual([{ id: "web", target: "tanstack-start", deploy: "none" }]);
  });

  test("preserves transport without auth through the legacy projection round trip", () => {
    const desired: DesiredProjectConfig = {
      $schema: PROJECT_CONFIG_SCHEMA_URI,
      schemaVersion: 2,
      name: "transport-only",
      mode: "single",
      packageManager: { name: "bun", version: runtime.bun },
      apps: [{ id: "web", target: "nextjs", deploy: "none" }],
      backend: { hostApp: "web", executionRuntime: "bun", database: "none" },
      capabilities: { transport: true, auth: false, cache: "none" },
    };
    const resolved = resolveDesiredProjectConfig(desired);
    const legacy = desiredToProjectConfig(desired, undefined, resolved);
    const roundTrip = projectConfigToDesired(legacy);

    expect(legacy).toMatchObject({ preset: "custom", api: true, auth: false, database: "none" });
    expect(roundTrip.capabilities).toMatchObject({ transport: true, auth: false });
    expect(resolveDesiredProjectConfig(roundTrip).enabledCapabilities).toEqual(["transport"]);
  });

  test("projects messaging onto the storage capability for attachment ownership", () => {
    const desired = projectConfigToDesired({
      name: "messaging-storage",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      preset: "custom",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      messaging: true,
      storage: false,
      billing: [],
      features: [],
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
    });
    expect(desired.capabilities.messaging).toBe(true);
    expect(desired.capabilities.storage).toBe(true);
  });

  test("preserves the user-facing jobs bit in the legacy-to-V2 projection", () => {
    const desired = projectConfigToDesired({
      name: "user-facing-jobs",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      apps: ["web"],
      preset: "custom",
      cache: "none",
      deploy: "none",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      jobs: true,
      jobsUserFacingApi: true,
      billing: [],
      features: [],
    });
    expect(desired.capabilities.jobs).toEqual({ userFacingApi: true });
  });

  test("canonicalizes an implicit custom native database to none and rejects an explicit one", () => {
    const common = {
      name: "native-custom",
      runtime: "bun" as const,
      mode: "single" as const,
      framework: "nextjs" as const,
      billing: [],
      features: [],
      database: "postgres" as const,
      apps: ["mobile"] as const,
      preset: "custom" as const,
      cache: "none" as const,
      deploy: "none" as const,
    };
    const implicit = resolveCreateConfig({ ...common, databaseWasExplicit: false });
    expect(implicit.ok).toBe(true);
    if (!implicit.ok) throw new Error(implicit.message);
    expect(implicit.config.database).toBe("none");
    expect(implicit.resolvedConfig.backend).toBe(false);

    const explicit = resolveCreateConfig({ ...common, databaseWasExplicit: true });
    expect(explicit).toEqual({
      ok: false,
      reason: "single-native-server-capabilities-unsupported",
      unsupportedSelections: ["database:postgres"],
      message:
        "Single-mode mobile is a frontend-only client target; GhostInit does not generate or select a backend host for it. Unsupported server-backed selections: database:postgres. External remote-backend host selection is not implemented. Use --preset frontend with optional analytics/i18n, or use --mode monorepo --apps web,mobile for generated backend capabilities",
    });
  });

  test("returns a typed capability deployment rejection for PDF on Vercel", () => {
    const result = resolveCreateConfig({
      name: "pdf-vercel",
      runtime: "bun",
      mode: "monorepo",
      framework: "tanstack-start",
      billing: [],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "custom",
      cache: "none",
      deploy: "vercel",
      withPdf: true,
    });
    expect(result).toEqual({
      ok: false,
      reason: "capability-deploy-binding-unsupported",
      message:
        "PDF admission is process-local and cannot enforce global concurrency or per-actor limits on vercel.",
    });
  });
});
