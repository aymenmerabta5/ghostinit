import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  isPublicPosthogProjectToken,
  selectedPosthogPublicKeys,
} from "../../src/lib/posthog-key-policy.js";
import {
  prepareWorkerFixtureBindings,
  workerBuildEnvironment,
} from "../../scripts/test-generated.js";
import {
  cloudflarePlan,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  runFixture,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

const fixtures: RuntimeFixture[] = [];
const PROJECT_TOKEN = "phc_0123456789abcdef0123456789abcdef";

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    const target = resolve(fixture.root);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("ghostinit-cloudflare-runtime-")
    )
      throw new Error("Unsafe fixture cleanup");
    destroyFixture(fixture);
  }
});

function workerConfig(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
): Parameters<typeof workerBuildEnvironment>[1] {
  return {
    appRoot: mode === "single" ? "." : "apps/web",
    appPublicEnvKey: framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL",
    artifactRoot: ".wrangler/ghostinit-dry-run",
    previewHostFlag: framework === "nextjs" ? "--ip" : "--host",
    deployableAssetRoots:
      framework === "nextjs" ? [".open-next/assets", ".open-next/cache"] : ["dist/client"],
  };
}

describe("Cloudflare PostHog public project-token boundary", () => {
  const cases = [
    { name: "shared public project token", token: PROJECT_TOKEN, allowed: true },
    { name: "personal key", token: "phx_0123456789abcdef0123456789abcdef", allowed: false },
    { name: "project-secret key", token: "phs_0123456789abcdef0123456789abcdef", allowed: false },
    { name: "unknown key", token: "unknown-0123456789abcdef0123456789abcdef", allowed: false },
    {
      name: "unrelated secret with the same project token",
      token: PROJECT_TOKEN,
      allowed: false,
      unrelated: true,
    },
  ];
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const entry of cases) {
        test(`${mode}/${framework} ${entry.allowed ? "allows" : "rejects"} ${entry.name}`, () => {
          const publicKey = framework === "nextjs" ? "NEXT_PUBLIC_POSTHOG_KEY" : "VITE_POSTHOG_KEY";
          const plan = cloudflarePlan({ mode, framework, overrides: { withAnalytics: true } });
          const fixture = createWorkerFixture({
            plan,
            framework,
            artifactContent: entry.token,
            devVars: `POSTHOG_API_KEY=${entry.token}\n${publicKey}=${entry.token}\n${entry.unrelated ? `SERVER_SECRET=${entry.token}\n` : ""}`,
          });
          fixtures.push(fixture);
          writeFileSync(
            join(fixture.root, ".env.example"),
            generatedContent(plan, ".env.example") + "\nSERVER_SECRET=REPLACE_WITH_SECRET\n",
          );
          const result = runFixture(fixture, ["dry-run"], { [publicKey]: entry.token });
          const output = `${result.stdout}\n${result.stderr}`;
          const independent = workerBuildEnvironment(
            fixture.root,
            workerConfig(mode, framework),
            "synthetic-worker-secret-control",
          );
          if (entry.allowed) {
            expect(result.status, output).toBe(0);
            expect(independent.serverOnlyValues).not.toContain(entry.token);
          } else {
            expect(result.status).not.toBe(0);
            expect(output).toContain(
              `server-only value from ${entry.unrelated ? "SERVER_SECRET" : "POSTHOG_API_KEY"}`,
            );
            expect(output).not.toContain(entry.token);
            expect(independent.serverOnlyValues).toContain(entry.token);
          }
        });
      }

      test(`${mode}/${framework} required gate configures the same public token in every selected audience`, async () => {
        const plan = cloudflarePlan({ mode, framework, overrides: { withAnalytics: true } });
        const original =
          generatedContent(plan, ".env.example") + "\nSERVER_SECRET=local-server-secret-value\n";
        const fixture = createWorkerFixture({ plan, framework, devVars: original });
        fixtures.push(fixture);
        writeFileSync(join(fixture.root, ".env.example"), original);
        const worker = workerConfig(mode, framework);
        const bindings = await prepareWorkerFixtureBindings(
          realpathSync.native(fixture.root),
          worker,
        );
        try {
          const result = workerBuildEnvironment(
            fixture.root,
            worker,
            "synthetic-worker-secret-control",
            bindings.capabilityFixtures,
          );
          const publicKey = framework === "nextjs" ? "NEXT_PUBLIC_POSTHOG_KEY" : "VITE_POSTHOG_KEY";
          const token = result.env[publicKey];
          expect(token).toMatch(/^phc_[A-Za-z0-9]{16,200}$/);
          expect(result.serverOnlyValues).not.toContain(token);
          expect(result.serverOnlyValues).toContain("local-server-secret-value");
          expect(result.serverOnlyValues).toContain("synthetic-worker-secret-control");
          const local = readFileSync(join(fixture.root, ".dev.vars"), "utf8");
          expect(local).toContain(`POSTHOG_API_KEY=${JSON.stringify(token)}`);
          if (mode === "monorepo")
            expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(local);
        } finally {
          await bindings.restore(true);
        }
        expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
        if (mode === "monorepo")
          expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(original);
      });
    }
  }

  test("requires exact key ownership, a selected declared alias, and an exact token match", () => {
    const aliases = selectedPosthogPublicKeys("nextjs", ["web"]);
    const declared = new Set(aliases);
    const validEntries = [["NEXT_PUBLIC_POSTHOG_KEY", PROJECT_TOKEN]] as const;
    expect(
      isPublicPosthogProjectToken(
        "POSTHOG_API_KEY",
        PROJECT_TOKEN,
        aliases,
        declared,
        validEntries,
      ),
    ).toBe(true);
    for (const key of ["SERVER_SECRET", "posthog_api_key", "OTHER_POSTHOG_API_KEY"]) {
      expect(isPublicPosthogProjectToken(key, PROJECT_TOKEN, aliases, declared, validEntries)).toBe(
        false,
      );
    }
    expect(
      isPublicPosthogProjectToken(
        "POSTHOG_API_KEY",
        PROJECT_TOKEN,
        aliases,
        new Set(),
        validEntries,
      ),
    ).toBe(false);
    expect(
      isPublicPosthogProjectToken(
        "POSTHOG_API_KEY",
        PROJECT_TOKEN,
        aliases,
        new Set(["VITE_POSTHOG_KEY"]),
        [["VITE_POSTHOG_KEY", PROJECT_TOKEN]],
      ),
    ).toBe(false);
    expect(
      isPublicPosthogProjectToken("POSTHOG_API_KEY", PROJECT_TOKEN, aliases, declared, [
        ["NEXT_PUBLIC_POSTHOG_KEY", `${PROJECT_TOKEN}a`],
      ]),
    ).toBe(false);
    for (const token of [
      "phc_short",
      "phc_0123456789abcdef\n",
      "phx_0123456789abcdef",
      "phs_0123456789abcdef",
      "phc_" + "a".repeat(201),
    ]) {
      expect(
        isPublicPosthogProjectToken("POSTHOG_API_KEY", token, aliases, declared, [
          ["NEXT_PUBLIC_POSTHOG_KEY", token],
        ]),
      ).toBe(false);
    }
  });
});
