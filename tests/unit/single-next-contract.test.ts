import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const filesConfig = projectConfigSchema.parse({
  name: "demo",
  runtime: "bun",
  version: "0.1.0",
  mode: "single",
  billing: ["stripe"],
  features: [],
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
});
const files = generateProjectFiles(filesConfig);
const read = (path: string): string => files.find((file) => file.path === path)?.content ?? "";

describe("single Next boundary contracts", () => {
  test("uses local typed env for flags", () => {
    const server = read("src/lib/feature-flags.ts");
    const client = read("src/lib/feature-flags-client.ts");
    expect(server).toContain('from "@/lib/env"');
    expect(server).toContain('env.ANALYTICS_DISABLED !== "true"');
    expect(client).toContain('from "@/lib/env"');
    expect(client).toContain('env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true"');
    expect(`${server}\n${client}`).not.toContain("as unknown as");
  });

  test("TanStack client flags use only the VITE public key", () => {
    const tanstackFiles = generateProjectFiles(
      projectConfigSchema.parse({
        ...filesConfig,
        framework: "tanstack-start",
      }),
    );
    const client =
      tanstackFiles.find(({ path }) => path === "src/lib/feature-flags-client.ts")?.content ?? "";
    expect(client).toContain('env.VITE_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain("NEXT_PUBLIC_ANALYTICS_DISABLED");

    const manifest = JSON.parse(
      tanstackFiles.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@t3-oss/env-core"]).toBeDefined();
    expect(manifest.dependencies?.["@t3-oss/env-nextjs"]).toBeUndefined();
  });

  test("auth sends the typed ResetPassword component", () => {
    const source = read("src/server/auth/index.ts");
    expect(source).toContain(
      'import ResetPasswordEmail from "@/server/email/templates/ResetPassword"',
    );
    expect(source).toContain("await sendEmail(user.email, subject, ResetPasswordEmail,");
    expect(source).not.toContain("forgotPasswordTemplate");
    expect(read("src/server/email/send.ts")).not.toContain("sendEmailHtml");
  });

  test("does not emit unused Motion output or workspace aliases", () => {
    expect(read("src/lib/animations.ts")).toBe("");
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.values(manifest.dependencies ?? {})).not.toContain("workspace:*");
    expect(Object.values(manifest.devDependencies ?? {})).not.toContain("workspace:*");
  });

  test("composes API and analytics only when their capabilities are enabled", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const disabled = generateProjectFiles(
        projectConfigSchema.parse({
          ...filesConfig,
          framework,
          preset: "custom",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          billing: [],
        }),
      );
      const enabled = generateProjectFiles(
        projectConfigSchema.parse({
          ...filesConfig,
          framework,
          preset: "custom",
          auth: false,
          api: true,
          email: false,
          analytics: true,
          billing: [],
        }),
      );
      const disabledPaths = disabled.map(({ path }) => path);
      const enabledPaths = enabled.map(({ path }) => path);
      const disabledSource = disabled.map(({ content }) => content).join("\n");
      const enabledSource = enabled.map(({ content }) => content).join("\n");
      const disabledManifest = JSON.parse(
        disabled.find(({ path }) => path === "package.json")?.content ?? "{}",
      ) as { dependencies?: Record<string, string> };

      expect(disabledPaths.some((path) => path.startsWith("src/server/api/"))).toBe(false);
      expect(disabledPaths.some((path) => path.includes("/api/"))).toBe(false);
      expect(disabledPaths).not.toContain("src/lib/orpc.ts");
      expect(disabledPaths.some((path) => path.includes("analytics"))).toBe(false);
      expect(disabledSource).not.toContain("PostHogProvider");
      expect(disabledSource).not.toContain("@orpc/");
      expect(disabledManifest.dependencies?.["@orpc/server"]).toBeUndefined();
      expect(disabledManifest.dependencies?.["posthog-js"]).toBeUndefined();
      expect(enabledPaths.some((path) => path.startsWith("src/server/api/"))).toBe(true);
      expect(enabledPaths.some((path) => path.includes("analytics"))).toBe(true);
      expect(enabledSource).toContain("@orpc/");
      expect(enabledSource).toContain("PostHogProvider");
      const enabledProvider =
        enabled.find(({ path }) => path === "src/components/providers.tsx")?.content ?? "";
      expect(enabledProvider).toContain("PostHogProvider");
      expect(enabledProvider).toContain("<PostHogProvider>");
      const disabledProvider =
        disabled.find(({ path }) => path === "src/components/providers.tsx")?.content ?? "";
      expect(disabledProvider).not.toContain("PostHogProvider");
    }
  });

  test("does not emit nested package boundaries in any single framework", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const generated = generateProjectFiles(
        projectConfigSchema.parse({ ...filesConfig, framework }),
      );
      expect(
        generated.filter(({ path }) => path.endsWith("package.json")).map(({ path }) => path),
      ).toEqual(["package.json"]);
      expect(generated.map(({ content }) => content).join("\n")).not.toContain("workspace:*");
    }
  });

  test("derives auth and API requirements for independent capability selections", () => {
    const cases = [
      { key: "api-on-auth-off", auth: false, api: true, billing: [] as string[] },
      { key: "billing-on-api-off", auth: false, api: false, billing: ["stripe"] },
    ];
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const capabilityCase of cases) {
          const generated = generateProjectFiles(
            projectConfigSchema.parse({
              ...filesConfig,
              framework,
              database,
              preset: "custom",
              auth: capabilityCase.auth,
              api: capabilityCase.api,
              email: false,
              analytics: false,
              billing: capabilityCase.billing,
            }),
          );
          const key = `${framework}/${database}/${capabilityCase.key}`;
          const paths = generated.map(({ path }) => path);
          const manifest = JSON.parse(
            generated.find(({ path }) => path === "package.json")?.content ?? "{}",
          ) as { dependencies?: Record<string, string> };
          expect(paths, key).toContain("src/server/auth/index.ts");
          expect(paths, key).toContain("src/lib/auth-client.ts");
          expect(paths, key).toContain("src/server/api/index.ts");
          expect(paths, key).toContain("src/lib/orpc.ts");
          expect(manifest.dependencies?.["@orpc/server"], key).toBeDefined();
          expect(manifest.dependencies?.["better-auth"], key).toBeDefined();
          if (capabilityCase.billing.length > 0) {
            const route =
              framework === "nextjs"
                ? "src/app/api/billing/subscriptions/route.ts"
                : "src/routes/api/billing/subscriptions.ts";
            expect(paths, key).toContain(route);
            if (database === "convex") {
              expect(
                generated.find(({ path }) => path === route)?.content ?? "",
                key,
              ).not.toContain("drizzle-orm");
            }
          }
        }
      }
    }
  });
});
