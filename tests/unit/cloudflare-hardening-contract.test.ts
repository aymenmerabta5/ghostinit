import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256,
  OPENNEXT_AWS_WINDOWS_PATCH_KEY,
  OPENNEXT_AWS_WINDOWS_PATCH_PATH,
  OPENNEXT_AWS_WINDOWS_PATCH_SHA256,
  OPENNEXT_AWS_WINDOWS_PATCH_VERSION,
} from "../../src/templates/root/cloudflare.js";
import {
  cloudflarePlan,
  generatedContent,
  type CloudflareMode,
} from "../helpers/cloudflare-runtime-fixture.js";

function appRoot(mode: CloudflareMode): string {
  return mode === "monorepo" ? "apps/web/" : "";
}

function json<T>(plan: ReturnType<typeof cloudflarePlan>, path: string): T {
  return JSON.parse(generatedContent(plan, path)) as T;
}

describe("Cloudflare deterministic resource identities", () => {
  test("long shared prefixes retain deterministic collision-resistant Worker and R2 names", () => {
    const sharedPrefix = `a${"b".repeat(80)}`;
    const firstName = `${sharedPrefix}-one`;
    const secondName = `${sharedPrefix}-two`;
    const render = (name: string) =>
      json<{
        name: string;
        r2_buckets: readonly [{ readonly bucket_name: string }];
      }>(cloudflarePlan({ framework: "nextjs", name }), "wrangler.jsonc");

    const first = render(firstName);
    const repeated = render(firstName);
    const second = render(secondName);

    expect(first).toEqual(repeated);
    expect(first.name).not.toBe(second.name);
    expect(first.r2_buckets[0].bucket_name).not.toBe(second.r2_buckets[0].bucket_name);
    for (const value of [
      first.name,
      second.name,
      first.r2_buckets[0].bucket_name,
      second.r2_buckets[0].bucket_name,
    ]) {
      expect(value.length).toBeLessThanOrEqual(63);
      expect(value).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
    }
    expect(first.name).toMatch(/-[a-f0-9]{10}$/);
    expect(first.r2_buckets[0].bucket_name).toMatch(/-[a-f0-9]{10}$/);
  });
});

describe("reviewed OpenNext Windows patch trust root", () => {
  test("pins the exact key, LF patch digest, installed-file digest, attributes, and audit", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo" });
    const manifest = json<{
      readonly patchedDependencies?: Readonly<Record<string, string>>;
    }>(plan, "package.json");
    const patch = generatedContent(plan, OPENNEXT_AWS_WINDOWS_PATCH_PATH);
    const audit = generatedContent(plan, "scripts/audit-dependencies.ts");

    expect(OPENNEXT_AWS_WINDOWS_PATCH_VERSION).toBe("4.1.0");
    expect(OPENNEXT_AWS_WINDOWS_PATCH_KEY).toBe("@opennextjs/aws@4.1.0");
    expect(OPENNEXT_AWS_WINDOWS_PATCH_PATH).toBe("patches/@opennextjs+aws@4.1.0.patch");
    expect(OPENNEXT_AWS_WINDOWS_PATCH_SHA256).toBe(
      "8a3e9bc123a083789691009293f1be300d5e18152798103f976a418c2b2e9b4a",
    );
    expect(OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256).toBe(
      "f40520e0a246206bbc7851bc3d505cc67dc070da3eb4bba59c02655445364ce7",
    );
    expect(createHash("sha256").update(patch).digest("hex")).toBe(
      OPENNEXT_AWS_WINDOWS_PATCH_SHA256,
    );
    expect(patch).not.toContain("\r");
    expect(manifest.patchedDependencies).toEqual({
      [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH,
    });
    expect(generatedContent(plan, ".gitattributes")).toContain("patches/*.patch text eol=lf");
    expect(audit).toContain("const HAS_OPENNEXT_PATCH = true");
    expect(audit).toContain(`const OPENNEXT_PATCH_KEY = "${OPENNEXT_AWS_WINDOWS_PATCH_KEY}"`);
    expect(audit).toContain(`const OPENNEXT_PATCH_PATH = "${OPENNEXT_AWS_WINDOWS_PATCH_PATH}"`);
    expect(audit).toContain(`const OPENNEXT_PATCH_SHA256 = "${OPENNEXT_AWS_WINDOWS_PATCH_SHA256}"`);
    expect(audit).toContain(
      `const OPENNEXT_PATCHED_FILE_SHA256 = "${OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256}"`,
    );
    expect(audit).toContain('.filter(({ name }) => name === "@opennextjs/aws")');
    expect(audit).toContain('join(packageRoot, "dist/build/copyTracedFiles.js")');
    expect(audit).toContain("bun.lock does not bind the reviewed OpenNext patch");
  });

  test("does not add the OpenNext patch to native TanStack Workers", () => {
    const plan = cloudflarePlan({ framework: "tanstack-start" });
    const paths = plan.files.map(({ physicalPath }) => physicalPath);
    expect(paths).not.toContain(OPENNEXT_AWS_WINDOWS_PATCH_PATH);
    expect(
      json<{ readonly patchedDependencies?: unknown }>(plan, "package.json").patchedDependencies,
    ).toBeUndefined();
    expect(generatedContent(plan, "scripts/audit-dependencies.ts")).toContain(
      "const HAS_OPENNEXT_PATCH = false",
    );
  });
});

