import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan, generateProjectFiles } from "../../src/templates/default.js";
import * as versions from "../../packages/versions/src/index.js";

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function generate(partial: Partial<ProjectConfig>) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "dependency-closure",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      preset: "custom",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      billing: [],
      apps: ["web"],
      ...partial,
    }),
  );
}

function manifest(files: ReturnType<typeof generate>, path: string): Manifest {
  const source = files.find((entry) => entry.path === path)?.content;
  expect(source, path).toBeDefined();
  return JSON.parse(source ?? "{}") as Manifest;
}

function expectPin(actual: string | undefined, expected: string): void {
  expect(actual?.replace(/^[~^]/, "")).toBe(expected);
}

function expectTypeScriptToParse(files: ReturnType<typeof generate>, key: string): void {
  const errors = files.flatMap((entry) => {
    if (!/\.tsx?$/.test(entry.path)) return [];
    return parseSync(entry.path, entry.content).errors.map(
      (error) => `${entry.path}: ${error.message}`,
    );
  });
  expect(errors, key).toEqual([]);
}

describe("generated dependency and file closure", () => {
  test("PDF declares each package at the workspace that imports it", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generate({
        framework,
        pdf: true,
        apps: ["web", "mobile", "desktop"],
      });
      const web = manifest(files, "apps/web/package.json");
      const mobile = manifest(files, "apps/mobile/package.json");
      const pdf = manifest(files, "packages/pdf/package.json");
      expectTypeScriptToParse(files, `monorepo/${framework}/pdf`);

      expect(web.dependencies?.["@repo/pdf"], framework).toBe("workspace:*");
      expectPin(web.dependencies?.["@react-pdf/renderer"], versions.pdf["@react-pdf/renderer"]);
      expectPin(mobile.dependencies?.["expo-file-system"], versions.expo["expo-file-system"]);
      expectPin(mobile.dependencies?.["expo-sharing"], versions.expo["expo-sharing"]);
      expectPin(pdf.dependencies?.react, versions.nextStack.react);
      expect(files.some((entry) => entry.path === "apps/mobile/src/hooks/usePdf.ts")).toBe(true);
      expect(
        files.some((entry) =>
          framework === "nextjs"
            ? entry.path === "apps/web/src/app/api/pdf/route.ts"
            : entry.path === "apps/web/src/routes/api/pdf.ts",
        ),
      ).toBe(true);
    }
  });

  test("single-mode PDF stays inside the root install boundary", () => {
    const targets = [
      { framework: "nextjs" as const, app: "web" as const },
      { framework: "tanstack-start" as const, app: "web" as const },
      { framework: "nextjs" as const, app: "mobile" as const },
      { framework: "nextjs" as const, app: "desktop" as const },
    ];
    for (const target of targets) {
      const files = generate({
        mode: "single",
        framework: target.framework,
        pdf: true,
        apps: [target.app],
      });
      const root = manifest(files, "package.json");
      const packageFiles = files.filter((entry) => entry.path.endsWith("package.json"));
      expectTypeScriptToParse(files, `single/${target.framework}/${target.app}/pdf`);

      expect(
        packageFiles.map((entry) => entry.path),
        `${target.framework}/${target.app}`,
      ).toEqual(["package.json"]);
      expectPin(root.dependencies?.["@react-pdf/renderer"], versions.pdf["@react-pdf/renderer"]);
      expectPin(root.dependencies?.["dejavu-fonts-ttf"], versions.pdf["dejavu-fonts-ttf"]);
      expectPin(root.dependencies?.qrcode, versions.pdf.qrcode);
      expectPin(root.devDependencies?.["@types/qrcode"], versions.pdf["@types/qrcode"]);
      expect(
        files.some((entry) => entry.path === "src/server/pdf/src/client/usePdf.ts"),
        `${target.framework}/${target.app}`,
      ).toBe(false);
      if (target.app === "web") {
        const hook = files.find((entry) => entry.path === "src/hooks/usePdf.ts")?.content ?? "";
        expect(hook, `${target.framework}/${target.app}`).toContain("export function usePdf(");
        expect(hook, `${target.framework}/${target.app}`).not.toContain("usePdfMobile");
      }
      if (target.app === "mobile") {
        expectPin(root.dependencies?.["expo-file-system"], versions.expo["expo-file-system"]);
        expectPin(root.dependencies?.["expo-sharing"], versions.expo["expo-sharing"]);
        expectPin(root.dependencies?.["server-only"], versions.runtime["server-only"]);
        expect(files.some((entry) => entry.path === "src/hooks/usePdfMobile.ts")).toBe(true);
        expect(
          files.find((entry) => entry.path === "src/hooks/usePdfMobile.ts")?.content,
        ).toContain("export function usePdfMobile(");
      }
      if (target.app === "desktop") {
        expect(files.some((entry) => entry.path === "src/hooks/usePdf.ts")).toBe(false);
      }
    }
  });

  test("desktop messaging emits its card target and declares the admin kernel", () => {
    const monorepo = generate({
      messaging: true,
      apps: ["web", "desktop"],
    });
    const desktop = manifest(monorepo, "apps/desktop/package.json");
    expectTypeScriptToParse(monorepo, "monorepo/desktop/messaging");
    expect(desktop.dependencies?.["@repo/kernel"]).toBe("workspace:*");
    expect(
      monorepo.some((entry) => entry.path === "apps/desktop/src/renderer/components/ui/card.tsx"),
    ).toBe(true);
    const rendererRoot = "apps/desktop/src/renderer";
    const route = monorepo.find(
      (entry) => entry.path === `${rendererRoot}/routes/messages.tsx`,
    )?.content;
    const screen = monorepo.find(
      (entry) => entry.path === `${rendererRoot}/features/messaging/screen.tsx`,
    )?.content;
    const workspace = monorepo.find(
      (entry) =>
        entry.path === `${rendererRoot}/features/messaging/components/messaging-workspace-view.tsx`,
    )?.content;
    expect(route).toContain('import { MessagesScreen } from "@/features/messaging/screen"');
    expect(route).toContain('createFileRoute("/messages")({ component: MessagesScreen })');
    expect(screen).toContain(
      'import { MessagingWorkspaceView } from "./components/messaging-workspace-view"',
    );
    expect(screen).toContain("return <MessagingWorkspaceView");
    expect(workspace).toContain('from "@/components/ui/card"');
    expect(workspace).toContain("<Card>");
  });

  test("database none never installs or exposes Postgres tooling in single mode", () => {
    const targets = [
      { framework: "nextjs" as const, apps: ["web"] as const },
      { framework: "tanstack-start" as const, apps: ["web"] as const },
      { framework: "nextjs" as const, apps: ["mobile"] as const },
    ];
    for (const target of targets) {
      const files = generate({
        mode: "single",
        database: "none",
        auth: false,
        api: false,
        framework: target.framework,
        apps: [...target.apps],
      });
      const root = manifest(files, "package.json");
      const key = `${target.framework}/${target.apps[0]}`;
      expect(root.dependencies?.pg, key).toBeUndefined();
      expect(root.dependencies?.["drizzle-orm"], key).toBeUndefined();
      expect(root.devDependencies?.["@types/pg"], key).toBeUndefined();
      expect(root.devDependencies?.["drizzle-kit"], key).toBeUndefined();
      expect(root.scripts?.["db:generate"], key).toBeUndefined();
      expect(root.scripts?.["db:migrate"], key).toBeUndefined();
      expect(root.scripts?.["db:push"], key).toBeUndefined();
    }
  });

  test("fresh Convex projects bootstrap codegen imports before deployment setup", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generate({
        mode,
        database: "convex",
        billing: ["polar"],
        apps: ["web"],
      });
      const key = `${mode}/nextjs/convex`;
      expectTypeScriptToParse(files, key);
      for (const path of [
        "convex/_generated/api.d.ts",
        "convex/_generated/api.js",
        "convex/_generated/dataModel.d.ts",
        "convex/_generated/server.d.ts",
        "convex/_generated/server.js",
      ]) {
        expect(
          files.some((entry) => entry.path === path),
          `${key}/${path}`,
        ).toBe(true);
      }

      const api = files.find((entry) => entry.path === "convex/_generated/api.d.ts")?.content ?? "";
      const apiRuntime =
        files.find((entry) => entry.path === "convex/_generated/api.js")?.content ?? "";
      const dataModel =
        files.find((entry) => entry.path === "convex/_generated/dataModel.d.ts")?.content ?? "";
      const server =
        files.find((entry) => entry.path === "convex/_generated/server.d.ts")?.content ?? "";
      const serverRuntime =
        files.find((entry) => entry.path === "convex/_generated/server.js")?.content ?? "";
      expect(api).toContain("export declare const api: AnyApi");
      expect(api).toContain("export declare const components: AnyComponents");
      expect(apiRuntime).toContain("export const components = componentsGeneric()");
      expect(dataModel).toContain("DataModelFromSchemaDefinition<typeof schema>");
      expect(server).toContain("export declare const env: Record<string, string | undefined>");
      expect(serverRuntime).toContain("export const env = process.env");
    }

    const monorepo = generate({ database: "convex", billing: ["polar"], apps: ["web"] });
    const admin =
      monorepo.find(
        (entry) => entry.path === "packages/services/src/application/composition/admin.ts",
      )?.content ?? "";
    const convexBilling =
      monorepo.find((entry) => entry.path === "convex/billing.ts")?.content ?? "";
    const polar =
      monorepo.find((entry) => entry.path === "apps/web/src/app/api/webhooks/polar/route.ts")
        ?.content ?? "";
    expect(admin).toContain("interface ConvexPage");
    expect(admin).toContain("as ConvexPage");
    expect(convexBilling).not.toContain("const licenseKeyStatus =");
    expect(polar).toContain('catch { return new Response("Invalid polar signature"');

    const resolution = resolveCreateConfig({
      name: "convex-bootstrap-lifecycle",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: ["polar"],
      features: [],
      database: "convex",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "none",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    const generated = plan.files.filter(({ physicalPath }) =>
      physicalPath.startsWith("convex/_generated/"),
    );
    expect(generated.map(({ physicalPath }) => physicalPath).toSorted()).toEqual([
      "convex/_generated/api.d.ts",
      "convex/_generated/api.js",
      "convex/_generated/dataModel.d.ts",
      "convex/_generated/server.d.ts",
      "convex/_generated/server.js",
    ]);
    expect(generated.every(({ lifecycle }) => lifecycle === "seed-once")).toBe(true);
  });

  test("Convex web variants bridge auth structurally without assuming session role fields", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generate({
          mode,
          framework,
          database: "convex",
          billing: ["polar"],
          apps: ["web"],
        });
        expectTypeScriptToParse(files, `${mode}/${framework}/convex-auth-bridge`);
        const prefix = mode === "monorepo" ? "apps/web/" : "";
        const providerPath =
          mode === "monorepo"
            ? "apps/web/src/components/providers/convex-client-provider.tsx"
            : "src/components/providers.tsx";
        const provider = files.find((entry) => entry.path === providerPath)?.content ?? "";
        const header =
          files.find((entry) => entry.path === `${prefix}src/components/header.tsx`)?.content ?? "";
        const shell =
          files.find((entry) => entry.path === `${prefix}src/features/app-shell/app-shell.tsx`)
            ?.content ?? "";
        const sidebar =
          files.find((entry) => entry.path === `${prefix}src/components/workspace-sidebar.tsx`)
            ?.content ?? "";
        const navigation =
          files.find((entry) => entry.path === `${prefix}src/components/workspace-navigation.tsx`)
            ?.content ?? "";
        const identity =
          files.find((entry) => entry.path === `${prefix}src/components/workspace-identity.ts`)
            ?.content ?? "";
        const userMenu =
          files.find((entry) => entry.path === `${prefix}src/components/header-user-menu.tsx`)
            ?.content ?? "";

        expect(provider).toContain("ConvexProviderWithAuth");
        expect(provider).toContain("useAuth={useConvexBetterAuth}");
        expect(provider).toContain("betterAuthSessionId(session.data)");
        expect(provider).toContain("authClient.convex.token");
        expect(provider).not.toContain("ConvexBetterAuthProvider");
        expect(provider).not.toContain("as unknown as");
        expect(header).not.toMatch(/useQuery\(|useAuth\(|api\.users/);
        const shellQueries =
          files.find((entry) => entry.path === `${prefix}src/features/app-shell/queries.ts`)
            ?.content ?? "";
        const shellWorkflow =
          files.find((entry) => entry.path === `${prefix}src/features/app-shell/use-app-shell.ts`)
            ?.content ?? "";
        expect(shellQueries).toContain("const canonical = useQueryAuthSession()");
        expect(shellQueries).toContain(
          "canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.user",
        );
        expect(shellWorkflow).toContain("resolveWorkspaceIdentity(source)");
        expect(identity).toMatch(
          /if \(input.pending\)[\s\S]*if \(input.error\)[\s\S]*if \(input.user\)/,
        );
        expect(shell).toContain("<HeaderActions identity={identity}");
        expect(sidebar).toContain("identity={identity}");
        expect(navigation).toContain('identity.status !== "authenticated"');
        expect(navigation).toContain('const isAdmin = identity.user.role === "admin"');
        expect(navigation).toContain('item.label !== "admin" || isAdmin');
        expect(`${header}\n${shell}\n${sidebar}`).not.toContain("useQuery(api.users.me");
        expect(userMenu).toContain('user?.role === "admin"');
      }
    }

    const postgres = generate({
      mode: "single",
      framework: "tanstack-start",
      database: "postgres",
      billing: ["polar"],
      apps: ["web"],
    });
    expect(
      postgres.find((entry) => entry.path === "src/components/workspace-sidebar.tsx")?.content,
    ).toContain("identity={identity}");
  });

  test("TanStack Convex Polar installs only its framework-neutral SDK", () => {
    const files = generate({
      mode: "single",
      framework: "tanstack-start",
      database: "convex",
      billing: ["polar"],
      apps: ["web"],
    });
    const root = manifest(files, "package.json");
    expectPin(root.dependencies?.["@polar-sh/sdk"], versions.billing["@polar-sh/sdk"]);
    expect(root.dependencies?.["@polar-sh/nextjs"]).toBeUndefined();
    expect(root.dependencies?.next).toBeUndefined();
    for (const packageFile of files.filter((entry) => entry.path.endsWith("package.json"))) {
      expect(packageFile.content, packageFile.path).not.toContain("@polar-sh/nextjs");
    }
  });
});
