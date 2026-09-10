import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  prepareWorkerFixtureBindings,
  workerBuildEnvironment,
} from "../../scripts/test-generated.js";
import { parseDotenvAssignments } from "../../src/lib/dotenv.js";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  cloudflarePlan,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  runFixture,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

describe.each(["stripe", "paddle", "polar"] as const)("%s billing selection", (globalProvider) => {
  const fixtures: RuntimeFixture[] = [];
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      const target = resolve(fixture.root);
      if (
        dirname(target) !== resolve(tmpdir()) ||
        !basename(target).startsWith("ghostinit-cloudflare-runtime-")
      ) {
        throw new Error("Refusing unowned Worker fixture cleanup");
      }
      destroyFixture(fixture);
    }
  });

  function createFixture(mode: "single" | "monorepo", framework: "nextjs" | "tanstack-start") {
    const plan = cloudflarePlan({
      mode,
      framework,
      database: "convex",
      auth: true,
      overrides: {
        apps: mode === "monorepo" ? ["web", "mobile", "desktop"] : ["web"],
        billing: ["chargily", globalProvider],
        cache: "redis",
        withAnalytics: true,
        withNotifications: true,
        withJobs: true,
        featureFlags: "posthog",
      },
    });
    const original =
      "# original fixture bytes\r\n" +
      generatedContent(plan, ".env.example").replaceAll("\n", "\r\n");
    const fixture = createWorkerFixture({ plan, framework, devVars: original });
    fixtures.push(fixture);
    writeFileSync(join(fixture.root, ".env.example"), generatedContent(plan, ".env.example"));
    const worker: Parameters<typeof workerBuildEnvironment>[1] = {
      appRoot: mode === "single" ? "." : "apps/web",
      appPublicEnvKey: framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL",
      convexPublicEnvKey: framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL",
      artifactRoot: ".wrangler/ghostinit-dry-run",
      previewHostFlag: framework === "nextjs" ? "--ip" : "--host",
      deployableAssetRoots:
        framework === "nextjs" ? [".open-next/assets", ".open-next/cache"] : ["dist/client"],
      nativeApps: mode === "monorepo" ? ["mobile", "desktop"] : [],
    };
    const paths = mode === "single" ? [".dev.vars"] : [".dev.vars", "apps/web/.dev.vars"];
    return { fixture, worker, original, paths, framework };
  }

  function values(content: string): Record<string, string> {
    return Object.fromEntries(parseDotenvAssignments(content));
  }

  describe("Worker fixture bindings", () => {
    for (const mode of ["single", "monorepo"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        test(`${mode}/${framework} stages declared audiences once and restores exact originals`, async () => {
          const { fixture, worker, original, paths } = createFixture(mode, framework);
          const originalValues = values(original);
          const staged = await prepareWorkerFixtureBindings(
            realpathSync.native(fixture.root),
            worker,
          );
          try {
            const build = workerBuildEnvironment(
              fixture.root,
              worker,
              "synthetic-worker-canary",
              staged.capabilityFixtures,
            );
            for (const path of paths) {
              const bindings = values(readFileSync(join(fixture.root, path), "utf8"));
              expect(Object.keys(bindings).sort()).toEqual(Object.keys(originalValues).sort());
              for (const key of [
                "BETTER_AUTH_SECRET",
                "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
                "UPSTASH_REDIS_REST_URL",
                "UPSTASH_REDIS_REST_TOKEN",
              ]) {
                expect(bindings[key]).toBe(build.env[key]);
                expect(bindings[key]).not.toContain("REPLACE_WITH_");
                expect(build.serverOnlyValues).toContain(bindings[key]);
              }
              for (const key of Object.keys(bindings).filter(
                (key) =>
                  /^(?:STRIPE|CHARGILY|PADDLE|POLAR)_/.test(key) &&
                  /(?:KEY|SECRET|TOKEN)$/.test(key),
              )) {
                expect(bindings[key], key).toBe(originalValues[key]);
                expect(bindings[key], key).toContain("REPLACE_WITH_");
              }
              expect(bindings.CONVEX_URL).toBe("https://fixture-worker.convex.cloud");
              expect(bindings.CONVEX_SITE_URL).toBe("https://fixture-worker.convex.site");
              expect(bindings[worker.appPublicEnvKey]).toBe(staged.capabilityFixtures.siteUrl);
              if (mode === "monorepo") {
                expect(bindings.EXPO_PUBLIC_APP_URL).toBe(bindings[worker.appPublicEnvKey]);
                expect(bindings.VITE_APP_URL).toBe(bindings[worker.appPublicEnvKey]);
              } else {
                expect(bindings.EXPO_PUBLIC_APP_URL).toBeUndefined();
              }
              expect(bindings.POSTHOG_API_KEY).toMatch(/^phc_[A-Za-z0-9]+$/);
              for (const key of [
                framework === "nextjs" ? "NEXT_PUBLIC_POSTHOG_KEY" : "VITE_POSTHOG_KEY",
                ...(mode === "monorepo" ? ["EXPO_PUBLIC_POSTHOG_KEY", "VITE_POSTHOG_KEY"] : []),
              ]) {
                expect(bindings[key]).toBe(bindings.POSTHOG_API_KEY);
              }
              expect(build.serverOnlyValues).not.toContain(bindings.POSTHOG_API_KEY);
              expect(bindings.GHOSTINIT_WORKER_TEST_SECRET).toBeUndefined();
            }
          } finally {
            await staged.restore(true);
          }
          for (const path of paths)
            expect(readFileSync(join(fixture.root, path), "utf8")).toBe(original);
        });
      }
    }

    test("does not add declared but absent capability or audience keys to binding files", async () => {
      const { fixture, worker, paths } = createFixture("monorepo", "nextjs");
      const original =
        "SITE_URL=https://original.example.test\nNEXT_PUBLIC_APP_URL=https://original.example.test\nSTRIPE_SECRET_KEY=REPLACE_WITH_STRIPE_SECRET_KEY\n";
      const transaction = new FsTransaction(fixture.root);
      for (const path of paths) await transaction.write(path, original);
      await transaction.commit();
      const staged = await prepareWorkerFixtureBindings(realpathSync.native(fixture.root), worker);
      try {
        for (const path of paths) {
          const bindings = values(readFileSync(join(fixture.root, path), "utf8"));
          expect(Object.keys(bindings).sort()).toEqual(Object.keys(values(original)).sort());
          expect(bindings.SITE_URL).toBe(staged.capabilityFixtures.siteUrl);
          expect(bindings.STRIPE_SECRET_KEY).toBe("REPLACE_WITH_STRIPE_SECRET_KEY");
        }
      } finally {
        await staged.restore(true);
      }
      for (const path of paths)
        expect(readFileSync(join(fixture.root, path), "utf8")).toBe(original);
    });

    test("generated preview receives the staged bindings even when inherited values conflict", async () => {
      const { fixture, worker, original, paths } = createFixture("monorepo", "nextjs");
      const canonicalRoot = realpathSync.native(fixture.root);
      const adapterPath = relative(
        canonicalRoot,
        realpathSync.native(Bun.resolveSync("@opennextjs/cloudflare", canonicalRoot)),
      ).replaceAll("\\", "/");
      const adapter = readFileSync(join(canonicalRoot, adapterPath), "utf8");
      const transaction = new FsTransaction(canonicalRoot);
      await transaction.writeIfUnchanged(
        adapterPath,
        adapter +
          `
if (action === "preview") {
  const bindings = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\\r?\\n/).filter(line => /^[A-Z_][A-Z0-9_]*=/.test(line)).map(line => {
    const equals = line.indexOf("=");
    const raw = line.slice(equals + 1);
    return [line.slice(0, equals), raw.startsWith('"') ? JSON.parse(raw) : raw];
  }));
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    if (!bindings[key] || bindings[key].includes("REPLACE_WITH_") || process.env[key] !== bindings[key]) {
      writeFileSync(".runtime-binding-probe-result", "invalid");
      process.exit(79);
    }
  }
  writeFileSync(".runtime-binding-probe-result", "valid");
}
`,
        adapter,
      );
      await transaction.commit();
      const inherited = workerBuildEnvironment(fixture.root, worker, "synthetic-worker-canary");
      const before = runFixture(fixture, ["preview"], inherited.env);
      expect(before.status).toBe(1);
      const probeResult = join(fixture.cwd ?? fixture.root, ".runtime-binding-probe-result");
      expect(readFileSync(probeResult, "utf8")).toBe("invalid");
      const staged = await prepareWorkerFixtureBindings(realpathSync.native(fixture.root), worker);
      try {
        const build = workerBuildEnvironment(
          fixture.root,
          worker,
          "synthetic-worker-canary",
          staged.capabilityFixtures,
        );
        const preview = runFixture(fixture, ["preview"], {
          ...build.env,
          UPSTASH_REDIS_REST_URL: "https://unrelated-inherited.example.test",
          UPSTASH_REDIS_REST_TOKEN: "unrelated-inherited-fixture-token",
        });
        expect(preview.status).toBe(0);
        expect(readFileSync(probeResult, "utf8")).toBe("valid");
      } finally {
        await staged.restore(true);
      }
      for (const path of paths)
        expect(readFileSync(join(fixture.root, path), "utf8")).toBe(original);
    });
  });
});
