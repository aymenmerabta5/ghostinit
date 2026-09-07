// @allow-long 450: one installed-tarball lifecycle verifies package contents and both generated runtime contracts
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import {
  STALE_DIST_SENTINEL,
  verifyDistClosure,
  verifyPackedPackageClosure,
} from "../../scripts/package-contract.js";
import { minimumReleaseAgeBunfigContent } from "../helpers/bunfig.js";

const root = resolve(import.meta.dir, "../..");
const BUN_EXECUTABLE = process.execPath;
const TSCONFIG_PATH_DIAGNOSTIC =
  /TS(?:5061|5062|5090)|substitution.*more than one|non-relative paths are not allowed/i;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function holdSharedDistReader(path: string, directory: string): Promise<() => Promise<void>> {
  if (process.platform !== "win32") {
    const handle = openSync(path, "r");
    return async () => closeSync(handle);
  }

  const ready = join(directory, "shared-dist-reader.ready");
  const release = join(directory, "shared-dist-reader.release");
  const script = [
    `$handle = [System.IO.File]::Open(${powershellLiteral(path)}, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)`,
    `[System.IO.File]::WriteAllText(${powershellLiteral(ready)}, 'ready')`,
    `try { while (-not [System.IO.File]::Exists(${powershellLiteral(release)})) { Start-Sleep -Milliseconds 20 } } finally { $handle.Dispose() }`,
  ].join("; ");
  const child = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  let childError: Error | undefined;
  let stderr = "";
  child.once("error", (error) => {
    childError = error;
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const deadline = Date.now() + 10_000;
  while (!existsSync(ready) && child.exitCode === null && !childError && Date.now() < deadline) {
    await Bun.sleep(20);
  }
  if (!existsSync(ready)) {
    child.kill();
    throw new Error(
      `Unable to hold shared dist reader: ${childError?.message ?? (stderr.trim() || `exit ${child.exitCode}`)}`,
    );
  }

  return async () => {
    writeFileSync(release, "release\n");
    const exit =
      child.exitCode === null
        ? await Promise.race([
            once(child, "exit").then(([code]) => code),
            Bun.sleep(10_000).then(() => "timeout" as const),
          ])
        : child.exitCode;
    if (exit === "timeout") {
      child.kill();
      throw new Error("Timed out releasing shared dist reader");
    }
    if (exit !== 0) throw new Error(`Shared dist reader failed (exit ${exit}): ${stderr.trim()}`);
  };
}

test("runtime.node.packed-cli.v1: the exact Bun-packed tarball generates Bun and Node projects", async () => {
  expect(Bun.version).toBe(runtime.bun);
  const temp = mkdtempSync(join(tmpdir(), "ghostinit pack-"));
  try {
    const suppliedTarball = process.env.GHOSTINIT_PACKED_TARBALL?.trim();
    let tarballPath: string;
    let filename: string;
    if (suppliedTarball) {
      tarballPath = resolve(suppliedTarball);
      filename = basename(tarballPath);
      expect(existsSync(tarballPath)).toBe(true);
      expect(lstatSync(tarballPath).isFile()).toBe(true);
      expect(lstatSync(tarballPath).isSymbolicLink()).toBe(false);
    } else {
      const sourceRoot = join(root, "src");
      const distRoot = join(root, "dist");
      const distBefore = verifyDistClosure(sourceRoot, distRoot, "Live dist");
      expect(distBefore).not.toContain(STALE_DIST_SENTINEL);
      const cliHashBefore = sha256(join(distRoot, "cli.js"));
      const releaseSharedReader = await holdSharedDistReader(join(distRoot, "cli.js"), temp);
      let packed: ReturnType<typeof Bun.spawnSync>;
      try {
        packed = Bun.spawnSync({
          cmd: [BUN_EXECUTABLE, "pm", "pack", "--destination", temp, "--quiet"],
          cwd: root,
          stdout: "pipe",
          stderr: "pipe",
        });
      } finally {
        await releaseSharedReader();
      }
      if (packed.exitCode !== 0) {
        throw new Error(
          `bun pm pack failed with exit code ${packed.exitCode}: ${new TextDecoder().decode(packed.stderr)}`,
        );
      }
      const reportedPath = new TextDecoder().decode(packed.stdout).trim().split(/\r?\n/).at(-1);
      if (!reportedPath) throw new Error("bun pm pack did not report a tarball filename");
      filename = basename(reportedPath);
      tarballPath = isAbsolute(reportedPath) ? reportedPath : join(temp, reportedPath);
      expect(sha256(join(distRoot, "cli.js"))).toBe(cliHashBefore);
      expect(verifyDistClosure(sourceRoot, distRoot, "Live dist")).toEqual(distBefore);
    }
    expect(filename).toMatch(/^ghostinit-\d+\.\d+\.\d+\.tgz$/);
    expect(existsSync(tarballPath)).toBe(true);

    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );
    writeFileSync(join(temp, "bunfig.toml"), minimumReleaseAgeBunfigContent());
    execFileSync(
      BUN_EXECUTABLE,
      ["add", "--exact", tarballPath, "typescript@7.0.2", `@types/bun@${runtime.bun}`],
      {
        cwd: temp,
        stdio: "pipe",
        shell: false,
      },
    );

    const installedPackageRoot = join(temp, "node_modules", "ghostinit");
    const packedClosure = verifyPackedPackageClosure(installedPackageRoot);
    expect(packedClosure.distFiles).not.toContain(STALE_DIST_SENTINEL);
    expect(packedClosure.files).not.toContain(`dist/${STALE_DIST_SENTINEL}`);
    const installedPackage = JSON.parse(
      readFileSync(join(installedPackageRoot, "package.json"), "utf8"),
    ) as {
      types: string;
      exports: {
        ".": { types: string; default: string };
        "./schemas/*": string;
        "./compatibility/*": string;
      };
    };
    expect(installedPackage.types).toBe("dist/cli.d.ts");
    expect(installedPackage.exports["."].types).toBe("./dist/cli.d.ts");
    expect(installedPackage.exports["."].default).toBe("./dist/cli.js");
    expect(installedPackage.exports["./schemas/*"]).toBe("./schemas/*");
    expect(installedPackage.exports["./compatibility/*"]).toBe("./evidence/compatibility/*");
    for (const path of [
      "dist/cli.d.ts",
      "dist/cli.js",
      "policy/component-size-policy.json",
      "evidence/compatibility/runtime-node.json",
      "evidence/compatibility/runtime-node.schema.json",
      "evidence/compatibility/v1-to-v2.json",
      "docs/engineering/frontend-task-records/design-system-contract-v1.json",
      "schemas/json-envelope.schema.json",
      "schemas/support-catalog.schema.json",
      "schemas/project-config.schema.json",
      "schemas/resolved-project-config.schema.json",
      "schemas/state.schema.json",
    ]) {
      expect(existsSync(join(temp, "node_modules", "ghostinit", ...path.split("/"))), path).toBe(
        true,
      );
    }
    const runtimeEvidence = JSON.parse(
      readFileSync(
        join(temp, "node_modules", "ghostinit", "evidence", "compatibility", "runtime-node.json"),
        "utf8",
      ),
    ) as { entries?: Array<{ id?: string; releaseGateClaim?: boolean }> };
    expect(runtimeEvidence.entries).toEqual([
      expect.objectContaining({
        id: "runtime.node.generated-matrix.v1",
        releaseGateClaim: false,
      }),
      expect.objectContaining({ id: "runtime.node.packed-cli.v1", releaseGateClaim: false }),
    ]);
    expect(
      readFileSync(join(temp, "node_modules", "ghostinit", "src", "cli.ts"), "utf8").split(
        /\r?\n/,
        1,
      )[0],
    ).toBe("#!/usr/bin/env bun");

    writeFileSync(join(temp, "index.ts"), 'import { main } from "ghostinit";\nvoid main;\n');
    writeFileSync(
      join(temp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["bun"],
        },
        include: ["index.ts"],
      }),
    );
    expect(
      execFileSync(BUN_EXECUTABLE, ["x", "--no-install", "tsc", "--version"], {
        cwd: temp,
        encoding: "utf8",
        shell: false,
      }).trim(),
    ).toBe("Version 7.0.2");
    execFileSync(BUN_EXECUTABLE, ["x", "--no-install", "tsc", "--noEmit"], {
      cwd: temp,
      stdio: "pipe",
      shell: false,
    });

    const installedCli = join(temp, "node_modules", "ghostinit", "dist", "cli.js");
    const importProbe = join(temp, "runtime-import.mjs");
    writeFileSync(
      importProbe,
      'import { main } from "ghostinit";\nprocess.stdout.write(`packed-import-safe:${typeof main}\\n`);\n',
    );
    for (const executable of [BUN_EXECUTABLE, "node"]) {
      const imported = spawnSync(executable, [importProbe], {
        cwd: temp,
        encoding: "utf8",
        shell: false,
      });
      expect(imported.error).toBeUndefined();
      expect(imported.status, `${executable}: ${imported.stderr}`).toBe(0);
      expect(imported.stdout).toBe("packed-import-safe:function\n");
      expect(imported.stderr).toBe("");

      const direct = spawnSync(executable, [installedCli, "--version"], {
        cwd: temp,
        encoding: "utf8",
        shell: false,
      });
      expect(direct.error).toBeUndefined();
      expect(direct.status, `${executable}: ${direct.stderr}`).toBe(0);
      expect(direct.stdout.trim()).toMatch(/^ghostinit \d+\.\d+\.\d+$/);
    }

    const bin = [
      join(temp, "node_modules", ".bin", "ghostinit.exe"),
      join(temp, "node_modules", ".bin", "ghostinit.cmd"),
      join(temp, "node_modules", ".bin", "ghostinit"),
    ].find(existsSync);
    expect(bin).toBeDefined();
    const version =
      process.platform === "win32" && bin!.endsWith(".cmd")
        ? execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `call "${bin}" --version`],
            {
              cwd: temp,
              encoding: "utf8",
              shell: false,
            },
          ).trim()
        : execFileSync(bin!, ["--version"], {
            cwd: temp,
            encoding: "utf8",
            shell: false,
          }).trim();
    expect(version).toMatch(/^ghostinit \d+\.\d+\.\d+$/);
    const capabilities =
      process.platform === "win32" && bin!.endsWith(".cmd")
        ? execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `call "${bin}" capabilities --json`],
            { cwd: temp, encoding: "utf8", shell: false },
          ).trim()
        : execFileSync(bin!, ["capabilities", "--json"], {
            cwd: temp,
            encoding: "utf8",
            shell: false,
          }).trim();
    const capabilitiesPayload = JSON.parse(capabilities) as {
      schemaVersion: number;
      data: {
        catalog: { catalogVersion: number };
        schemas: { projectConfig: { schemaVersion: number } };
      };
    };
    expect(capabilitiesPayload.schemaVersion).toBe(2);
    expect(capabilitiesPayload.data.catalog.catalogVersion).toBe(2);
    expect(capabilitiesPayload.data.schemas.projectConfig.schemaVersion).toBe(2);

    const generatedParent = join(temp, "generated-projects");
    mkdirSync(generatedParent);
    const createResult = spawnSync(
      BUN_EXECUTABLE,
      [
        installedCli,
        "create",
        "packed-demo",
        "--cwd",
        generatedParent,
        "--yes",
        "--no-install",
        "--force",
        "--runtime",
        "bun",
        "--json",
      ],
      { cwd: generatedParent, encoding: "utf8", shell: false },
    );
    expect(createResult.error).toBeUndefined();
    expect(createResult.status, createResult.stderr).toBe(0);
    expect(createResult.stderr).not.toMatch(TSCONFIG_PATH_DIAGNOSTIC);
    const createPayload = JSON.parse(createResult.stdout) as {
      success?: unknown;
      exitCode?: unknown;
      data?: { projectPath?: unknown };
    };
    expect(createPayload.success).toBe(true);
    expect(createPayload.exitCode).toBe(0);

    const projectRoot = join(generatedParent, "packed-demo");
    expect(existsSync(join(projectRoot, "package.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).packageManager).toBe(
      `bun@${runtime.bun}`,
    );

    const showConfig = spawnSync(
      BUN_EXECUTABLE,
      ["x", "--no-install", "tsc", "--showConfig", "--project", join(projectRoot, "tsconfig.json")],
      { cwd: temp, encoding: "utf8", shell: false },
    );
    expect(showConfig.error).toBeUndefined();
    expect(showConfig.status, `${showConfig.stdout}\n${showConfig.stderr}`).toBe(0);
    expect(showConfig.stderr.trim()).toBe("");
    expect(`${showConfig.stdout}\n${showConfig.stderr}`).not.toMatch(TSCONFIG_PATH_DIAGNOSTIC);

    const checkResult = spawnSync(
      BUN_EXECUTABLE,
      [installedCli, "check", "--cwd", projectRoot, "--json"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        shell: false,
      },
    );
    expect(checkResult.error).toBeUndefined();
    expect(checkResult.status, checkResult.stderr).toBe(0);
    expect(checkResult.stderr).not.toMatch(TSCONFIG_PATH_DIAGNOSTIC);
    const checkPayload = JSON.parse(checkResult.stdout) as {
      success?: unknown;
      exitCode?: unknown;
      data?: {
        findings?: Array<{ severity?: unknown }>;
        summary?: { blockers?: unknown; highs?: unknown };
      };
    };
    expect(checkPayload.success).toBe(true);
    expect(checkPayload.exitCode).toBe(0);
    expect(checkPayload.data?.summary).toMatchObject({ blockers: 0, highs: 0 });
    expect(
      (checkPayload.data?.findings ?? []).filter(
        ({ severity }) => severity === "BLOCKER" || severity === "HIGH",
      ),
    ).toEqual([]);

    const nodeProjectName = "packed-node-demo";
    const nodeCreateResult = spawnSync(
      BUN_EXECUTABLE,
      [
        installedCli,
        "create",
        nodeProjectName,
        "--cwd",
        generatedParent,
        "--yes",
        "--no-install",
        "--force",
        "--runtime",
        "node",
        "--json",
      ],
      { cwd: generatedParent, encoding: "utf8", shell: false },
    );
    expect(nodeCreateResult.error).toBeUndefined();
    expect(nodeCreateResult.status, nodeCreateResult.stderr).toBe(0);
    const nodeCreatePayload = JSON.parse(nodeCreateResult.stdout) as {
      success?: unknown;
      exitCode?: unknown;
    };
    expect(nodeCreatePayload).toMatchObject({ success: true, exitCode: 0 });

    const nodeProjectRoot = join(generatedParent, nodeProjectName);
    const modulesManifest = JSON.parse(
      readFileSync(join(nodeProjectRoot, "packages", "modules", "package.json"), "utf8"),
    ) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const modulesTsconfig = JSON.parse(
      readFileSync(join(nodeProjectRoot, "packages", "modules", "tsconfig.json"), "utf8"),
    ) as { compilerOptions?: { types?: string[] } };
    expect(modulesManifest.devDependencies?.["bun-types"]).toBe(runtime.bun);
    expect(modulesManifest.devDependencies?.["@types/node"]).toBe(runtime["@types/node"]);
    expect(modulesManifest.scripts?.test).toBe("bun test");
    expect(modulesTsconfig.compilerOptions?.types).toEqual(["bun-types/test", "node"]);
    expect(modulesTsconfig.compilerOptions?.types).not.toContain("bun-types");
    if (!suppliedTarball) expect(readdirSync(temp)).toContain(filename);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 300_000);
