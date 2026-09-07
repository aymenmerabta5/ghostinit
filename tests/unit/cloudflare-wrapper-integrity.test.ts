// @allow-long 1000: executable integrity regressions share the isolated Worker/Convex fixture contract
import { afterEach, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  cloudflarePlan,
  createConvexFixture,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  readEvents,
  runFixture,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

const fixtures: RuntimeFixture[] = [];
const track = (fixture: RuntimeFixture): RuntimeFixture => (fixtures.push(fixture), fixture);
const output = (result: ReturnType<typeof runFixture>): string =>
  `${result.stdout}\n${result.stderr}`;

afterEach(() => {
  for (const fixture of fixtures.splice(0).reverse()) destroyFixture(fixture);
});

describe("Cloudflare wrapper deployment integrity", () => {
  test("OpenNext emits its queue and sharded tag-cache Durable Object bindings", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "single" });
    const wrangler = JSON.parse(generatedContent(plan, "wrangler.jsonc")) as {
      services?: unknown;
    };
    expect(wrangler.services).toEqual([
      { binding: "WORKER_SELF_REFERENCE", service: "cloudflare-single-next" },
    ]);
    const openNext = generatedContent(plan, "open-next.config.ts");
    expect(openNext).toContain("queue: doQueue");
    expect(openNext).toContain("tagCache: doShardedTagCache({ baseShardSize: 12 })");
  });

  test("keeps deploy credentials out of every preflight while scanning them before deploy", () => {
    const credential = "cloudflare-deploy-token-that-must-be-scanned";
    const fixture = track(createWorkerFixture({ artifactContent: credential }));
    const result = runFixture(fixture, ["deploy"], { CLOUDFLARE_API_TOKEN: credential });
    const combined = output(result);
    expect(result.status).not.toBe(0);
    expect(combined).toContain("server-only value from CLOUDFLARE_API_TOKEN");
    expect(combined).not.toContain(credential);
    const events = readEvents(fixture.root);
    expect(events.find(({ action }) => action === "build")?.env?.credential).toBeNull();
    expect(events.find(({ dryRun }) => dryRun)?.env?.credential).toBeNull();
    expect(events.some(({ action }) => action === "deploy")).toBe(false);
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} requires matching explicit production origins but permits loopback preview`, () => {
      const fixture = track(createWorkerFixture({ framework }));
      const appUrlKey = framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL";

      for (const environment of [
        { SITE_URL: "", [appUrlKey]: "https://worker.example.test" },
        { SITE_URL: "https://worker.example.test", [appUrlKey]: "" },
        { SITE_URL: "http://localhost:3000", [appUrlKey]: "http://localhost:3000" },
        { SITE_URL: "https://example.com", [appUrlKey]: "https://example.com" },
        {
          SITE_URL: "https://worker.example.test",
          [appUrlKey]: "https://different.example.test",
        },
      ]) {
        const result = runFixture(fixture, ["dry-run"], environment);
        expect(result.status).not.toBe(0);
        expect(readEvents(fixture.root)).toEqual([]);
      }

      const preview = runFixture(fixture, ["preview"], {
        SITE_URL: "http://localhost:3000",
        [appUrlKey]: "http://localhost:3000",
      });
      expect(preview.status, output(preview)).toBe(0);
      expect(readEvents(fixture.root).some(({ action }) => action === "preview")).toBe(true);
    });
  }

  test("validates auth, Convex, and Upstash production URL relationships without disclosure", () => {
    const plan = cloudflarePlan({
      framework: "nextjs",
      database: "convex",
      auth: true,
      overrides: { cache: "redis" },
    });
    const fixture = track(createWorkerFixture({ plan }));
    const base = {
      SITE_URL: "https://worker.fixture.example",
      NEXT_PUBLIC_APP_URL: "https://worker.fixture.example",
      BETTER_AUTH_SECRET: "fixture-auth-secret-value",
      BETTER_AUTH_URL: "https://worker.fixture.example",
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
      UPSTASH_REDIS_REST_URL: "https://redis.example.test",
      UPSTASH_REDIS_REST_TOKEN: "fixture-upstash-token-value",
    };
    const cases = [
      {
        patch: { BETTER_AUTH_URL: "https://auth-user:auth-password@worker.fixture.example" },
        expected: "BETTER_AUTH_URL",
        secret: "auth-password",
      },
      {
        patch: { NEXT_PUBLIC_CONVEX_URL: "https://other.convex.cloud" },
        expected: "public Convex URL",
        secret: "other.convex.cloud",
      },
      {
        patch: { CONVEX_SITE_URL: "https://different.convex.site" },
        expected: "CONVEX_SITE_URL",
        secret: "different.convex.site",
      },
      {
        patch: { UPSTASH_REDIS_REST_URL: "https://redis-user:redis-password@redis.example.test" },
        expected: "UPSTASH_REDIS_REST_URL",
        secret: "redis-password",
      },
    ] as const;
    for (const testCase of cases) {
      const result = runFixture(fixture, ["dry-run"], { ...base, ...testCase.patch });
      const combined = output(result);
      expect(result.status).not.toBe(0);
      expect(combined).toContain(testCase.expected);
      expect(combined).not.toContain(testCase.secret);
      expect(readEvents(fixture.root)).toEqual([]);
    }

    const accepted = runFixture(fixture, ["dry-run"], base);
    expect(accepted.status, output(accepted)).toBe(0);
  });

  test("deploy verifies installed patches and high-severity advisories without deploy credentials", () => {
    const fixture = track(createWorkerFixture());
    const result = runFixture(fixture, ["deploy"], {
      CLOUDFLARE_API_TOKEN: "fixture-deploy-credential",
    });
    expect(result.status, output(result)).toBe(0);
    expect(existsSync(join(fixture.root, ".dependency-audit-ran"))).toBe(true);
    expect(
      readEvents(fixture.root).find(({ action }) => action === "deploy")?.env?.credential,
    ).toBe("fixture-deploy-credential");
  });

  test("final publication receives deploy credentials but no application build secrets", () => {
    const plan = cloudflarePlan({ framework: "nextjs", database: "convex", auth: true });
    const fixture = track(createWorkerFixture({ plan }));
    const buildSecret = "auth-build-secret-that-must-not-reach-publication";
    const result = runFixture(fixture, ["deploy"], {
      BETTER_AUTH_SECRET: buildSecret,
      BETTER_AUTH_URL: "https://worker.fixture.example",
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
      CLOUDFLARE_API_TOKEN: "fixture-deploy-credential",
    });
    expect(result.status, output(result)).toBe(0);
    const adapters = readEvents(fixture.root).filter(({ tool }) => tool === "adapter");
    expect(adapters.find(({ action }) => action === "build")?.env?.serverSecret).toBe(buildSecret);
    const publication = adapters.find(({ action }) => action === "deploy");
    expect(publication?.env?.serverSecret).toBeNull();
    expect(publication?.env?.credential).toBe("fixture-deploy-credential");
  });

  test("redacts rejected inline Cloudflare argument values", () => {
    const fixture = track(createWorkerFixture());
    const secret = "inline-control-plane-secret";
    const result = runFixture(fixture, ["dry-run", `--api-token=${secret}`]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("Unsupported forwarded Cloudflare argument: --api-token");
    expect(output(result)).not.toContain(secret);
    expect(readEvents(fixture.root)).toEqual([]);

    const secretAction = "action-name-that-must-not-be-disclosed";
    const unknown = runFixture(fixture, [secretAction]);
    expect(unknown.status).not.toBe(0);
    expect(output(unknown)).toContain("Unknown Cloudflare action");
    expect(output(unknown)).not.toContain(secretAction);
    expect(readEvents(fixture.root)).toEqual([]);
  });

  test("default-denies undeclared ambient public build variables", () => {
    const fixture = track(createWorkerFixture());
    const result = runFixture(fixture, ["dry-run"], {
      SITE_URL: "https://declared.fixture.example",
      NEXT_PUBLIC_APP_URL: "https://declared.fixture.example",
      NEXT_PUBLIC_UNDECLARED_TRAP: "ambient-public-injection",
      VITE_UNDECLARED_TRAP: "ambient-vite-injection",
    });
    expect(result.status, output(result)).toBe(0);
    for (const event of readEvents(fixture.root)) {
      expect(event.env?.publicUrl).toBe("https://declared.fixture.example");
      expect(event.env?.undeclaredPublic).toBeNull();
    }
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} passes declared runtime-only values only to final preview`, () => {
      const secret = "runtime-only-preview-secret";
      const fixture = track(
        createWorkerFixture({ framework, devVars: `SERVER_SECRET=${secret}\n` }),
      );
      const result = runFixture(fixture, ["preview"]);
      expect(result.status, output(result)).toBe(0);
      const events = readEvents(fixture.root);
      expect(events.find(({ action }) => action === "build")?.env?.serverSecret).toBeNull();
      expect(events.find(({ dryRun }) => dryRun)?.env?.serverSecret).toBeNull();
      expect(events.find(({ action }) => action === "preview")?.env?.serverSecret).toBe(secret);
      expect(events.find(({ action }) => action === "build")?.environmentLockExists).toBe(true);
      expect(events.find(({ dryRun }) => dryRun)?.environmentLockExists).toBe(true);
      expect(events.find(({ action }) => action === "preview")?.environmentLockExists).toBe(true);
    });
  }

  test("preview rejects undeclared and control-plane values from .dev.vars", () => {
    const undeclared = track(
      createWorkerFixture({ devVars: "UNDECLARED_RUNTIME_SECRET=must-not-reach-preview\n" }),
    );
    const undeclaredResult = runFixture(undeclared, ["preview"]);
    expect(undeclaredResult.status).not.toBe(0);
    expect(output(undeclaredResult)).toContain("Undeclared key in .dev.vars");
    expect(readEvents(undeclared.root)).toEqual([]);

    const controlPlane = track(
      createWorkerFixture({
        devVars: "CLOUDFLARE_API_TOKEN=must-not-reach-preview-control-plane\n",
      }),
    );
    appendFileSync(
      join(controlPlane.root, ".env.example"),
      "CLOUDFLARE_API_TOKEN=REPLACE_WITH_CLOUDFLARE_API_TOKEN\n",
    );
    const credentialResult = runFixture(controlPlane, ["preview"]);
    expect(credentialResult.status).not.toBe(0);
    expect(output(credentialResult)).toContain(
      "Control-plane credential is not allowed in .dev.vars",
    );
    expect(readEvents(controlPlane.root)).toEqual([]);
  });

  test("requires exact monorepo mirror presence and key/value equality before tools run", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo" });
    const fixture = track(createWorkerFixture({ plan }));
    const appValues = join(fixture.root, "apps/web/.dev.vars");
    const rootValues = join(fixture.root, ".dev.vars");
    const original = readFileSync(rootValues, "utf8");

    rmSync(appValues);
    const missing = runFixture(fixture, ["dry-run"]);
    expect(missing.status).not.toBe(0);
    expect(output(missing)).toContain("must either both exist or both be absent");
    expect(readEvents(fixture.root)).toEqual([]);

    writeFileSync(appValues, original, "utf8");
    writeFileSync(rootValues, `${original}APP_NAME=Root only\n`, "utf8");
    const divergent = runFixture(fixture, ["dry-run"]);
    expect(divergent.status).not.toBe(0);
    expect(output(divergent)).toContain(".dev.vars files diverged");
    expect(readEvents(fixture.root)).toEqual([]);
  });

  test("restores every unaffected mirror when a later restore encounters a conflict", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo" });
    const localValues = "SERVER_SECRET=fixture-server-only-secret\n";
    const fixture = track(createWorkerFixture({ plan, devVars: localValues }));
    writeFileSync(join(fixture.cwd!, ".create-conflicting-dev-vars"), "create\n", "utf8");

    const result = runFixture(fixture, ["dry-run"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(
      "Local environment changed while the Worker build was running",
    );
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(localValues);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-hidden"))).toBe(false);
    expect(readFileSync(join(fixture.root, "apps/web/.dev.vars"), "utf8")).toBe(
      "CONFLICT=adapter-created\n",
    );
    expect(
      readFileSync(join(fixture.root, "apps/web/.dev.vars.ghostinit-build-hidden"), "utf8"),
    ).toBe(localValues);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
  });

  test("bounds aggregate artifact traversal before reading excess files", () => {
    const fixture = track(createWorkerFixture());
    const scriptPath = join(fixture.root, fixture.script);
    const source = readFileSync(scriptPath, "utf8");
    const constrained = source.replace(
      "const MAX_SCANNED_FILES = 100_000;",
      "const MAX_SCANNED_FILES = 2;",
    );
    expect(constrained).not.toBe(source);
    writeFileSync(scriptPath, constrained, "utf8");

    const result = runFixture(fixture, ["dry-run"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("bounded secret scanner file count");
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toContain("SERVER_SECRET");
    expect(source).toContain("MAX_SCANNED_TOTAL_BYTES");
    expect(source).toContain("MAX_SCAN_DEPTH");
    expect(source).toContain("scan(root, secrets, scanState)");
  });

  test("scans decoded proxy credentials and known private connection URLs", () => {
    const decodedPassword = "super-secret-proxy-password";
    const proxy = `http://proxy%2Duser:super%2Dsecret%2Dproxy%2Dpassword@127.0.0.1:9`;
    const proxyFixture = track(createWorkerFixture({ artifactContent: decodedPassword }));
    const proxyResult = runFixture(proxyFixture, ["dry-run"], { HTTPS_PROXY: proxy });
    expect(proxyResult.status).not.toBe(0);
    expect(output(proxyResult)).toContain("server-only value from HTTPS_PROXY");
    expect(output(proxyResult)).not.toContain(decodedPassword);

    const databaseUrl = "postgres://worker-user:worker-password@db.invalid/app";
    const databaseFixture = track(createWorkerFixture({ artifactContent: databaseUrl }));
    writeFileSync(join(databaseFixture.root, ".dev.vars"), `DATABASE_URL=${databaseUrl}\n`, "utf8");
    appendFileSync(
      join(databaseFixture.root, ".env.example"),
      "DATABASE_URL=REPLACE_WITH_DATABASE_URL\n",
    );
    const databaseResult = runFixture(databaseFixture, ["dry-run"]);
    expect(databaseResult.status).not.toBe(0);
    expect(output(databaseResult)).toContain("server-only value from DATABASE_URL");
    expect(output(databaseResult)).not.toContain(databaseUrl);
  });

  test("scans credential-bearing auth and Convex URLs before local preview", () => {
    const plan = cloudflarePlan({ framework: "nextjs", database: "convex", auth: true });
    const base = {
      SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "fixture-auth-secret-value",
      BETTER_AUTH_URL: "http://localhost:3000",
      TRUSTED_PROXY: "false",
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
    };
    for (const testCase of [
      {
        key: "BETTER_AUTH_URL",
        value: "https://auth-user:auth-password@worker.fixture.example",
        leaked: "auth-password",
      },
      {
        key: "CONVEX_URL",
        value: "https://convex-user:convex-password@fixture-worker.convex.cloud",
        leaked: "convex-password",
      },
    ] as const) {
      const fixture = track(createWorkerFixture({ plan, artifactContent: testCase.leaked }));
      const result = runFixture(fixture, ["preview"], {
        ...base,
        [testCase.key]: testCase.value,
      });
      const combined = output(result);
      expect(result.status).not.toBe(0);
      expect(combined).toContain("server-only value from " + testCase.key);
      expect(combined).not.toContain(testCase.leaked);
      expect(readEvents(fixture.root).some(({ action }) => action === "preview")).toBe(false);
    }
  });
});

describe("Cloudflare Convex wrapper integrity", () => {
  test("renders target topology from mode instead of runtime file presence", () => {
    const singlePlan = cloudflarePlan({ mode: "single", database: "convex" });
    const monorepoPlan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const singleScript = generatedContent(singlePlan, "scripts/cloudflare-convex.mjs");
    const monorepoScript = generatedContent(monorepoPlan, "scripts/cloudflare-convex.mjs");
    expect(singleScript).not.toContain('resolve(root, "apps/web/.dev.vars")');
    expect(monorepoScript).toContain('resolve(root, "apps/web/.dev.vars")');
    expect(singleScript).not.toContain('label: "apps/web"');
    expect(monorepoScript).toContain('label: "apps/web"');
    expect(singleScript).not.toContain('existsSync(resolve(root, "apps/web/package.json"))');

    const fixture = track(createConvexFixture(singleScript, "NEXT_PUBLIC_CONVEX_URL"));
    const result = runFixture(fixture, ["bootstrap"]);
    expect(result.status, output(result)).toBe(0);
    expect(existsSync(join(fixture.root, ".dev.vars"))).toBe(true);
    expect(existsSync(join(fixture.root, "apps/web/.dev.vars"))).toBe(false);
  });

  test("rejects config override flags and conflicting ambient selectors before spawn", () => {
    const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const configured =
      "CONVEX_DEPLOYMENT=dev:fixture-worker\nBETTER_AUTH_SECRET=local-authoritative-secret\n";
    writeFileSync(join(fixture.root, ".dev.vars"), configured);
    writeFileSync(join(fixture.root, "apps/web/.dev.vars"), configured);

    const override = runFixture(fixture, ["dev", "--", "--url", "https://other.invalid"]);
    expect(override.status).not.toBe(0);
    expect(output(override)).toContain("Unsupported forwarded Convex argument: --url");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);

    const ambient = runFixture(fixture, ["dev"], { CONVEX_DEPLOYMENT: "dev:other" });
    expect(ambient.status).not.toBe(0);
    expect(output(ambient)).toContain("Ambient Convex configuration conflicts");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);

    const alternateToken = runFixture(fixture, ["deploy"], {
      CONVEX_DEPLOYMENT_TOKEN: "alternate-authority-token",
    });
    expect(alternateToken.status).not.toBe(0);
    expect(output(alternateToken)).toContain("CONVEX_DEPLOYMENT_TOKEN");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
  });

  test("default-denies execution, path-write, preview, and deployment-selection arguments", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    writeFileSync(join(fixture.root, ".dev.vars"), "CONVEX_DEPLOYMENT=dev:fixture-worker\n");
    const cases = [
      ["dev", "--prod"],
      ["dev", "--start"],
      ["dev", "--run-sh=do-not-disclose"],
      ["deploy", "--preview-name=do-not-disclose"],
      ["deploy", "--preview-create"],
      ["deploy", "--cmd=do-not-disclose"],
      ["deploy", "--cmd-url-env-var-name=do-not-disclose"],
      ["codegen", "--admin-key=do-not-disclose"],
    ] as const;
    for (const [convexAction, argument] of cases) {
      const result = runFixture(fixture, [convexAction, "--", argument]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toContain("Unsupported forwarded Convex argument");
      expect(output(result)).not.toContain("do-not-disclose");
    }
    const secretAction = "convex-action-value-that-must-not-be-disclosed";
    const unknownAction = runFixture(fixture, [secretAction]);
    expect(unknownAction.status).not.toBe(0);
    expect(output(unknownAction)).toContain("Expected Convex action");
    expect(output(unknownAction)).not.toContain(secretAction);
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);

    const allowed = runFixture(fixture, ["dev", "--", "--once"]);
    expect(allowed.status, output(allowed)).toBe(0);
    const allowedArgs = readEvents(fixture.root, "convex-events.jsonl")[0]?.args ?? [];
    expect(allowedArgs[0]).toBe("dev");
    expect(allowedArgs[1]).toBe("--env-file");
    expect(allowedArgs[2]).toMatch(/^\.dev\.vars\.ghostinit-convex-\d+-[0-9a-f-]{36}$/);
    expect(allowedArgs.slice(3)).toEqual(["--once"]);
  });

  test("passes only Convex selectors and action-scoped deploy credentials to the child", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    writeFileSync(
      join(fixture.root, ".dev.vars"),
      "CONVEX_DEPLOYMENT=dev:fixture-worker\nBETTER_AUTH_SECRET=local-authoritative-secret\n",
    );
    const result = runFixture(fixture, ["dev"], {
      BETTER_AUTH_SECRET: "ambient-secret-must-not-win",
      HTTPS_PROXY: "http://127.0.0.1:9876",
      UNRELATED_PROCESS_SECRET: "unrelated-process-secret",
    });
    expect(result.status, output(result)).toBe(0);
    const event = readEvents(fixture.root, "convex-events.jsonl")[0];
    expect(event?.env?.authSecret).toBeNull();
    expect(event?.env?.unrelatedProcessSecret).toBeNull();
    expect(event?.env?.unrelatedProjectSecret).toBeNull();
    expect(event?.env?.deployKey).toBeNull();
    expect(event?.env?.deployment).toBe("dev:fixture-worker");
    expect(event?.env?.httpsProxy).toBe("http://127.0.0.1:9876");

    const deploy = runFixture(fixture, ["deploy"], {
      CONVEX_DEPLOY_KEY: "process-only-deploy-credential",
    });
    expect(deploy.status, output(deploy)).toBe(0);
    expect(readEvents(fixture.root, "convex-events.jsonl").at(-1)?.env?.deployKey).toBe(
      "process-only-deploy-credential",
    );
  });

  test("never imports failed Convex output and removes it before returning failure", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const original =
      "CONVEX_DEPLOYMENT=dev:existing-worker\nBETTER_AUTH_SECRET=preserved-local-secret\n";
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, ".fake-convex-exit-9"), "fail\n");
    const result = runFixture(fixture, ["bootstrap"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("Convex subprocess failed with exit code 9");
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
  });

  test("rejects alternate dotenv authority before bootstrap", () => {
    const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    writeFileSync(join(fixture.root, ".env"), "CONVEX_DEPLOYMENT=prod:wrong-target\n");
    const result = runFixture(fixture, ["bootstrap"], {
      CONVEX_DEPLOY_KEY: "prod:must-not-select-bootstrap",
    });
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("Refusing alternate Convex dotenv authority");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);

    rmSync(join(fixture.root, ".env"));
    writeFileSync(
      join(fixture.root, "apps/web/.env.production"),
      "CONVEX_DEPLOYMENT=prod:wrong-target\n",
    );
    const appEnvironment = runFixture(fixture, ["bootstrap"]);
    expect(appEnvironment.status).not.toBe(0);
    expect(output(appEnvironment)).toContain("apps/web/.env.production");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
  });

  test("allows documentation-only dotenv variants for Convex in every environment root", () => {
    const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const configured = "CONVEX_DEPLOYMENT=dev:fixture-worker\n";
    writeFileSync(join(fixture.root, ".dev.vars"), configured);
    writeFileSync(join(fixture.root, "apps/web/.dev.vars"), configured);
    for (const path of [
      ".env.template",
      ".env.production.example",
      "apps/web/.env.staging.secrets.template",
    ]) {
      writeFileSync(join(fixture.root, path), "DOCUMENTED=REPLACE_WITH_VALUE\n");
    }

    const result = runFixture(fixture, ["dev"]);
    expect(result.status, output(result)).toBe(0);
    expect(readEvents(fixture.root, "convex-events.jsonl")).toHaveLength(1);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
  });

  test("rejects deploy credentials outside the explicit deploy action", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const result = runFixture(fixture, ["bootstrap"], {
      CONVEX_DEPLOY_KEY: "prod:must-not-select-bootstrap",
    });
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("accepted only by the explicit Convex deploy action");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
  });

  test("non-bootstrap validates and discards CLI environment output without promoting it", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const original = "CONVEX_DEPLOYMENT=dev:fixture-worker\nBETTER_AUTH_SECRET=preserve-me\n";
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, ".fake-convex-output-nonbootstrap"), "inject\n");
    const result = runFixture(fixture, ["dev"]);
    expect(result.status, output(result)).toBe(0);
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    expect(
      readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
    ).toBe(false);

    rmSync(join(fixture.root, ".fake-convex-output-nonbootstrap"));
    const codegen = runFixture(fixture, ["codegen"]);
    expect(codegen.status, output(codegen)).toBe(0);
    writeFileSync(join(fixture.root, ".fake-convex-output-nonbootstrap"), "inject\n");
    const driftedCodegen = runFixture(fixture, ["codegen"]);
    expect(driftedCodegen.status).not.toBe(0);
    expect(output(driftedCodegen)).toContain("unexpected .env.local output for codegen");
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
  });

  test("rejects Convex dev output that disagrees with authoritative application origins", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const original = [
      "CONVEX_DEPLOYMENT=dev:fixture-worker",
      "CONVEX_URL=https://other-worker.convex.cloud",
      "CONVEX_SITE_URL=https://other-worker.convex.site",
      "NEXT_PUBLIC_CONVEX_URL=https://other-worker.convex.cloud",
      "",
    ].join("\n");
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, ".delay-convex-dev"), "1500\n");

    const result = runFixture(fixture, ["dev"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("does not match the authoritative CONVEX_URL");
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    expect(
      readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
    ).toBe(false);
  });

  test("supervises a Convex dev interrupt until the child exits and temporary inputs are removed", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const instrumented = generated.replace(
      "    releaseEnvironmentLifecycleLock();\n  } catch (error) {",
      '    releaseEnvironmentLifecycleLock();\n    process.emit("SIGTERM");\n  } catch (error) {',
    );
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    const original = "CONVEX_DEPLOYMENT=dev:fixture-worker\nBETTER_AUTH_SECRET=preserve-me\n";
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, ".delay-convex-dev"), "2000\n");

    const interrupted = runFixture(fixture, ["dev"]);
    expect(interrupted.status).not.toBe(0);
    expect(output(interrupted)).toMatch(/signal|exit code/i);
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
    expect(
      readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
    ).toBe(false);
  });

  test("leaves a late unowned .env.local conflict untouched when Convex dev exits", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const original = "CONVEX_DEPLOYMENT=dev:fixture-worker\nBETTER_AUTH_SECRET=preserve-me\n";
    writeFileSync(join(fixture.root, ".dev.vars"), original);
    writeFileSync(join(fixture.root, ".recreate-convex-env-late"), "recreate\n");

    const result = runFixture(fixture, ["dev"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(".env.local reappeared after Convex dev startup");
    expect(output(result)).not.toContain("late-user-owned-value");
    expect(readFileSync(join(fixture.root, ".env.local"), "utf8")).toBe(
      "USER_SECRET=late-user-owned-value\n",
    );
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(original);
    expect(
      readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
    ).toBe(false);
  });

  test("fails closed on a stale Convex input until the stopped owner is explicitly reconciled", async () => {
    const owner = Bun.spawn([process.execPath, "-e", "process.exit(0)"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const ownerPid = owner.pid;
    expect(await owner.exited).toBe(0);
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    writeFileSync(join(fixture.root, ".dev.vars"), "CONVEX_DEPLOYMENT=dev:fixture-worker\n");
    const staleName = `.dev.vars.ghostinit-convex-${ownerPid}-00000000-0000-4000-8000-000000000000`;
    const stalePath = join(fixture.root, staleName);
    writeFileSync(stalePath, 'CONVEX_DEPLOYMENT="dev:fixture-worker"\n', { mode: 0o600 });

    const blocked = runFixture(fixture, ["dev"]);
    expect(blocked.status).not.toBe(0);
    expect(output(blocked)).toContain("stale Convex temporary environment");
    expect(existsSync(stalePath)).toBe(true);
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);

    rmSync(stalePath);
    const reconciled = runFixture(fixture, ["dev"]);
    expect(reconciled.status, output(reconciled)).toBe(0);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} canonicalizes pinned Convex public URL and site output`, () => {
      const publicKey = framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL";
      const publicSiteKey =
        framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_SITE_URL" : "VITE_CONVEX_SITE_URL";
      const plan = cloudflarePlan({ framework, mode: "single", database: "convex" });
      const fixture = track(
        createConvexFixture(generatedContent(plan, "scripts/cloudflare-convex.mjs"), publicKey),
      );
      writeFileSync(join(fixture.root, ".fake-convex-public-only"), "inject\n");
      const result = runFixture(fixture, ["bootstrap"]);
      expect(result.status, output(result)).toBe(0);
      const environment = readFileSync(join(fixture.root, ".dev.vars"), "utf8");
      expect(environment).toContain("CONVEX_DEPLOYMENT=dev:fixture-worker");
      expect(environment).toContain("CONVEX_URL=https://fixture-worker.convex.cloud");
      expect(environment).toContain(`${publicKey}=https://fixture-worker.convex.cloud`);
      expect(environment).toContain("CONVEX_SITE_URL=https://fixture-worker.convex.site");
      expect(environment).not.toContain(publicSiteKey);
      expect(readEvents(fixture.root, "convex-events.jsonl")[0]?.env?.deployKey).toBeNull();
    });
  }

  test("requires complete coherent bootstrap URL and site fields before mutation", () => {
    for (const marker of [
      ".fake-convex-incomplete",
      ".fake-convex-mismatched-site",
      ".fake-convex-mismatched-deployment",
    ]) {
      const plan = cloudflarePlan({ mode: "single", database: "convex" });
      const fixture = track(
        createConvexFixture(
          generatedContent(plan, "scripts/cloudflare-convex.mjs"),
          "NEXT_PUBLIC_CONVEX_URL",
        ),
      );
      writeFileSync(join(fixture.root, marker), "inject\n");
      const result = runFixture(fixture, ["bootstrap"]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toMatch(
        /missing or conflicting Convex site URL|different deployments/,
      );
      expect(existsSync(join(fixture.root, ".dev.vars"))).toBe(false);
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    }
  });

  test("removes an interrupted fixed prepared environment before the next child starts", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    const configured = "CONVEX_DEPLOYMENT=dev:fixture-worker\n";
    const prepared = join(fixture.root, ".dev.vars.ghostinit-prepared");
    writeFileSync(join(fixture.root, ".dev.vars"), configured);
    writeFileSync(prepared, "BETTER_AUTH_SECRET=orphaned-secret-material\n");
    const result = runFixture(fixture, ["dev"]);
    expect(result.status, output(result)).toBe(0);
    expect(existsSync(prepared)).toBe(false);
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(configured);
  });

  test("fails closed on malformed and conflicting duplicate Convex dotenv output", () => {
    for (const marker of [".fake-convex-malformed", ".fake-convex-conflicting-duplicate"]) {
      const plan = cloudflarePlan({ mode: "single", database: "convex" });
      const fixture = track(
        createConvexFixture(
          generatedContent(plan, "scripts/cloudflare-convex.mjs"),
          "NEXT_PUBLIC_CONVEX_URL",
        ),
      );
      writeFileSync(join(fixture.root, marker), "inject\n");
      const result = runFixture(fixture, ["bootstrap"]);
      expect(result.status).not.toBe(0);
      expect(output(result)).toMatch(/malformed dotenv field|conflicting duplicate values/);
      expect(existsSync(join(fixture.root, ".dev.vars"))).toBe(false);
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    }
  });

  test("aggregates rejected bootstrap output cleanup failures without mutating mirrors", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync as realUnlinkSync, writeFileSync } from "node:fs";',
      "function unlinkSync(path) {",
      '  if (String(path).endsWith(".env.local") && process.env.GHOSTINIT_INJECT_REJECTED_OUTPUT_CLEANUP_FAILURE === "1") throw new Error("injected generated output cleanup failure");',
      "  return realUnlinkSync(path);",
      "}",
    ].join("\n");
    const instrumented = generated.replace(importLine, injectedImport);
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    writeFileSync(join(fixture.root, ".fake-convex-malformed"), "inject\n");

    const result = runFixture(fixture, ["bootstrap"], {
      GHOSTINIT_INJECT_REJECTED_OUTPUT_CLEANUP_FAILURE: "1",
    });
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(
      "Convex bootstrap output was rejected and could not be removed",
    );
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(true);
    expect(existsSync(join(fixture.root, ".dev.vars"))).toBe(false);
  });

  test("rejects linked and special dotenv entries before Convex invocation", () => {
    const plan = cloudflarePlan({ mode: "single", database: "convex" });
    const fixture = track(
      createConvexFixture(
        generatedContent(plan, "scripts/cloudflare-convex.mjs"),
        "NEXT_PUBLIC_CONVEX_URL",
      ),
    );
    symlinkSync(
      join(fixture.root, "missing-secret-source"),
      join(fixture.root, ".dev.vars"),
      "file",
    );
    const linked = runFixture(fixture, ["bootstrap"]);
    expect(linked.status).not.toBe(0);
    expect(output(linked)).toContain("Unsafe or oversized dotenv entry");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
    rmSync(join(fixture.root, ".dev.vars"));

    mkdirSync(join(fixture.root, ".env.local"));
    const special = runFixture(fixture, ["bootstrap"]);
    expect(special.status).not.toBe(0);
    expect(output(special)).toContain("Refusing to run Convex while .env.local exists");
    expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
  });

  test("continues rollback after a secondary cleanup failure and preserves recovery pairs", () => {
    const plan = cloudflarePlan({ mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync as realRenameSync, unlinkSync as realUnlinkSync, writeFileSync } from "node:fs";',
      "let targetInstallCount = 0;",
      "function renameSync(source, destination) {",
      '  if (String(source).includes(".dev.vars.ghostinit-") && ++targetInstallCount === 2) throw new Error("injected second target install failure");',
      "  return realRenameSync(source, destination);",
      "}",
      "let installedTargetUnlinkFailed = false;",
      "function unlinkSync(path) {",
      '  if (!installedTargetUnlinkFailed && String(path).endsWith(".dev.vars")) { installedTargetUnlinkFailed = true; throw new Error("injected rollback unlink failure"); }',
      "  return realUnlinkSync(path);",
      "}",
    ].join("\n");
    const instrumented = generated.replace(importLine, injectedImport);
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    const original =
      "CONVEX_DEPLOYMENT=dev:example-123\nBETTER_AUTH_SECRET=original-server-secret-value\n";
    const rootValues = join(fixture.root, ".dev.vars");
    const webValues = join(fixture.root, "apps/web/.dev.vars");
    writeFileSync(rootValues, original);
    writeFileSync(webValues, original);

    const result = runFixture(fixture, ["bootstrap"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(
      "Convex environment update failed and rollback was incomplete",
    );
    expect(existsSync(rootValues)).toBe(true);
    expect(readFileSync(`${rootValues}.ghostinit-backup`, "utf8")).toBe(original);
    expect(readFileSync(webValues, "utf8")).toBe(original);
    expect(existsSync(`${webValues}.ghostinit-backup`)).toBe(false);
    expect(
      [...readdirSync(fixture.root), ...readdirSync(join(fixture.root, "apps/web"))].some(
        (name) => name.includes(".dev.vars.ghostinit-") && !name.endsWith(".ghostinit-backup"),
      ),
    ).toBe(false);
  });
});
