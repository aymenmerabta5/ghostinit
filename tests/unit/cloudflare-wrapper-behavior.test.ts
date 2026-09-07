// @allow-long 900: executable Worker and Convex wrapper regressions share one isolated fixture contract
import { afterEach, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseDotenvAssignments } from "../../src/lib/dotenv.js";
import {
  cloudflarePlan,
  createConvexFixture,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  readEvents,
  runFixture,
  testEnvironment,
  type CloudflareFramework,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

const fixtures: RuntimeFixture[] = [];

function track(fixture: RuntimeFixture): RuntimeFixture {
  fixtures.push(fixture);
  return fixture;
}

function output(result: ReturnType<typeof runFixture>): string {
  return `${result.stdout}\n${result.stderr}`;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0).reverse()) destroyFixture(fixture);
});

describe("Cloudflare runtime environment boundary", () => {
  test("rejects case-variant, symbolic-link, and non-regular dotenv entries before invoking tools", () => {
    const fixture = track(createWorkerFixture());
    const caseVariant = join(fixture.root, ".EnV.LoCaL");
    writeFileSync(caseVariant, "SERVER_SECRET=must-not-build\n", "utf8");

    const caseResult = runFixture(fixture, ["dry-run"]);
    expect(caseResult.status).not.toBe(0);
    expect(output(caseResult)).toContain("Refusing Worker build because runtime .env files");
    expect(output(caseResult)).toContain(".EnV.LoCaL");
    expect(readEvents(fixture.root)).toEqual([]);
    rmSync(caseVariant);

    const target = join(fixture.root, "linked-secret-source");
    const link = join(fixture.root, ".env.production");
    writeFileSync(target, "SERVER_SECRET=linked-secret-value\n", "utf8");
    symlinkSync(target, link, "file");

    const linkResult = runFixture(fixture, ["dry-run"]);
    expect(linkResult.status).not.toBe(0);
    expect(output(linkResult)).toContain("Refusing Worker build because runtime .env files");
    expect(output(linkResult)).toContain(".env.production");
    expect(readEvents(fixture.root)).toEqual([]);
    rmSync(link);
    rmSync(target);

    const directory = join(fixture.root, ".env.runtime");
    mkdirSync(directory);
    const directoryResult = runFixture(fixture, ["dry-run"]);
    expect(directoryResult.status).not.toBe(0);
    expect(output(directoryResult)).toContain("Refusing Worker build because runtime .env files");
    expect(output(directoryResult)).toContain(".env.runtime");
    expect(readEvents(fixture.root)).toEqual([]);
    rmSync(directory, { recursive: true });

    const exampleTarget = join(fixture.root, "linked-example-source");
    const exampleLink = join(fixture.root, ".env.example");
    rmSync(exampleLink);
    writeFileSync(exampleTarget, "APP_NAME=linked-example\n", "utf8");
    symlinkSync(exampleTarget, exampleLink, "file");
    const exampleResult = runFixture(fixture, ["dry-run"]);
    expect(exampleResult.status).not.toBe(0);
    expect(output(exampleResult)).toContain("Unsafe or oversized .env.example");
    expect(readEvents(fixture.root)).toEqual([]);

    const source = readFileSync(join(fixture.root, fixture.script), "utf8");
    expect(source).toContain("function isRuntimeDotenvFileName(name)");
    expect(source).toContain('normalized === ".env.template"');
    expect(source).toContain("(?:example|template)");
    expect(source).not.toContain("entry.isFile() && /^\\.env");
  });

  test("allows documentation dotenv variants while continuing to reject runtime authorities", () => {
    const fixture = track(createWorkerFixture());
    for (const name of [
      ".env.template",
      ".env.production.example",
      ".env.staging.secrets.template",
    ]) {
      writeFileSync(join(fixture.root, name), "DOCUMENTED_KEY=REPLACE_WITH_VALUE\n", "utf8");
    }
    const result = runFixture(fixture, ["dry-run"]);
    expect(result.status, output(result)).toBe(0);
  });

  test("rechecks runtime dotenv files inside the owned lifecycle immediately before build", () => {
    const fixture = track(createWorkerFixture());
    writeFileSync(join(fixture.root, ".create-runtime-env-during-audit"), "create\n", "utf8");

    const result = runFixture(fixture, ["dry-run"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(".env.production.local");
    expect(output(result)).not.toContain("audit-race-secret");
    expect(readEvents(fixture.root)).toEqual([]);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toContain("SERVER_SECRET");
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} hides .dev.vars from adapter and Wrangler, restores it on success and failure`, () => {
      const localValues = "SERVER_SECRET=fixture-server-only-secret\nAPP_NAME=Local fixture\n";
      const fixture = track(createWorkerFixture({ framework, devVars: localValues }));
      const localPath = join(fixture.root, ".dev.vars");
      const hiddenPath = `${localPath}.ghostinit-build-hidden`;

      const succeeded = runFixture(fixture, ["dry-run"]);
      expect(succeeded.status, output(succeeded)).toBe(0);
      expect(readFileSync(localPath, "utf8")).toBe(localValues);
      expect(existsSync(hiddenPath)).toBe(false);
      const events = readEvents(fixture.root);
      expect(events.filter(({ action }) => action === "build")).toHaveLength(1);
      expect(events.filter(({ dryRun }) => dryRun)).toHaveLength(1);
      expect(events.every(({ devVarsExists }) => devVarsExists === false)).toBe(true);

      writeFileSync(join(fixture.root, ".fail-adapter"), "fail\n", "utf8");
      const failed = runFixture(fixture, ["dry-run"]);
      expect(failed.status).not.toBe(0);
      expect(readFileSync(localPath, "utf8")).toBe(localValues);
      expect(existsSync(hiddenPath)).toBe(false);
    });
  }

  test("the shared lifecycle lock blocks concurrent Worker and Convex wrappers without restoring hidden values", async () => {
    const localValues = "SERVER_SECRET=concurrent-fixture-secret\n";
    const plan = cloudflarePlan({ framework: "nextjs", database: "convex" });
    const fixture = track(createWorkerFixture({ plan, devVars: localValues }));
    const localPath = join(fixture.root, ".dev.vars");
    const hiddenPath = `${localPath}.ghostinit-build-hidden`;
    const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
    const pausedPath = join(fixture.cwd!, ".adapter-paused");
    const productionEnvironment = {
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
    };
    writeFileSync(join(fixture.cwd!, ".delay-adapter"), "3000\n", "utf8");

    const first = Bun.spawn([process.execPath, join(fixture.root, fixture.script), "dry-run"], {
      cwd: fixture.cwd,
      env: testEnvironment({ ...fixture.environment, ...productionEnvironment }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const firstStdout = new Response(first.stdout).text();
    const firstStderr = new Response(first.stderr).text();
    let completed = false;
    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(pausedPath) && Date.now() < deadline) await Bun.sleep(20);
      expect(existsSync(pausedPath)).toBe(true);
      expect(existsSync(localPath)).toBe(false);
      expect(existsSync(hiddenPath)).toBe(true);
      expect(existsSync(lockPath)).toBe(true);

      const concurrent = runFixture(fixture, ["dry-run"], productionEnvironment);
      expect(concurrent.status).not.toBe(0);
      expect(output(concurrent)).toContain("Another Cloudflare wrapper is already using");
      expect(output(concurrent)).not.toContain("concurrent-fixture-secret");
      expect(existsSync(localPath)).toBe(false);
      expect(existsSync(hiddenPath)).toBe(true);

      const convexFixture: RuntimeFixture = {
        root: fixture.root,
        cwd: fixture.root,
        script: "scripts/cloudflare-convex.mjs",
      };
      const convex = runFixture(convexFixture, ["bootstrap"]);
      expect(convex.status).not.toBe(0);
      expect(output(convex)).toContain("Another Cloudflare or Convex wrapper is already using");
      expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
      expect(existsSync(localPath)).toBe(false);
      expect(existsSync(hiddenPath)).toBe(true);

      expect(await first.exited).toBe(0);
      completed = true;
      const firstOutput = `${await firstStdout}\n${await firstStderr}`;
      expect(firstOutput).not.toContain("adapter observed .dev.vars");
      expect(readFileSync(localPath, "utf8")).toBe(localValues);
      expect(existsSync(hiddenPath)).toBe(false);
      expect(existsSync(lockPath)).toBe(false);
      expect(readEvents(fixture.root).every(({ devVarsExists }) => devVarsExists === false)).toBe(
        true,
      );
    } finally {
      if (!completed) {
        first.kill();
        await first.exited;
      }
    }
  });

  test("recovers an interrupted hidden environment only after acquiring a fresh lock", () => {
    const localValues = "SERVER_SECRET=crash-recovery-secret\n";
    const fixture = track(createWorkerFixture({ devVars: localValues }));
    const localPath = join(fixture.root, ".dev.vars");
    const hiddenPath = `${localPath}.ghostinit-build-hidden`;
    const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
    renameSync(localPath, hiddenPath);

    const recovered = runFixture(fixture, ["dry-run"]);
    expect(recovered.status, output(recovered)).toBe(0);
    expect(readFileSync(localPath, "utf8")).toBe(localValues);
    expect(existsSync(hiddenPath)).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
  });

  test("holds the lifecycle lock while a long-lived development child can read visible mirrors", () => {
    const fixture = track(createWorkerFixture({ framework: "tanstack-start" }));
    const result = runFixture(fixture, ["dev"]);
    expect(result.status, output(result)).toBe(0);
    const event = readEvents(fixture.root)[0];
    expect(event?.action).toBe("dev");
    expect(event?.devVarsExists).toBe(true);
    expect(event?.environmentLockExists).toBe(true);
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
  });

  test("Convex dev releases the writer lock before its child so application dev can run beside it", async () => {
    const plan = cloudflarePlan({ framework: "tanstack-start", database: "convex" });
    const configured = "CONVEX_DEPLOYMENT=dev:fixture-worker\n";
    const fixture = track(
      createWorkerFixture({ framework: "tanstack-start", plan, devVars: configured }),
    );
    writeFileSync(join(fixture.root, ".delay-convex-dev"), "2500\n", "utf8");
    appendFileSync(join(fixture.root, ".env.example"), "CONVEX_DEPLOYMENT=dev:example-123\n");

    const convex = Bun.spawn(
      [process.execPath, join(fixture.root, "scripts/cloudflare-convex.mjs"), "dev"],
      {
        cwd: fixture.root,
        env: testEnvironment(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const convexStdout = new Response(convex.stdout).text();
    const convexStderr = new Response(convex.stderr).text();
    let completed = false;
    try {
      const pausedPath = join(fixture.root, ".convex-dev-paused");
      const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
      const deadline = Date.now() + 5000;
      while ((!existsSync(pausedPath) || existsSync(lockPath)) && Date.now() < deadline) {
        await Bun.sleep(20);
      }
      expect(existsSync(pausedPath)).toBe(true);
      expect(existsSync(lockPath)).toBe(false);
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
      const temporaryInputs = readdirSync(fixture.root).filter((name) =>
        name.startsWith(".dev.vars.ghostinit-convex-"),
      );
      expect(temporaryInputs).toHaveLength(1);
      expect(readFileSync(join(fixture.root, temporaryInputs[0]!), "utf8")).toBe(
        'CONVEX_DEPLOYMENT="dev:fixture-worker"\n',
      );
      const convexEvent = readEvents(fixture.root, "convex-events.jsonl")[0];
      expect(convexEvent?.args[0]).toBe("dev");
      expect(convexEvent?.args[1]).toBe("--env-file");
      expect(convexEvent?.args[2]).toMatch(/^\.dev\.vars\.ghostinit-convex-\d+-[0-9a-f-]{36}$/);
      expect(convexEvent?.environmentLockExists).toBe(true);

      const application = runFixture(fixture, ["dev"], {
        CONVEX_DEPLOYMENT: "dev:fixture-worker",
        CONVEX_URL: "https://fixture-worker.convex.cloud",
        CONVEX_SITE_URL: "https://fixture-worker.convex.site",
        VITE_CONVEX_URL: "https://fixture-worker.convex.cloud",
      });
      expect(application.status, output(application)).toBe(0);
      const applicationEvent = readEvents(fixture.root).at(-1);
      expect(applicationEvent?.action).toBe("dev");
      expect(applicationEvent?.environmentLockExists).toBe(true);

      expect(await convex.exited).toBe(0);
      completed = true;
      expect(`${await convexStdout}\n${await convexStderr}`).not.toContain("fixture-worker");
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
      expect(
        readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
      ).toBe(false);
    } finally {
      if (!completed) {
        convex.kill();
        await convex.exited;
      }
    }
  });

  test("Convex dev fails closed when an application runtime already owns the visible mirrors", async () => {
    const plan = cloudflarePlan({ framework: "tanstack-start", database: "convex" });
    const configured = "CONVEX_DEPLOYMENT=dev:fixture-worker\n";
    const fixture = track(
      createWorkerFixture({ framework: "tanstack-start", plan, devVars: configured }),
    );
    appendFileSync(join(fixture.root, ".env.example"), "CONVEX_DEPLOYMENT=dev:example-123\n");
    writeFileSync(join(fixture.root, ".delay-runtime-child"), "2200\n", "utf8");
    const productionEnvironment = {
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      VITE_CONVEX_URL: "https://fixture-worker.convex.cloud",
    };
    const application = Bun.spawn([process.execPath, join(fixture.root, fixture.script), "dev"], {
      cwd: fixture.cwd,
      env: testEnvironment({ ...fixture.environment, ...productionEnvironment }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const applicationStdout = new Response(application.stdout).text();
    const applicationStderr = new Response(application.stderr).text();
    let completed = false;
    try {
      const pausedPath = join(fixture.cwd!, ".runtime-child-paused");
      const deadline = Date.now() + 5000;
      while (!existsSync(pausedPath) && Date.now() < deadline) await Bun.sleep(20);
      expect(existsSync(pausedPath)).toBe(true);
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(true);

      const convexFixture: RuntimeFixture = {
        root: fixture.root,
        cwd: fixture.root,
        script: "scripts/cloudflare-convex.mjs",
      };
      const convex = runFixture(convexFixture, ["dev"]);
      expect(convex.status).not.toBe(0);
      expect(output(convex)).toContain("Another Cloudflare or Convex wrapper is already using");
      expect(readEvents(fixture.root, "convex-events.jsonl")).toEqual([]);
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
      expect(
        readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
      ).toBe(false);

      expect(await application.exited).toBe(0);
      completed = true;
      expect(`${await applicationStdout}\n${await applicationStderr}`).not.toContain(
        "fixture-worker",
      );
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
    } finally {
      if (!completed) {
        application.kill();
        await application.exited;
      }
    }
  });

  test("passes reviewed build values but isolates arbitrary secrets and deploy credentials", () => {
    const fixture = track(createWorkerFixture());
    const environment = {
      APP_NAME: "Reviewed application name",
      SITE_URL: "https://public.fixture.example",
      NEXT_PUBLIC_APP_URL: "https://public.fixture.example",
      UNREVIEWED_BUILD_SECRET: "unreviewed-build-secret-value",
      CLOUDFLARE_API_TOKEN: "cloudflare-deploy-token-value",
    };

    const dryRun = runFixture(fixture, ["dry-run"], environment);
    expect(dryRun.status, output(dryRun)).toBe(0);
    const dryRunEvents = readEvents(fixture.root);
    expect(dryRunEvents).toHaveLength(2);
    for (const event of dryRunEvents) {
      expect(event.env?.appName).toBe(environment.APP_NAME);
      expect(event.env?.publicUrl).toBe(environment.NEXT_PUBLIC_APP_URL);
      expect(event.env?.unreviewed).toBeNull();
      expect(event.env?.credential).toBeNull();
    }

    rmSync(join(fixture.root, "events.jsonl"));
    const deploy = runFixture(fixture, ["deploy"], environment);
    expect(deploy.status, output(deploy)).toBe(0);
    const deployEvents = readEvents(fixture.root);
    const adapters = deployEvents.filter(({ tool }) => tool === "adapter");
    const wranglers = deployEvents.filter(({ tool }) => tool === "wrangler");
    expect(adapters).toHaveLength(2);
    expect(adapters.find(({ action }) => action === "build")?.env?.credential).toBeNull();
    expect(adapters.find(({ action }) => action === "deploy")?.env?.credential).toBe(
      environment.CLOUDFLARE_API_TOKEN,
    );
    expect(adapters.every(({ env }) => env?.unreviewed === null)).toBe(true);
    expect(wranglers).toHaveLength(1);
    expect(wranglers[0]?.env?.credential).toBeNull();
    expect(wranglers.every(({ env }) => env?.unreviewed === null)).toBe(true);
  });

  test("parses dotenv values and detects their serialized representation without disclosure", () => {
    const secret = 'alpha-line\nbeta-quote-"omega';
    const serializedSecret = JSON.stringify(secret).slice(1, -1);
    const localValues = 'export SERVER_SECRET="alpha-line\\nbeta-quote-\\"omega"\n';
    const fixture = track(
      createWorkerFixture({ artifactContent: serializedSecret, devVars: localValues }),
    );

    const result = runFixture(fixture, ["dry-run"]);
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(
      "Worker artifact contains the server-only value from SERVER_SECRET",
    );
    expect(output(result)).not.toContain(secret);
    expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toBe(localValues);
    expect(readFileSync(join(fixture.root, ".open-next/assets/index.html"), "utf8")).toBe(
      serializedSecret,
    );
    expect(serializedSecret).not.toBe(secret);

    const source = readFileSync(join(fixture.root, fixture.script), "utf8");
    expect(source).toContain('import { parse as parseDotenv } from "dotenv"');
    expect(source).toContain("const serialized = JSON.stringify(value).slice(1, -1)");
  });

  test("scans credential-bearing HTTP proxy URLs and userinfo without disclosure", () => {
    const proxyUrl = "http://proxy-user:proxy-password@127.0.0.1:9";
    const userinfo = "proxy-user:proxy-password";
    const cases = [
      { key: "HTTP_PROXY", leak: proxyUrl },
      { key: "HTTPS_PROXY", leak: userinfo },
    ] as const;

    for (const testCase of cases) {
      const fixture = track(createWorkerFixture({ artifactContent: testCase.leak }));
      const result = runFixture(fixture, ["dry-run"], { [testCase.key]: proxyUrl });
      const combined = output(result);
      expect(result.status).not.toBe(0);
      expect(combined).toContain("server-only value from " + testCase.key);
      expect(combined).not.toContain(proxyUrl);
      expect(combined).not.toContain(userinfo);
    }

    const latest = fixtures.at(-1)!;
    const source = readFileSync(join(latest.root, latest.script), "utf8");
    expect(source).toContain('normalizedKey === "HTTP_PROXY"');
    expect(source).toContain('normalizedKey === "HTTPS_PROXY"');
    expect(source).toContain("addSecretValue(values, value, key)");
    expect(source).toContain("addSecretValue(values, part, key)");
    expect(source).toContain("decodedUserinfo");
  });
});

describe("deployable Worker artifacts", () => {
  test("scans the actual Wrangler dry-run bundle for allowed server-only build values", () => {
    const plan = cloudflarePlan({ framework: "nextjs", database: "convex", auth: true });
    const fixture = track(createWorkerFixture({ plan }));
    const serverSecret = "auth-secret-that-must-never-enter-worker";
    writeFileSync(join(fixture.root, ".leak-dry-run"), "leak\n", "utf8");

    const result = runFixture(fixture, ["dry-run"], {
      BETTER_AUTH_SECRET: serverSecret,
      BETTER_AUTH_URL: "https://worker.fixture.example",
      CONVEX_DEPLOYMENT: "dev:fixture-worker",
      CONVEX_URL: "https://fixture-worker.convex.cloud",
      CONVEX_SITE_URL: "https://fixture-worker.convex.site",
      NEXT_PUBLIC_CONVEX_URL: "https://fixture-worker.convex.cloud",
    });
    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("server-only value from BETTER_AUTH_SECRET");
    expect(output(result).replaceAll("\\", "/")).toContain(".wrangler/ghostinit-dry-run/worker.js");
    expect(output(result)).not.toContain(serverSecret);
    expect(readFileSync(join(fixture.root, ".wrangler/ghostinit-dry-run/worker.js"), "utf8")).toBe(
      serverSecret,
    );
  });

  test("materializes and scans the Wrangler bundle plus both OpenNext deployable asset roots", () => {
    const fixture = track(createWorkerFixture());
    const first = runFixture(fixture, ["dry-run"]);
    expect(first.status, output(first)).toBe(0);
    expect(existsSync(join(fixture.root, ".wrangler/ghostinit-dry-run/worker.js"))).toBe(true);
    expect(existsSync(join(fixture.root, ".open-next/assets/index.html"))).toBe(true);
    expect(existsSync(join(fixture.root, ".open-next/cache/cache-entry"))).toBe(true);

    rmSync(join(fixture.root, ".open-next/cache"), { recursive: true, force: true });
    writeFileSync(join(fixture.root, ".omit-open-next-cache"), "omit\n", "utf8");
    const missingCache = runFixture(fixture, ["dry-run"]);
    expect(missingCache.status).not.toBe(0);
    expect(output(missingCache).replaceAll("\\", "/")).toContain(
      "Expected deployable asset root is missing: .open-next/cache",
    );

    const source = readFileSync(join(fixture.root, fixture.script), "utf8");
    expect(source).toContain('[".open-next/assets",".open-next/cache"]');
    expect(source).toContain('"wrangler", "deploy", "--dry-run", "--outdir", DRY_RUN_ROOT');
    expect(source.indexOf("scan(DRY_RUN_ROOT, secrets)")).toBeLessThan(
      source.indexOf("for (const root of DEPLOYABLE_ASSET_ROOTS)"),
    );
  });
});

describe("framework-aware argument forwarding", () => {
  const cases: readonly {
    readonly framework: CloudflareFramework;
    readonly accepted: string;
    readonly rejected: string;
  }[] = [
    { framework: "nextjs", accepted: "--ip", rejected: "--host" },
    { framework: "tanstack-start", accepted: "--host", rejected: "--ip" },
  ];

  for (const { framework, accepted, rejected } of cases) {
    test(`${framework} forwards the reviewed preview address flag and rejects the other adapter's flag`, () => {
      const fixture = track(createWorkerFixture({ framework }));
      const acceptedResult = runFixture(fixture, [
        "preview",
        accepted,
        "127.0.0.1",
        "--port=43123",
      ]);
      expect(acceptedResult.status, output(acceptedResult)).toBe(0);
      const previewEvent = readEvents(fixture.root).find(
        ({ tool, action }) => tool === "adapter" && action === "preview",
      );
      expect(previewEvent?.args).toContain(accepted);
      expect(previewEvent?.args).toContain("127.0.0.1");
      expect(previewEvent?.args).toContain("--port=43123");

      rmSync(join(fixture.root, "events.jsonl"));
      const rejectedResult = runFixture(fixture, ["preview", rejected, "127.0.0.1"]);
      expect(rejectedResult.status).not.toBe(0);
      expect(output(rejectedResult)).toContain(
        `Unsupported forwarded Cloudflare argument: ${rejected}`,
      );
      expect(readEvents(fixture.root)).toEqual([]);
    });
  }
});