describe("Cloudflare generated CI environment contract", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const mode of ["monorepo", "single"] as const) {
      test(`${mode}/${framework} scopes exact synthetic build values to the Worker step`, () => {
        const plan = cloudflarePlan({
          framework,
          mode,
          database: "convex",
          auth: true,
          overrides: { cache: "redis", withNotifications: true },
        });
        const workflow = Bun.YAML.parse(generatedContent(plan, ".github/workflows/ci.yml")) as {
          readonly jobs: {
            readonly build: {
              readonly env?: Readonly<Record<string, string>>;
              readonly steps: ReadonlyArray<{
                readonly name?: string;
                readonly run?: string;
                readonly env?: Readonly<Record<string, string>>;
              }>;
            };
          };
        };
        expect(workflow.jobs.build.env).toBeUndefined();
        const workerStep = workflow.jobs.build.steps.find(({ run }) => run === "bun run build");
        expect(workerStep).toBeDefined();
        const environment = workerStep?.env ?? {};
        const appUrl = framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL";
        const convexUrl = framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL";
        expect(environment).toEqual({
          SITE_URL: "https://ghostinit-ci.example.test",
          [appUrl]: "https://ghostinit-ci.example.test",
          CONVEX_DEPLOYMENT: "dev:fixture-worker",
          CONVEX_URL: "https://fixture-worker.convex.cloud",
          CONVEX_SITE_URL: "https://fixture-worker.convex.site",
          [convexUrl]: "https://fixture-worker.convex.cloud",
          BETTER_AUTH_SECRET:
            "ghostinit-ci-only-not-a-production-secret-${{ github.run_id }}-${{ github.run_attempt }}",
          BETTER_AUTH_URL: "https://ghostinit-ci.example.test",
          NOTIFICATION_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          UPSTASH_REDIS_REST_URL: "https://redis.example.test",
          UPSTASH_REDIS_REST_TOKEN:
            "ghostinit-ci-only-${{ github.run_id }}-${{ github.run_attempt }}",
        });
        for (const step of workflow.jobs.build.steps) {
          if (step === workerStep) continue;
          expect(step.env, step.name ?? step.run).toBeUndefined();
        }
        expect(JSON.stringify(workflow)).not.toMatch(
          /secrets\.|vars\.|CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CF_API_TOKEN|GITHUB_TOKEN/,
        );
      });
    }
  }

  test("database-free unauthenticated Workers do not request unrelated CI values", () => {
    const workflow = Bun.YAML.parse(
      generatedContent(cloudflarePlan(), ".github/workflows/ci.yml"),
    ) as {
      readonly jobs: {
        readonly build: {
          readonly env?: Readonly<Record<string, string>>;
          readonly steps: ReadonlyArray<{
            readonly run?: string;
            readonly env?: Readonly<Record<string, string>>;
          }>;
        };
      };
    };
    expect(workflow.jobs.build.env).toBeUndefined();
    expect(workflow.jobs.build.steps.find(({ run }) => run === "bun run build")?.env).toEqual({
      SITE_URL: "https://ghostinit-ci.example.test",
      NEXT_PUBLIC_APP_URL: "https://ghostinit-ci.example.test",
    });
  });

  test("multi-app Worker builds receive explicit non-localhost native public endpoints", () => {
    const plan = cloudflarePlan({
      mode: "monorepo",
      framework: "nextjs",
      database: "convex",
      auth: true,
      overrides: { apps: ["web", "mobile", "desktop"], withMessaging: true },
    });
    const workflow = Bun.YAML.parse(generatedContent(plan, ".github/workflows/ci.yml")) as {
      readonly jobs: {
        readonly build: {
          readonly steps: ReadonlyArray<{
            readonly run?: string;
            readonly env?: Readonly<Record<string, string>>;
          }>;
        };
      };
    };
    const environment =
      workflow.jobs.build.steps.find(({ run }) => run === "bun run build")?.env ?? {};
    expect(environment).toMatchObject({
      EXPO_PUBLIC_APP_URL: "https://ghostinit-ci.example.test",
      EXPO_PUBLIC_API_URL: "https://ghostinit-ci.example.test",
      EXPO_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
      EXPO_PUBLIC_WS_URL: "wss://ghostinit-ci.example.test/api/realtime",
      DESKTOP_API_URL: "https://ghostinit-ci.example.test",
      VITE_APP_URL: "https://ghostinit-ci.example.test",
      VITE_API_URL: "https://ghostinit-ci.example.test",
      VITE_CONVEX_URL: "https://fixture-worker.convex.cloud",
      VITE_WS_URL: "wss://ghostinit-ci.example.test/api/realtime",
    });
    expect(JSON.stringify(environment)).not.toContain("localhost");
    expect(JSON.stringify(environment)).not.toContain("127.0.0.1");
  });
});

