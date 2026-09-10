import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { runtime, supplyChain } from "../../packages/versions/src/index.js";
import { hashContent } from "../../src/lib/checksum.js";
import { FsTransaction } from "../../src/lib/fs.js";
import type {
  SupervisedCommandInput,
  SupervisedCommandResult,
} from "../../src/lib/process-supervisor.js";
import type {
  DependencySecurityPolicy,
  DependencySecurityRuntimeDependencies,
} from "../../src/lib/dependency-security/runtime-types.js";

export const securityTestPolicy: DependencySecurityPolicy = {
  expectedBunVersion: runtime.bun,
  minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
  auditScriptContent: "// Private canonical auditor substituted by the unit process boundary.\n",
  patchedAdvisories: [],
};

export const testIntegrity = `sha512-${Buffer.alloc(64, 7).toString("base64")}`;
export const testAdvisory = {
  severity: "high",
  url: "https://github.com/advisories/GHSA-2345-6789-cfgh",
};
export const oldSecurityLock = '{"phase":"old"}\n';
export const fixedSecurityLock = '{"phase":"fixed"}\n';

export function testFixReport(packageJson: unknown[] = []): Record<string, unknown> {
  return {
    dryRun: false,
    fixed: 1,
    remaining: 0,
    fixes: [
      {
        name: "vulnerable-child",
        from: "1.0.0",
        to: "1.0.1",
        downgrade: false,
        newerThanMinimumReleaseAge: false,
        packageJson,
      },
    ],
    blocked: [],
    unfixable: [],
    manifestUnavailable: [],
    unmatched: [],
    unaudited: [],
    vulnerableAfterInstall: [],
  };
}

export async function writeSecurityTestFile(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  const tx = new FsTransaction(root);
  await tx.write(path, content);
  await tx.commit();
}

export async function securityTestRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-security-test-"));
  const tx = new FsTransaction(root);
  await tx.write(
    "package.json",
    `${JSON.stringify({ name: "security-fixture", private: true, dependencies: { "parent-package": "1.0.0" } }, null, 2)}\n`,
  );
  await tx.write(
    "bunfig.toml",
    `[install]\nhoist = true\nregistry = "https://registry.npmjs.org/"\nminimumReleaseAge = ${supplyChain.minimumReleaseAgeSeconds}\nminimumReleaseAgeExcludes = []\n\n[install.lockfile]\npath = "bun.lock"\n`,
  );
  await tx.write("bun.lock", oldSecurityLock);
  await tx.write(".env.local", "PRIVATE_UNIT_SENTINEL=never-copy-this\n");
  await tx.write("src/private.ts", "export const privateSource = true;\n");
  await tx.commit();
  return root;
}

export async function securityTreeBytes(root: string): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else
        output[relative(root, child).replaceAll("\\", "/")] = (await readFile(child)).toString(
          "base64",
        );
    }
  };
  await walk(root);
  return output;
}

export interface SecurityProcessFixture {
  readonly dependencies: DependencySecurityRuntimeDependencies;
  readonly commands: SupervisedCommandInput[];
  readonly candidates: Set<string>;
  beforeCommand?: (
    input: SupervisedCommandInput,
    argv: readonly string[],
  ) => Promise<SupervisedCommandResult | undefined>;
}

export function securityProcessFixture(): SecurityProcessFixture {
  const commands: SupervisedCommandInput[] = [];
  const candidates = new Set<string>();
  const fixture: SecurityProcessFixture = {
    commands,
    candidates,
    dependencies: {
      resolveBun: () => "verified-bun-test-executable",
      runCommand: async (input) => {
        commands.push(input);
        const argv = input.argv.filter((part) => part !== "--no-env-file");
        if (input.cwd.includes("ghostinit-security-") && input.cwd.endsWith("candidate"))
          candidates.add(input.cwd);
        const custom = await fixture.beforeCommand?.(input, argv);
        if (custom) return custom;
        const send = (value: unknown): void => input.onStdout?.(Buffer.from(JSON.stringify(value)));
        let exitCode = 0;
        if (argv[0] === "install" && argv.includes("--lockfile-only")) {
          if (!(await new FsTransaction(input.cwd).exists("bun.lock")))
            await writeSecurityTestFile(input.cwd, "bun.lock", oldSecurityLock);
        } else if (argv[0] === "audit" && argv[1] === "fix") {
          await writeSecurityTestFile(input.cwd, "bun.lock", fixedSecurityLock);
          send(testFixReport());
        } else if (argv[0] === "audit") {
          const old = (await readFile(join(input.cwd, "bun.lock"), "utf8")) === oldSecurityLock;
          send(old ? { "vulnerable-child": [testAdvisory] } : {});
          exitCode = old ? 1 : 0;
        } else if (
          argv[0]?.endsWith("audit-dependencies.ts") &&
          argv.includes("--refresh-lock-evidence")
        ) {
          const lock = await readFile(join(input.cwd, "bun.lock"), "utf8");
          const version = lock === oldSecurityLock ? "1.0.0" : "1.0.1";
          await writeSecurityTestFile(
            input.cwd,
            "dependency-lock-evidence.json",
            `${JSON.stringify(
              {
                schemaVersion: 1,
                registry: "https://registry.npmjs.org",
                minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
                auditedAt: new Date().toISOString(),
                lockSha256: hashContent(lock),
                releases: [
                  {
                    package: "parent-package",
                    version: "1.0.0",
                    publishedAt: "2020-01-01T00:00:00.000Z",
                    integrity: testIntegrity,
                  },
                  {
                    package: "vulnerable-child",
                    version,
                    publishedAt: "2020-01-01T00:00:00.000Z",
                    integrity: testIntegrity,
                  },
                ],
              },
              null,
              2,
            )}\n`,
          );
        }
        return {
          exitCode,
          signal: null,
          timedOut: false,
          cleanupVerified: true,
          ...(exitCode ? { error: new Error("audit exit 1") } : {}),
        };
      },
    },
  };
  return fixture;
}

export function sameSecurityRoot(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}
