// @allow-long 422: one generated-document truth matrix shares route and manifest assertions across every corner
/**
 * Generated agent instructions are executable documentation: coding agents
 * treat them as authoritative and will otherwise "repair" a valid generated
 * project toward the wrong mode, framework, route layout, or package manager.
 */

import { describe, expect, it } from "bun:test";
import * as v from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const AGENT_DOC_PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/ghostinit.mdc",
  ".windsurf/rules/ghostinit.md",
] as const;

function cfg(partial: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    preset: "saas",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

const CORNERS: Array<{ label: string; config: ProjectConfig }> = [
  {
    label: "monorepo/next",
    config: cfg({ billing: ["stripe"], features: ["i18n", "eve"] }),
  },
  {
    label: "monorepo/tanstack",
    config: cfg({ framework: "tanstack-start", billing: ["stripe"], features: ["i18n"] }),
  },
  {
    label: "single/next",
    config: cfg({ mode: "single", billing: ["stripe"], features: ["i18n", "eve"] }),
  },
  {
    label: "single/tanstack",
    config: cfg({
      mode: "single",
      framework: "tanstack-start",
      billing: ["stripe"],
      features: ["i18n", "eve"],
    }),
  },
  {
    label: "single/tanstack-node-runtime",
    config: cfg({
      mode: "single",
      runtime: "node",
      framework: "tanstack-start",
    }),
  },
  {
    label: "monorepo/convex",
    config: cfg({ database: "convex", billing: [] }),
  },
  {
    label: "single/capabilities-off",
    config: cfg({
      mode: "single",
      preset: "custom",
      auth: false,
      api: false,
      email: false,
      analytics: false,
      database: "none",
    }),
  },
  {
    label: "monorepo/auth-without-api",
    config: cfg({
      preset: "custom",
      auth: true,
      api: false,
      email: false,
      analytics: false,
      database: "postgres",
    }),
  },
  {
    label: "monorepo/capability-rich",
    config: cfg({
      billing: ["stripe"],
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    }),
  },
];

function expectedRoutes(config: ProjectConfig): {
  routeRoot: string;
  rpc: string;
  auth: string;
  admin: string[];
  webhookPattern: string;
} {
  const prefix = config.mode === "single" ? "" : "apps/web/";
  if (config.framework === "tanstack-start") {
    const routeRoot = `${prefix}src/routes`;
    return {
      routeRoot,
      rpc: `${routeRoot}/api/rpc/$.ts`,
      auth: `${routeRoot}/api/auth/$.ts`,
      admin: [
        `${routeRoot}/admin.tsx`,
        `${routeRoot}/admin.users.tsx`,
        `${routeRoot}/admin.users.create.tsx`,
      ],
      webhookPattern: `${routeRoot}/api/webhooks/<provider>.ts`,
    };
  }

  const routeRoot = `${prefix}src/app`;
  return {
    routeRoot,
    rpc: `${routeRoot}/api/rpc/[...path]/route.ts`,
    auth: `${routeRoot}/api/auth/[...all]/route.ts`,
    admin: [
      `${routeRoot}/admin/page.tsx`,
      `${routeRoot}/admin/users/page.tsx`,
      `${routeRoot}/admin/users/create/page.tsx`,
    ],
    webhookPattern: `${routeRoot}/api/webhooks/<provider>/route.ts`,
  };
}

describe("generated agent instructions tell the truth", () => {
  for (const { label, config } of CORNERS) {
    describe(label, () => {
      const files = generateProjectFiles(config, { dryRun: true });
      const byPath = new Map(files.map((file) => [file.path, file.content]));
      const docs = AGENT_DOC_PATHS.map((path) => byPath.get(path)).filter(
        (content): content is string => typeof content === "string",
      );
      const packageJson = JSON.parse(byPath.get("package.json") ?? "{}") as {
        packageManager?: string;
        scripts?: Record<string, string>;
      };
      const routes = expectedRoutes(config);
      const hasApi = byPath.has(routes.rpc);
      const hasAuth = byPath.has(routes.auth);
      const hasAdmin = routes.admin.every((path) =>
        path.endsWith("/") ? files.some((file) => file.path.startsWith(path)) : byPath.has(path),
      );

      it("emits all supported agent instruction files", () => {
        expect(docs).toHaveLength(AGENT_DOC_PATHS.length);
      });

      it("uses the canonical Bun SSOT and never prescribes an npm command", () => {
        expect(packageJson.packageManager).toBe(`bun@${v.runtime.bun}`);
        for (const doc of docs) {
          expect(doc).toContain(`Bun ${v.runtime.bun}`);
          expect(doc).toContain(`packageManager: bun@${v.runtime.bun}`);
          expect(doc).not.toMatch(/(?:^|[`\s])npm\s+(?:ci|install|run|test|start|build)\b/m);
          expect(doc).not.toMatch(/(?:^|[`\s])npx\s+/m);
          expect(doc).not.toContain("@latest");
          if (config.apps.includes("web")) {
            expect(doc).toContain(`bunx --bun shadcn@${v.ui.shadcn} add <component>`);
          }
        }
      });

      it("interpolates versions and placeholders from the generated SSOT", () => {
        for (const doc of docs) {
          expect(doc).not.toContain("${");
          expect(doc).not.toContain("__PROJECT_NAME__");
          const claims = [
            ...doc.matchAll(/\bTS\s+(\d+\.\d+\.\d+)|typescript[:\s]+(\d+\.\d+\.\d+)/gi),
          ]
            .map((match) => match[1] ?? match[2])
            .filter(Boolean);
          const nextWeb = config.apps.includes("web") && config.framework === "nextjs";
          const expected =
            nextWeb && config.mode === "monorepo"
              ? new Set([v.typescript.typescriptNext, v.typescript.typescript])
              : new Set([nextWeb ? v.typescript.typescriptNext : v.typescript.typescript]);
          expect(new Set(claims), `agent doc TypeScript claims`).toEqual(expected);
        }
      });

      it("agrees with the emitted mode and framework route tree", () => {
        const isTanstack = config.framework === "tanstack-start";
        const wrongRoot =
          config.mode === "single"
            ? isTanstack
              ? "src/app/"
              : "src/routes/"
            : isTanstack
              ? "apps/web/src/app/"
              : "apps/web/src/routes/";

        for (const doc of docs) {
          expect(doc).toContain(
            config.mode === "single" ? "Mode: single package" : "Mode: monorepo",
          );
          expect(doc).toContain(`${routes.routeRoot}/`);
          expect(doc).not.toContain(wrongRoot);
          if (isTanstack) {
            expect(doc).toContain(`TanStack Start ${v.tanstackStart["@tanstack/react-start"]}`);
            expect(doc).not.toContain("Next.js");
            expect(doc).not.toContain("App Router");
            expect(doc).not.toContain("next-intl");
            expect(doc).not.toContain("withEve");
            expect(doc).toContain("VITE_");
            expect(doc).not.toContain("NEXT_PUBLIC_");
          } else {
            expect(doc).toContain(`Next.js ${v.nextStack.next}`);
            expect(doc).not.toContain("TanStack Start");
            expect(doc).toContain("NEXT_PUBLIC_");
            expect(doc).not.toContain("VITE_");
          }
        }
      });

      it("claims the exact auth, RPC, admin, and webhook route shapes that exist", () => {
        for (const doc of docs) {
          if (hasApi) expect(doc).toContain(routes.rpc);
          else expect(doc).not.toContain(routes.rpc);
          if (hasAuth) expect(doc).toContain(routes.auth);
          else expect(doc).not.toContain(routes.auth);
          for (const adminRoute of routes.admin) {
            if (hasAdmin) expect(doc).toContain(adminRoute);
            else expect(doc).not.toContain(adminRoute);
          }
          if (config.billing.length > 0) expect(doc).toContain(routes.webhookPattern);
          else expect(doc).not.toContain(routes.webhookPattern);
        }

        if (config.billing.includes("stripe")) {
          expect(byPath.has(routes.webhookPattern.replace("<provider>", "stripe"))).toBe(true);
        }
      });

      it("only recommends Bun scripts that the generated manifest exposes", () => {
        const scripts = packageJson.scripts ?? {};
        for (const script of [
          "dev",
          "build",
          "start",
          "typecheck",
          "lint",
          "format:check",
          "test",
        ] as const) {
          expect(scripts[script], `missing generated script ${script}`).toBeDefined();
          for (const doc of docs) expect(doc).toContain(`bun run ${script}`);
        }
        if (config.framework === "tanstack-start" && config.mode === "single") {
          expect(scripts.typecheck).toBe("tsr generate && tsc --noEmit");
          for (const doc of docs) expect(doc).toContain("tsr generate && tsc --noEmit");
        }
      });

      it("states the exact selected web framework command implementations", () => {
        const manifestPath = config.mode === "single" ? "package.json" : "apps/web/package.json";
        const manifest = JSON.parse(byPath.get(manifestPath) ?? "{}") as {
          scripts?: Record<string, string>;
        };
        const scripts = manifest.scripts ?? {};
        const hasIntegratedSingleEve =
          config.mode === "single" &&
          (config.eve === true || (config.features ?? []).includes("eve"));
        if (config.framework === "tanstack-start") {
          const expectedStart = `${config.runtime === "node" ? "node" : "bun"} .output/server/index.mjs`;
          expect(scripts).toMatchObject({
            dev: "vite dev --port 3000",
            build: hasIntegratedSingleEve ? "bun scripts/build-with-eve.mjs" : "vite build",
            start: hasIntegratedSingleEve
              ? "bun --env-file=.env.local run start:production"
              : expectedStart,
            typecheck: "tsr generate && tsc --noEmit",
          });
          if (hasIntegratedSingleEve) {
            expect(scripts["build:web"]).toBe("vite build");
            expect(scripts["start:web"]).toBe(expectedStart);
          }
          for (const doc of docs) expect(doc).toContain(expectedStart);
        } else {
          const hasCustomNextServer =
            config.database === "postgres" &&
            config.messaging === true &&
            config.apps.includes("web");
          const hasEve = config.eve === true || (config.features ?? []).includes("eve");
          const bunNext = `bun${config.pdf ? " --preload @react-pdf/renderer" : ""} ./node_modules/next/dist/bin/next`;
          const expectedDev = hasEve
            ? "bun scripts/start-development.mjs"
            : hasCustomNextServer
              ? `bun ${config.mode === "single" ? "." : "../.."}/scripts/start-next-server.mjs ${config.runtime} dev`
              : config.runtime === "bun"
                ? `${bunNext} dev --webpack`
                : "next dev";
          const expectedBuild = `${hasCustomNextServer ? "bun run build:server && " : ""}${config.runtime === "bun" ? `${bunNext} build --webpack` : "next build"}`;
          expect(scripts.dev).toBe(expectedDev);
          expect(scripts.build).toBe(
            hasIntegratedSingleEve ? "bun scripts/build-with-eve.mjs" : expectedBuild,
          );
          if (hasIntegratedSingleEve) expect(scripts["build:web"]).toBe(expectedBuild);
          expect(scripts.typecheck).toBe("tsc --noEmit");
          for (const doc of docs) {
            expect(doc).toContain(expectedDev);
            expect(doc).toContain(expectedBuild);
            if (hasCustomNextServer) {
              expect(doc).toContain("oRPC WebSocket upgrade");
            } else {
              expect(doc).toContain("stock development server");
            }
          }
        }
      });

      it("does not state the generated hoisting policy backwards", () => {
        expect(byPath.get("bunfig.toml")).toMatch(/hoist\s*=\s*true/);
        for (const doc of docs) {
          expect(doc).not.toMatch(/hoist\s*(?:=\s*)?false/i);
        }
      });
    });
  }

  it("describes enabled capability families without leaking them into an off configuration", () => {
    const rich = generateProjectFiles(
      cfg({
        billing: ["stripe"],
        messaging: true,
        storage: true,
        notifications: true,
        featureFlags: "posthog",
        jobs: true,
        jobsUserFacingApi: true,
      }),
      { dryRun: true },
    );
    const off = generateProjectFiles(
      cfg({
        mode: "single",
        preset: "custom",
        auth: false,
        api: false,
        email: false,
        analytics: false,
        database: "none",
      }),
      { dryRun: true },
    );
    const richDoc = rich.find(({ path }) => path === "AGENTS.md")?.content ?? "";
    const offDoc = off.find(({ path }) => path === "AGENTS.md")?.content ?? "";

    expect(richDoc).toContain("messaging, storage, notifications, feature-flags, jobs");
    expect(richDoc).toContain("authenticated user-facing API");
    expect(offDoc).toContain("Enabled capabilities: foundation only");
    expect(offDoc).not.toContain("src/server/email");
    expect(offDoc).not.toContain("src/server/auth");
    expect(offDoc).not.toContain("src/server/api/contract");
  });

  it("documents the custom Next development server only for Postgres messaging", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const ordinary = generateProjectFiles(
        cfg({ mode, preset: "custom", messaging: false, storage: false }),
        { dryRun: true },
      );
      const messaging = generateProjectFiles(
        cfg({ mode, preset: "custom", messaging: true, storage: true }),
        { dryRun: true },
      );
      const manifestPath = mode === "single" ? "package.json" : "apps/web/package.json";
      const ordinaryManifest = JSON.parse(
        ordinary.find(({ path }) => path === manifestPath)?.content ?? "{}",
      ) as { scripts?: Record<string, string> };
      const messagingManifest = JSON.parse(
        messaging.find(({ path }) => path === manifestPath)?.content ?? "{}",
      ) as { scripts?: Record<string, string> };
      const ordinaryDoc = ordinary.find(({ path }) => path === "AGENTS.md")?.content ?? "";
      const messagingDoc = messaging.find(({ path }) => path === "AGENTS.md")?.content ?? "";

      expect(ordinaryManifest.scripts?.dev).toBe(
        "bun ./node_modules/next/dist/bin/next dev --webpack",
      );
      expect(ordinaryDoc).toContain("bun ./node_modules/next/dist/bin/next dev --webpack");
      expect(ordinaryDoc).not.toContain("oRPC WebSocket upgrade");
      const nextCommand = `bun ${mode === "single" ? "." : "../.."}/scripts/start-next-server.mjs bun dev`;
      expect(messagingManifest.scripts?.dev).toBe(nextCommand);
      expect(messagingDoc).toContain(nextCommand);
      expect(messagingDoc).toContain("oRPC WebSocket upgrade");
    }
  });

  it("describes mobile and desktop layouts without inventing a web route tree", () => {
    const targets = [
      {
        config: cfg({
          mode: "monorepo",
          preset: "custom",
          apps: ["mobile"],
          features: ["i18n"],
        }),
        marker: "apps/mobile",
      },
      {
        config: cfg({ mode: "monorepo", preset: "custom", apps: ["desktop"] }),
        marker: "apps/desktop",
      },
      {
        config: cfg({
          mode: "single",
          preset: "frontend",
          apps: ["mobile"],
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          features: ["i18n"],
        }),
        marker: "app/_layout.tsx",
      },
      {
        config: cfg({
          mode: "single",
          preset: "frontend",
          apps: ["desktop"],
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
        }),
        marker: "src/renderer/main.tsx",
      },
    ] as const;

    for (const target of targets) {
      const files = generateProjectFiles(target.config, { dryRun: true });
      const paths = files.map(({ path }) => path);
      const doc = files.find(({ path }) => path === "AGENTS.md")?.content ?? "";
      expect(
        paths.some((path) => path === target.marker || path.startsWith(`${target.marker}/`)),
      ).toBe(true);
      expect(doc).toContain("Web framework: not emitted because the web app is disabled");
      expect(doc).not.toContain("apps/web/");
      expect(doc).not.toContain("src/app/");
      expect(doc).not.toContain("src/routes/");
      expect(doc).not.toContain("next-intl");

      if (target.config.mode === "single" && target.config.apps[0] === "mobile") {
        const readme = files.find(({ path }) => path === "README.md")?.content ?? "";
        expect(doc).not.toContain("bun run start");
        expect(doc).toContain("external remote-backend selection is not implemented");
        expect(doc).not.toContain("src/server/");
        expect(readme).toContain("does not generate a backend host");
        expect(readme).toContain("--apps web,mobile");
        expect(readme).not.toContain("docker compose");
        expect(readme).not.toContain("db:migrate");
      }
      if (target.config.mode === "single" && target.config.apps[0] === "desktop") {
        const readme = files.find(({ path }) => path === "README.md")?.content ?? "";
        expect(doc).not.toContain("bun run test");
        expect(doc).not.toContain("bun run format:check");
        expect(doc).toContain("external remote-backend selection is not implemented");
        expect(doc).not.toContain("src/server/");
        expect(readme).toContain("does not generate a backend host");
        expect(readme).toContain("--apps web,desktop");
        expect(readme).not.toContain("docker compose");
        expect(readme).not.toContain("db:migrate");
      }
      if (target.config.apps[0] === "mobile") {
        expect(doc).toContain("EXPO_PUBLIC_");
        expect(doc).not.toContain("NEXT_PUBLIC_");
      } else {
        expect(doc).toContain("VITE_");
        expect(doc).toContain("DESKTOP_");
        expect(doc).not.toContain("NEXT_PUBLIC_");
      }
    }
  });

  it("does not claim jobs workers when no persistent database can emit them", () => {
    const files = generateProjectFiles(
      cfg({
        mode: "monorepo",
        preset: "custom",
        auth: false,
        api: false,
        email: false,
        analytics: false,
        database: "none",
        jobs: true,
      }),
      { dryRun: true },
    );
    const packageJson = JSON.parse(
      files.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { scripts?: Record<string, string> };
    const doc = files.find(({ path }) => path === "AGENTS.md")?.content ?? "";

    expect(
      Object.keys(packageJson.scripts ?? {}).filter((name) => name.startsWith("jobs:")),
    ).toEqual([]);
    expect(doc).not.toContain("worker/scheduler scripts");
    expect(doc).not.toContain("jobs, ");
  });
});
