import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
  resolveProjectConfig,
  sha256,
} from "../../src/domain/project/index.js";
import type { DesiredCapabilities } from "../../src/domain/capabilities/index.js";

const root = resolve(import.meta.dir, "../..");

function desired(
  args: {
    readonly mode?: "monorepo" | "single";
    readonly apps?: DesiredProjectConfig["apps"];
    readonly backend?: DesiredProjectConfig["backend"];
    readonly capabilities?: DesiredCapabilities;
  } = {},
): DesiredProjectConfig {
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "demo",
    mode: args.mode ?? "single",
    packageManager: { name: "bun", version: runtime.bun },
    apps: args.apps ?? [{ id: "web", target: "nextjs", deploy: "none" }],
    backend: args.backend ?? {
      hostApp: "web",
      executionRuntime: "bun",
      database: "postgres",
    },
    capabilities: args.capabilities ?? {},
  };
}

function issueKey(issue: {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly capability: string | null;
  readonly message: string;
  readonly suggestion: string;
}): string {
  const rank = issue.severity === "error" ? "0" : "1";
  return [
    rank,
    issue.code,
    issue.path,
    issue.capability ?? "",
    issue.message,
    issue.suggestion,
  ].join("\u0000");
}

describe("V2 desired-state resolution", () => {
  test("fails closed for an unreviewed Cloudflare capability without a backend", () => {
    const result = resolveProjectConfig(
      desired({
        apps: [{ id: "web", target: "nextjs", deploy: "cloudflare" }],
        backend: false,
        capabilities: { auth: true },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-deploy-binding-unsupported",
        capability: "auth",
        path: "/apps/web/deploy",
      }),
    );
  });

  test("allows API transport without auth or persistence and preserves all none axes", () => {
    const result = resolveProjectConfig(
      desired({
        backend: { hostApp: "web", executionRuntime: "bun", database: "none" },
        capabilities: { transport: true, auth: false, cache: "none" },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["transport"]);
    expect(result.config.capabilities.auth).toBe(false);
    expect(result.config.capabilities.cache).toEqual({ enabled: false, provider: "none" });
    expect(result.config.apps[0]?.deploy).toBe("none");
    expect(result.config.backend).not.toBe(false);
    if (result.config.backend === false) throw new Error("Expected configured backend");
    expect(result.config.backend.database).toBe("none");
  });

  test("resolves retained Node execution independently of the Bun package manager", () => {
    const result = resolveProjectConfig(
      desired({
        backend: { hostApp: "web", executionRuntime: "node", database: "postgres" },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.packageManager).toEqual({ name: "bun", version: runtime.bun });
    expect(result.config.backend).not.toBe(false);
    if (result.config.backend === false) throw new Error("Expected configured backend");
    expect(result.config.backend.executionRuntime).toBe("node");
  });

  test("reports explicit messaging versus transport conflict deterministically", () => {
    const input = desired({ capabilities: { messaging: true, auth: true, transport: false } });
    const first = resolveProjectConfig(input);
    const second = resolveProjectConfig(input);

    expect(first.ok).toBe(false);
    expect(second).toEqual(first);
    expect(first.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-explicitly-disabled",
        capability: "messaging",
        path: "/capabilities/transport",
      }),
    );
    expect(first.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-explicitly-disabled",
        capability: "storage",
        path: "/capabilities/transport",
      }),
    );
    expect(first.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-implied",
        capability: "messaging",
        path: "/capabilities/storage",
      }),
    );
  });

  test("closes an omitted capability dependency and records the derivation", () => {
    const result = resolveProjectConfig(desired({ capabilities: { messaging: true, auth: true } }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual([
      "auth",
      "messaging",
      "storage",
      "transport",
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "capability-implied",
        capability: "messaging",
        path: "/capabilities/storage",
      }),
      expect.objectContaining({
        severity: "warning",
        code: "capability-implied",
        capability: "messaging",
        path: "/capabilities/transport",
      }),
    ]);
  });

  test("rejects an explicit messaging/storage contradiction deterministically", () => {
    const input = desired({
      capabilities: { messaging: true, auth: true, transport: true, storage: false },
    });
    const first = resolveProjectConfig(input);
    const second = resolveProjectConfig(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(false);
    expect(first.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "capability-explicitly-disabled",
        capability: "messaging",
        path: "/capabilities/storage",
      }),
    );
  });

  test("closes notifications over auth and transport", () => {
    const result = resolveProjectConfig(desired({ capabilities: { notifications: true } }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["auth", "notifications", "transport"]);
    expect(result.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "capability-implied", path: "/capabilities/auth" },
      { code: "capability-implied", path: "/capabilities/transport" },
    ]);
  });

  test("closes server-rendered PDF generation over auth and typed transport", () => {
    const result = resolveProjectConfig(desired({ capabilities: { pdf: true } }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["auth", "pdf", "transport"]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "capability-implied",
          capability: "pdf",
          path: "/capabilities/auth",
        }),
        expect.objectContaining({
          code: "capability-implied",
          capability: "pdf",
          path: "/capabilities/transport",
        }),
      ]),
    );

    const explicitlyPublic = resolveProjectConfig(
      desired({ capabilities: { pdf: true, auth: false } }),
    );
    expect(explicitlyPublic.ok).toBe(false);
    expect(explicitlyPublic.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-explicitly-disabled",
        capability: "pdf",
        path: "/capabilities/auth",
      }),
    );
  });

  test("closes actor-owned storage over auth, transport, and persistence", () => {
    const result = resolveProjectConfig(desired({ capabilities: { storage: true } }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["auth", "storage", "transport"]);
    expect(result.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "capability-implied", path: "/capabilities/auth" },
      { code: "capability-implied", path: "/capabilities/transport" },
    ]);

    const noPersistence = resolveProjectConfig(
      desired({
        backend: { hostApp: "web", executionRuntime: "bun", database: "none" },
        capabilities: { storage: true },
      }),
    );
    expect(noPersistence.ok).toBe(false);
    if (noPersistence.ok) throw new Error("Expected storage without persistence to fail");
    expect(noPersistence.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-requires-persistence",
        capability: "storage",
      }),
    );
  });

  test("rejects storage when auth or transport is explicitly disabled", () => {
    for (const capabilities of [
      { storage: true, auth: false },
      { storage: true, transport: false },
    ] satisfies DesiredCapabilities[]) {
      const result = resolveProjectConfig(desired({ capabilities }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected explicit storage dependency conflict");
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "capability-explicitly-disabled",
          capability: "storage",
        }),
      );
    }
  });

  test("models remote feature flags without treating static flags as a capability provider", () => {
    const result = resolveProjectConfig(
      desired({ capabilities: { featureFlags: { provider: "posthog" } } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["featureFlags", "transport"]);
    expect(result.config.capabilities.featureFlags).toEqual({ enabled: true, provider: "posthog" });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "capability-implied",
        capability: "featureFlags",
        path: "/capabilities/transport",
      }),
    ]);
  });

  test("requires transport for jobs only when their API is user-facing", () => {
    const internal = resolveProjectConfig(
      desired({ capabilities: { jobs: { userFacingApi: false } } }),
    );
    const userFacing = resolveProjectConfig(
      desired({ capabilities: { jobs: { userFacingApi: true } } }),
    );

    expect(internal.ok).toBe(true);
    expect(userFacing.ok).toBe(true);
    if (!internal.ok || !userFacing.ok) throw new Error("Expected both jobs configs to resolve");
    expect(internal.config.enabledCapabilities).toEqual(["jobs"]);
    expect(internal.issues).toEqual([]);
    expect(userFacing.config.enabledCapabilities).toEqual(["auth", "jobs", "transport"]);
    expect(userFacing.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: "jobs", path: "/capabilities/auth" }),
        expect.objectContaining({ capability: "jobs", path: "/capabilities/transport" }),
      ]),
    );
  });

  test("rejects jobs when the backend has no persistence", () => {
    const result = resolveProjectConfig(
      desired({
        backend: { hostApp: "web", executionRuntime: "bun", database: "none" },
        capabilities: { jobs: { userFacingApi: false } },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "capability-requires-persistence",
        capability: "jobs",
      }),
    ]);
  });

  test("rejects Postgres messaging on Vercel while keeping custom-server deploys", () => {
    const vercel = resolveProjectConfig(
      desired({
        apps: [{ id: "web", target: "nextjs", deploy: "vercel" }],
        capabilities: { messaging: true, auth: true, transport: true },
      }),
    );
    expect(vercel.ok).toBe(false);
    expect(vercel.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-deploy-binding-unsupported",
        capability: "messaging",
        path: "/apps/web/deploy",
      }),
    );

    for (const deploy of ["fly", "docker"] as const) {
      const supported = resolveProjectConfig(
        desired({
          apps: [{ id: "web", target: "nextjs", deploy }],
          capabilities: { messaging: true, auth: true, transport: true },
        }),
      );
      expect(supported.ok, deploy).toBe(true);
    }

    const convex = resolveProjectConfig(
      desired({
        apps: [{ id: "web", target: "nextjs", deploy: "vercel" }],
        backend: { hostApp: "web", executionRuntime: "bun", database: "convex" },
        capabilities: { messaging: true, auth: true, transport: true },
      }),
    );
    expect(convex.ok).toBe(true);
  });

  test("rejects Postgres jobs on Vercel while keeping persistent custom-server deploys", () => {
    const vercel = resolveProjectConfig(
      desired({
        apps: [{ id: "web", target: "nextjs", deploy: "vercel" }],
        capabilities: { jobs: { userFacingApi: false } },
      }),
    );
    expect(vercel.ok).toBe(false);
    if (vercel.ok) throw new Error("Expected Postgres jobs on Vercel to fail");
    expect(vercel.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-deploy-binding-unsupported",
        capability: "jobs",
        path: "/apps/web/deploy",
      }),
    );

    for (const deploy of ["fly", "docker"] as const) {
      const supported = resolveProjectConfig(
        desired({
          apps: [{ id: "web", target: "nextjs", deploy }],
          capabilities: { jobs: { userFacingApi: false } },
        }),
      );
      expect(supported.ok, deploy).toBe(true);
    }
  });

  test("rejects generated local Postgres storage on Vercel", () => {
    const vercel = resolveProjectConfig(
      desired({
        apps: [{ id: "web", target: "nextjs", deploy: "vercel" }],
        capabilities: { storage: true, auth: true, transport: true },
      }),
    );

    expect(vercel.ok).toBe(false);
    expect(vercel.issues).toContainEqual(
      expect.objectContaining({
        code: "capability-deploy-binding-unsupported",
        capability: "storage",
        path: "/apps/web/deploy",
      }),
    );

    for (const deploy of ["fly", "docker"] as const) {
      const supported = resolveProjectConfig(
        desired({
          apps: [{ id: "web", target: "nextjs", deploy }],
          capabilities: { storage: true, auth: true, transport: true },
        }),
      );
      expect(supported.ok, deploy).toBe(true);
    }
  });

  test("rejects process-local PDF admission on serverless fleets", () => {
    for (const database of ["postgres", "convex"] as const) {
      const vercel = resolveProjectConfig(
        desired({
          apps: [{ id: "web", target: "tanstack-start", deploy: "vercel" }],
          backend: { hostApp: "web", executionRuntime: "bun", database },
          capabilities: { pdf: true },
        }),
      );
      expect(vercel.ok, database).toBe(false);
      expect(vercel.issues, database).toContainEqual({
        severity: "error",
        code: "capability-deploy-binding-unsupported",
        path: "/apps/web/deploy",
        capability: "pdf",
        message:
          "PDF admission is process-local and cannot enforce global concurrency or per-actor limits on vercel.",
        suggestion:
          "Use the generated single-replica Fly or Docker profile, keep local execution to one web process, or add a shared transactional PDF admission adapter before scaling.",
      });

      for (const deploy of ["none", "fly", "docker"] as const) {
        const singleReplica = resolveProjectConfig(
          desired({
            apps: [{ id: "web", target: "tanstack-start", deploy }],
            backend: { hostApp: "web", executionRuntime: "bun", database },
            capabilities: { pdf: true },
          }),
        );
        expect(singleReplica.ok, `${database}/${deploy}`).toBe(true);
      }
    }
  });

  test("validates required client surfaces for every selected app", () => {
    const apps = [
      { id: "web", target: "nextjs", deploy: "none" },
      { id: "mobile", target: "expo", deploy: "none" },
    ] as const;
    const i18n = resolveProjectConfig(
      desired({ mode: "monorepo", apps, capabilities: { i18n: true } }),
    );
    expect(i18n.ok).toBe(true);

    const eve = resolveProjectConfig(
      desired({
        mode: "monorepo",
        apps: [
          { id: "web", target: "nextjs", deploy: "none" },
          { id: "console", target: "tanstack-start", deploy: "none" },
        ],
        capabilities: { eve: true },
      }),
    );
    expect(eve.ok).toBe(true);
    expect(eve.issues).not.toContainEqual(
      expect.objectContaining({ code: "capability-client-target-unsupported" }),
    );
    expect(eve.config?.enabledCapabilities).toEqual(["auth", "eve", "transport"]);
    expect(eve.issues).not.toContainEqual(
      expect.objectContaining({
        code: "capability-client-target-unsupported",
        path: "/apps/web/target",
      }),
    );

    const analytics = resolveProjectConfig(
      desired({ mode: "monorepo", apps, capabilities: { analytics: true } }),
    );
    expect(analytics.ok).toBe(true);

    const desktopAnalytics = resolveProjectConfig(
      desired({
        mode: "monorepo",
        apps: [...apps, { id: "desktop", target: "electron", deploy: "none" }],
        capabilities: { analytics: true },
      }),
    );
    expect(desktopAnalytics.ok).toBe(true);
  });

  test("does not impose client bindings on disabled or internal-only capabilities", () => {
    const result = resolveProjectConfig(
      desired({
        mode: "monorepo",
        apps: [
          { id: "web", target: "nextjs", deploy: "none" },
          { id: "desktop", target: "electron", deploy: "none" },
        ],
        capabilities: {
          analytics: false,
          i18n: false,
          jobs: { userFacingApi: false },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.config.enabledCapabilities).toEqual(["jobs"]);
  });

  test("canonicalizes set-like input ordering into one immutable hash", () => {
    const apps = [{ id: "web", target: "nextjs", deploy: "vercel" }] as const;
    const first = resolveProjectConfig(
      desired({
        mode: "monorepo",
        apps,
        capabilities: { billing: { providers: ["stripe", "chargily"] } },
      }),
    );
    const second = resolveProjectConfig(
      desired({
        mode: "monorepo",
        apps: [...apps].reverse(),
        capabilities: { billing: { providers: ["chargily", "stripe"] } },
      }),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected both configurations to resolve");
    expect(second.config).toEqual(first.config);
    expect(second.config.configHash).toBe(first.config.configHash);
    expect(first.config.apps.map(({ id }) => id)).toEqual(["web"]);
    expect(first.config.capabilities.billing.providers).toEqual(["chargily", "stripe"]);
    expect(Object.isFrozen(first.config)).toBe(true);
    expect(Object.isFrozen(first.config.apps)).toBe(true);
    expect(Object.isFrozen(first.config.capabilities.billing.providers)).toBe(true);
  });

  test("returns the complete issue set in a stable documented order", () => {
    const result = resolveProjectConfig(
      desired({
        mode: "single",
        apps: [
          { id: "web", target: "nextjs", deploy: "none" },
          { id: "web", target: "expo", deploy: "vercel" },
        ],
        backend: false,
        capabilities: {
          billing: { providers: [] },
          messaging: true,
          auth: false,
          transport: false,
        },
      }),
    );

    expect(result.ok).toBe(false);
    const codes = new Set(result.issues.map(({ code }) => code));
    expect(codes).toEqual(
      new Set([
        "billing-provider-required",
        "capability-explicitly-disabled",
        "capability-implied",
        "capability-requires-backend",
        "capability-requires-persistence",
        "capability-target-binding-missing",
        "duplicate-app-id",
        "single-mode-app-count",
        "unsupported-deploy-binding",
      ]),
    );
    const actualOrder = result.issues.map(issueKey);
    expect(actualOrder).toEqual([...actualOrder].sort());
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  test("uses a correct runtime-neutral SHA-256 and emits a schema-valid resolved manifest", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const input = desired();
    const resolved = resolveProjectConfig(input);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const inputSchema = JSON.parse(
      readFileSync(resolve(root, "schemas/project-config.schema.json"), "utf8"),
    );
    const resolvedSchema = JSON.parse(
      readFileSync(resolve(root, "schemas/resolved-project-config.schema.json"), "utf8"),
    );
    const validateInput = ajv.compile(inputSchema);
    const validateResolved = ajv.compile(resolvedSchema);
    const serializedInput = JSON.parse(JSON.stringify(input));
    const serializedResolved = JSON.parse(JSON.stringify(resolved.config));
    expect(validateInput(serializedInput), JSON.stringify(validateInput.errors)).toBe(true);
    expect(validateResolved(serializedResolved), JSON.stringify(validateResolved.errors)).toBe(
      true,
    );
    expect(serializedResolved).toEqual(resolved.config);

    const nodeInput = desired({
      backend: { hostApp: "web", executionRuntime: "node", database: "postgres" },
    });
    const nodeResolved = resolveProjectConfig(nodeInput);
    expect(nodeResolved.ok).toBe(true);
    if (!nodeResolved.ok) throw new Error(JSON.stringify(nodeResolved.issues));
    expect(validateInput(nodeInput), JSON.stringify(validateInput.errors)).toBe(true);
    expect(validateResolved(nodeResolved.config), JSON.stringify(validateResolved.errors)).toBe(
      true,
    );

    const staticProviderInput = {
      ...serializedInput,
      capabilities: { featureFlags: { provider: "static" } },
    };
    expect(validateInput(staticProviderInput)).toBe(false);

    const messagingInput = desired({ capabilities: { messaging: true } });
    expect(validateInput(messagingInput), JSON.stringify(validateInput.errors)).toBe(true);
    const messagingResolved = resolveProjectConfig(messagingInput);
    expect(messagingResolved.ok).toBe(true);
    if (!messagingResolved.ok) throw new Error(JSON.stringify(messagingResolved.issues));
    expect(messagingResolved.config.capabilities.storage).toBe(true);
    expect(messagingResolved.config.enabledCapabilities).toContain("storage");
    expect(
      validateResolved(messagingResolved.config),
      JSON.stringify(validateResolved.errors),
    ).toBe(true);

    const contradictoryInput = {
      ...messagingInput,
      capabilities: { ...messagingInput.capabilities, storage: false },
    };
    expect(validateInput(contradictoryInput)).toBe(false);
    const missingStorageCapability = {
      ...messagingResolved.config,
      capabilities: { ...messagingResolved.config.capabilities, storage: false },
      enabledCapabilities: messagingResolved.config.enabledCapabilities.filter(
        (capability) => capability !== "storage",
      ),
    };
    expect(validateResolved(missingStorageCapability)).toBe(false);
  });
});