describe("Cloudflare Convex environment synchronization", () => {
  test("accepts reordered and differently quoted mirrors with the same dotenv values", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo", database: "convex" });
    const script = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    expect(script).toContain("canonicalEnvironmentFields(parsed)");
    const fixture = track(createConvexFixture(script, "NEXT_PUBLIC_CONVEX_URL"));
    const rootValues = join(fixture.root, ".dev.vars");
    const webValues = join(fixture.root, "apps/web/.dev.vars");
    const secret = "persistent-local-secret-value";
    writeFileSync(
      rootValues,
      `CONVEX_DEPLOYMENT=dev:example-123\nBETTER_AUTH_SECRET=${secret}\nAPP_NAME="Ghost Init"\n`,
    );
    writeFileSync(
      webValues,
      `# ordering and comments are not values\nAPP_NAME=Ghost Init\nBETTER_AUTH_SECRET=${secret}\nCONVEX_DEPLOYMENT='dev:example-123'\n`,
    );

    const bootstrap = runFixture(fixture, ["bootstrap"]);
    expect(bootstrap.status, output(bootstrap)).toBe(0);
    const rootFields = [...parseDotenvAssignments(readFileSync(rootValues, "utf8"))].sort();
    const webFields = [...parseDotenvAssignments(readFileSync(webValues, "utf8"))].sort();
    expect(webFields).toEqual(rootFields);
    expect(rootFields).toContainEqual(["BETTER_AUTH_SECRET", secret]);
  });

  test("a partial second temporary write is removed without touching either original", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync as realWriteFileSync } from "node:fs";',
      "let temporaryWriteCount = 0;",
      "function writeFileSync(path, content, options) {",
      '  if (String(path).includes(".dev.vars.ghostinit-") && ++temporaryWriteCount === 2 && process.env.GHOSTINIT_INJECT_SECOND_TEMP_WRITE_FAILURE === "1") {',
      '    realWriteFileSync(path, "PARTIAL_SERVER_SECRET=must-be-removed\\n", options);',
      '    throw new Error("injected second temporary write failure");',
      "  }",
      "  return realWriteFileSync(path, content, options);",
      "}",
    ].join("\n");
    const instrumented = generated.replace(importLine, injectedImport);
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    const original = [
      "CONVEX_DEPLOYMENT=dev:example-123",
      "CONVEX_URL=https://example-123.convex.cloud",
      "CONVEX_SITE_URL=https://example-123.convex.site",
      "NEXT_PUBLIC_CONVEX_URL=https://example-123.convex.cloud",
      "BETTER_AUTH_SECRET=original-server-secret-value",
      "",
    ].join("\n");
    const rootValues = join(fixture.root, ".dev.vars");
    const webValues = join(fixture.root, "apps/web/.dev.vars");
    writeFileSync(rootValues, original, "utf8");
    writeFileSync(webValues, original, "utf8");

    const failed = runFixture(fixture, ["bootstrap"], {
      GHOSTINIT_INJECT_SECOND_TEMP_WRITE_FAILURE: "1",
    });
    expect(failed.status).not.toBe(0);
    expect(output(failed)).toContain("injected second temporary write failure");
    expect(readFileSync(rootValues, "utf8")).toBe(original);
    expect(readFileSync(webValues, "utf8")).toBe(original);
    expect(existsSync(rootValues + ".ghostinit-backup")).toBe(false);
    expect(existsSync(webValues + ".ghostinit-backup")).toBe(false);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    const temporaryFiles = [
      ...readdirSync(fixture.root).map((name) => join(fixture.root, name)),
      ...readdirSync(join(fixture.root, "apps/web")).map((name) =>
        join(fixture.root, "apps/web", name),
      ),
    ].filter((path) => path.includes(".dev.vars.ghostinit-"));
    expect(temporaryFiles).toEqual([]);

    const protectedWrite = instrumented.indexOf(
      "writeFileSync(replacement.temporary, replacement.content",
    );
    expect(protectedWrite).toBeGreaterThan(instrumented.indexOf("  try {"));
  });

  test("a second backup move failure restores the first backup and removes prepared files", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync as realRenameSync, unlinkSync, writeFileSync } from "node:fs";',
      "let backupMoveCount = 0;",
      "function renameSync(source, destination) {",
      '  if (String(destination).endsWith(".ghostinit-backup") && ++backupMoveCount === 2 && process.env.GHOSTINIT_INJECT_SECOND_BACKUP_MOVE_FAILURE === "1") throw new Error("injected second backup move failure");',
      "  return realRenameSync(source, destination);",
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

    const failed = runFixture(fixture, ["bootstrap"], {
      GHOSTINIT_INJECT_SECOND_BACKUP_MOVE_FAILURE: "1",
    });
    expect(failed.status).not.toBe(0);
    expect(output(failed)).toContain("injected second backup move failure");
    expect(readFileSync(rootValues, "utf8")).toBe(original);
    expect(readFileSync(webValues, "utf8")).toBe(original);
    expect(existsSync(`${rootValues}.ghostinit-backup`)).toBe(false);
    expect(existsSync(`${webValues}.ghostinit-backup`)).toBe(false);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    expect(
      [...readdirSync(fixture.root), ...readdirSync(join(fixture.root, "apps/web"))].some((name) =>
        name.includes(".dev.vars.ghostinit-"),
      ),
    ).toBe(false);
  });

  test("a second target install failure rolls back the first install and both backups", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync as realRenameSync, unlinkSync, writeFileSync } from "node:fs";',
      "let targetInstallCount = 0;",
      "function renameSync(source, destination) {",
      '  if (String(source).includes(".dev.vars.ghostinit-") && ++targetInstallCount === 2 && process.env.GHOSTINIT_INJECT_SECOND_TARGET_INSTALL_FAILURE === "1") throw new Error("injected second target install failure");',
      "  return realRenameSync(source, destination);",
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

    const failed = runFixture(fixture, ["bootstrap"], {
      GHOSTINIT_INJECT_SECOND_TARGET_INSTALL_FAILURE: "1",
    });
    expect(failed.status).not.toBe(0);
    expect(output(failed)).toContain("injected second target install failure");
    expect(readFileSync(rootValues, "utf8")).toBe(original);
    expect(readFileSync(webValues, "utf8")).toBe(original);
    expect(existsSync(`${rootValues}.ghostinit-backup`)).toBe(false);
    expect(existsSync(`${webValues}.ghostinit-backup`)).toBe(false);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
    expect(
      [...readdirSync(fixture.root), ...readdirSync(join(fixture.root, "apps/web"))].some((name) =>
        name.includes(".dev.vars.ghostinit-"),
      ),
    ).toBe(false);
  });

  test("a backup cleanup failure leaves an explicit recovery pair without losing secrets", () => {
    const plan = cloudflarePlan({ framework: "nextjs", mode: "monorepo", database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const importLine =
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";';
    const injectedImport = [
      'import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync as realUnlinkSync, writeFileSync } from "node:fs";',
      "let backupCleanupCount = 0;",
      "function unlinkSync(path) {",
      '  if (String(path).endsWith(".ghostinit-backup") && ++backupCleanupCount === 2 && process.env.GHOSTINIT_INJECT_SECOND_BACKUP_CLEANUP_FAILURE === "1") throw new Error("injected second backup cleanup failure");',
      "  return realUnlinkSync(path);",
      "}",
    ].join("\n");
    const instrumented = generated.replace(importLine, injectedImport);
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    const secret = "original-server-secret-value";
    const original = `CONVEX_DEPLOYMENT=dev:example-123\nBETTER_AUTH_SECRET=${secret}\n`;
    const rootValues = join(fixture.root, ".dev.vars");
    const webValues = join(fixture.root, "apps/web/.dev.vars");
    writeFileSync(rootValues, original);
    writeFileSync(webValues, original);

    const failed = runFixture(fixture, ["bootstrap"], {
      GHOSTINIT_INJECT_SECOND_BACKUP_CLEANUP_FAILURE: "1",
    });
    expect(failed.status).not.toBe(0);
    expect(output(failed)).toContain("injected second backup cleanup failure");
    expect(readFileSync(rootValues, "utf8")).toContain(`BETTER_AUTH_SECRET=${secret}`);
    expect(readFileSync(webValues, "utf8")).toContain(`BETTER_AUTH_SECRET=${secret}`);
    expect(existsSync(`${rootValues}.ghostinit-backup`)).toBe(false);
    expect(readFileSync(`${webValues}.ghostinit-backup`, "utf8")).toBe(original);
    expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);

    const recoveryBlocked = runFixture(fixture, ["bootstrap"]);
    expect(recoveryBlocked.status).not.toBe(0);
    expect(output(recoveryBlocked)).toContain(
      "Both .dev.vars and its recovery backup exist; reconcile them before continuing",
    );
    expect(readFileSync(webValues, "utf8")).toContain(`BETTER_AUTH_SECRET=${secret}`);
    expect(readFileSync(`${webValues}.ghostinit-backup`, "utf8")).toBe(original);
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} bootstrap atomically synchronizes root and web .dev.vars`, () => {
      const publicKey = framework === "nextjs" ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL";
      const plan = cloudflarePlan({ framework, mode: "monorepo", database: "convex" });
      const fixture = track(
        createConvexFixture(generatedContent(plan, "scripts/cloudflare-convex.mjs"), publicKey),
      );
      const original = [
        "CONVEX_DEPLOYMENT=dev:example-123",
        "CONVEX_URL=https://example-123.convex.cloud",
        "CONVEX_SITE_URL=https://example-123.convex.site",
        `${publicKey}=https://example-123.convex.cloud`,
        "BETTER_AUTH_SECRET=persistent-local-secret-value",
        "",
      ].join("\n");
      const rootValues = join(fixture.root, ".dev.vars");
      const webValues = join(fixture.root, "apps/web/.dev.vars");
      writeFileSync(rootValues, original, "utf8");
      writeFileSync(webValues, original, "utf8");

      const bootstrap = runFixture(fixture, ["bootstrap"]);
      expect(bootstrap.status, output(bootstrap)).toBe(0);
      const synchronized = readFileSync(rootValues, "utf8");
      expect(readFileSync(webValues, "utf8")).toBe(synchronized);
      expect(synchronized).toContain("CONVEX_DEPLOYMENT=dev:fixture-worker");
      expect(synchronized).toContain("CONVEX_URL=https://fixture-worker.convex.cloud");
      expect(synchronized).toContain(`${publicKey}=https://fixture-worker.convex.cloud`);
      expect(synchronized).toContain("BETTER_AUTH_SECRET=persistent-local-secret-value");
      expect(existsSync(join(fixture.root, ".env.local"))).toBe(false);
      expect(existsSync(`${rootValues}.ghostinit-backup`)).toBe(false);
      expect(existsSync(`${webValues}.ghostinit-backup`)).toBe(false);
      const bootstrapArgs = readEvents(fixture.root, "convex-events.jsonl")[0]?.args ?? [];
      expect(bootstrapArgs).toEqual(["dev", "--once"]);

      const development = runFixture(fixture, ["dev"]);
      expect(development.status, output(development)).toBe(0);
      const developmentArgs = readEvents(fixture.root, "convex-events.jsonl").at(-1)?.args ?? [];
      expect(developmentArgs[0]).toBe("dev");
      expect(developmentArgs[1]).toBe("--env-file");
      expect(developmentArgs[2]).toMatch(/^\.dev\.vars\.ghostinit-convex-\d+-[0-9a-f-]{36}$/);
      expect(readFileSync(webValues, "utf8")).toBe(readFileSync(rootValues, "utf8"));
    });
  }
});
