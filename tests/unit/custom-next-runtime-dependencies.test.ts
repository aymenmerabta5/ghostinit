import { describe, expect, test } from "bun:test";
import { customNextRuntimeDependencies } from "../../src/templates/modes/monorepo/custom-next-dependencies.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function generate(mode: "monorepo" | "single", runtime: "bun" | "node", messaging = true) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "custom-runtime-dependencies",
      mode,
      runtime,
      framework: "nextjs",
      preset: "custom",
      database: "postgres",
      apps: ["web"],
      auth: true,
      api: true,
      email: true,
      analytics: true,
      eve: true,
      i18n: true,
      pdf: true,
      messaging,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      billing: ["stripe", "chargily"],
      deploy: "docker",
    }),
    { dryRun: true },
  );
}

function dependencies(files: ReturnType<typeof generate>, path: string): Record<string, string> {
  const source = files.find((entry) => entry.path === path)?.content;
  if (!source) throw new Error("Missing " + path);
  return JSON.parse(source).dependencies;
}

describe("custom Next server runtime dependency ownership", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      test(
        mode + "/" + runtime + " declares dependencies imported by bundled workspace code",
        () => {
          const files = generate(mode, runtime);
          const manifest = dependencies(
            files,
            mode === "single" ? "package.json" : "apps/web/package.json",
          );
          for (const name of [
            "@orpc/contract",
            "@orpc/zod",
            "pg",
            "@t3-oss/env-core",
            "@better-auth/core",
            "@better-auth/passkey",
            "react-email",
            "resend",
            "@aws-sdk/client-s3",
          ]) {
            expect(manifest[name], name).toBeString();
          }
        },
      );
    }
  }

  test("stock Next keeps runtime dependencies owned by their workspace packages", () => {
    const files = generate("monorepo", "bun", false);
    expect(dependencies(files, "packages/api/package.json")["@orpc/contract"]).toBeString();
    expect(dependencies(files, "apps/web/package.json")["@orpc/contract"]).toBeUndefined();
  });
});

describe("custom Next dependency graph safeguards", () => {
  function manifest(name: string, runtime: Record<string, string>, devDependencies = {}) {
    return JSON.stringify({ name, dependencies: runtime, devDependencies });
  }
  test("includes transitive runtime dependencies through cycles without leaking unrelated packages or development tools", () => {
    const files = [
      { path: "apps/web/package.json", content: manifest("web", { "@repo/api": "workspace:*" }) },
      {
        path: "packages/api/package.json",
        content: manifest(
          "@repo/api",
          { "@repo/services": "workspace:*" },
          { "dev-only": "1.0.0" },
        ),
      },
      {
        path: "packages/services/package.json",
        content: manifest("@repo/services", {
          "@repo/api": "workspace:*",
          "runtime-sdk": "^1.0.0",
        }),
      },
      {
        path: "packages/unused/package.json",
        content: manifest("@repo/unused", { "unused-sdk": "1.0.0" }),
      },
    ];
    const original = JSON.stringify(files);
    const result = customNextRuntimeDependencies(files);
    expect(JSON.parse(result[0]!.content).dependencies).toEqual({
      "@repo/api": "workspace:*",
      "runtime-sdk": "1.0.0",
    });
    expect(JSON.stringify(files)).toBe(original);
  });
  test("rejects incompatible vendor versions rather than silently choosing one for the bundle", () => {
    const files = [
      {
        path: "apps/web/package.json",
        content: manifest("web", { "@repo/api": "workspace:*", "runtime-sdk": "2.0.0" }),
      },
      {
        path: "packages/api/package.json",
        content: manifest("@repo/api", { "runtime-sdk": "1.0.0" }),
      },
    ];
    expect(() => customNextRuntimeDependencies(files)).toThrow(
      "conflicting runtime dependency versions: runtime-sdk",
    );
  });
  test("rejects a missing workspace manifest before generation can produce a broken runtime", () => {
    expect(() =>
      customNextRuntimeDependencies([
        {
          path: "apps/web/package.json",
          content: manifest("web", { "@repo/missing": "workspace:*" }),
        },
      ]),
    ).toThrow("no workspace manifest: @repo/missing");
  });
});

test("minimal Postgres messaging does not pull dependencies from disabled capabilities", () => {
  const files = generateProjectFiles(
    projectConfigSchema.parse({
      name: "minimal-messaging",
      mode: "monorepo",
      runtime: "bun",
      framework: "nextjs",
      preset: "custom",
      database: "postgres",
      apps: ["web"],
      billing: [],
      messaging: true,
      email: false,
      analytics: false,
      pdf: false,
      features: [],
    }),
    { dryRun: true },
  );
  const web = dependencies(files, "apps/web/package.json");
  expect(web["@orpc/contract"]).toBeString();
  expect(web.pg).toBeString();
  for (const name of [
    "resend",
    "react-email",
    "stripe",
    "@chargily/chargily-pay",
    "posthog-node",
    "@react-pdf/renderer",
  ]) {
    expect(web[name], name).toBeUndefined();
  }
});