describe("framework-specific Worker commands and contributor guidance", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} admits only its reviewed dev and preview forwarding flags`, () => {
      const source = generatedContent(cloudflarePlan({ framework }), "scripts/cloudflare.mjs");
      expect(source).toContain('FRAMEWORK === "nextjs" ? ["hostname", "port"] : ["host", "port"]');
      expect(source).toContain('FRAMEWORK === "nextjs" ? ["ip", "port"] : ["host", "port"]');
      expect(source).toContain("Unsupported forwarded Cloudflare argument");
      expect(source).toContain("Cloudflare preview port is out of range");
      expect(source).toContain('if (requestedArguments[0] === "--") requestedArguments.shift()');
      expect(source).toContain("const stopOnStdinEnd = stopControlCount === 1");
      expect(source).toContain(
        'const forwarded = requestedArguments.filter((argument) => argument !== "--ghostinit-stop-on-stdin-end")',
      );
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} documents the Worker lifecycle rather than a server process`, () => {
        const plan = cloudflarePlan({ framework, mode, database: "convex" });
        const guide = generatedContent(plan, "docs/CLOUDFLARE_DEPLOYMENT.md");
        const agents = generatedContent(plan, "AGENTS.md");
        const scripts = json<{ readonly scripts: Readonly<Record<string, string>> }>(
          plan,
          `${appRoot(mode)}package.json`,
        ).scripts;

        for (const command of ["build:worker", "cloudflare:dry-run", "preview", "deploy"]) {
          expect(scripts[command], command).toBeDefined();
        }
        expect(agents).toContain("bun run build:worker");
        expect(agents).toContain("bun run cloudflare:dry-run");
        expect(agents).toContain("bun run deploy");
        expect(agents).toContain("`preview`");
        expect(agents).toContain("Cloudflare production is a Worker deployment");
        expect(agents).toContain("there is no long-lived Node/Bun production process");
        expect(agents).toContain("bun run convex:bootstrap");
        expect(agents).toContain("runtime values belong in Worker bindings");
        expect(agents).not.toContain(
          "Use `bun run start` for the generated production web process",
        );
        expect(guide).toContain(
          framework === "nextjs"
            ? "Next.js is packaged with the OpenNext Cloudflare adapter."
            : "TanStack Start uses the native Cloudflare Vite plugin.",
        );
        expect(guide).toContain("Local values live only in the gitignored `.dev.vars`");
        expect(guide).toContain("`.dev.vars.ghostinit-build-lock`");
        expect(guide).toContain("`.dev.vars.ghostinit-build-hidden`");
        expect(guide).toContain("`.dev.vars.ghostinit-convex-*`");
        expect(guide).toMatch(/Variables needed by static\s+generation/);
        expect(guide).toContain("Deploy uses `--keep-vars`");
      });
    }
  }
});
