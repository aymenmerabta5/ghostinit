import { describe, expect, test } from "bun:test";
import { existsSync, realpathSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { convex, runtime, typescript } from "../../packages/versions/src/index.js";
import {
  COMPONENT_PROBE_PATH,
  ROOT_PROBE_PATH,
  assertGeneratedSourcesUnchanged,
  codegenProbeSource,
  prepareCodegenFixture,
  writeCodegenFile,
} from "../helpers/convex-codegen-fixture.js";
import {
  ConvexCodegenRunner,
  assertLocalBackendStopped,
  fileSha256,
  inspectLocalCodegenBackend,
} from "../helpers/convex-codegen-process.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { startCodegenOwner } from "../helpers/convex-codegen-owner.js";

const describeCodegen = process.env.CONVEX_CODEGEN_RUNTIME === "1" ? describe : describe.skip;

async function removeOwnedFixture(root: string): Promise<void> {
  const parent = realpathSync.native(tmpdir());
  const child = relative(parent, root);
  if (
    !child ||
    child.startsWith("..") ||
    isAbsolute(child) ||
    !basename(root).startsWith("ghostinit-convex-codegen-")
  ) {
    throw new Error(`Refusing to remove an unverified Convex fixture: ${root}`);
  }
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

describeCodegen("public anonymous-local Convex codegen (opt-in)", () => {
  test("replaces the generated bootstrap with strict root and component APIs", async () => {
    expect(Bun.version).toBe(runtime.bun);
    const root = createTemporaryWorkspace("ghostinit-convex-codegen-");
    let runner: ConvexCodegenRunner | undefined;
    let portsVerified = true;
    let proofPassed = false;
    let owner: ReturnType<typeof startCodegenOwner> | undefined;
    let ownerClosed = false;
    try {
      const fixture = await prepareCodegenFixture(root);
      runner = new ConvexCodegenRunner(root, fixture.secret);
      const node = Bun.which("node");
      if (!node)
        throw new Error("The public Convex CLI requires an installed Node.js runtime (>=20)");
      const nodeResult = await runner.success("Node prerequisite", node, ["--version"]);
      expect(Number(/^v(\d+)\./.exec(nodeResult.output.trim())?.[1] ?? 0)).toBeGreaterThanOrEqual(
        20,
      );
      await runner.success(
        "Install exact codegen fixture",
        process.execPath,
        ["--smol", "install"],
        300_000,
      );
      await runner.success("Audit installed codegen fixture", process.execPath, [
        "audit",
        "--audit-level=high",
      ]);

      const cli = join(root, "node_modules", "convex", "bin", "main.js");
      const nativeAlias = join(root, "node_modules", "@typescript", "native", "bin", "tsc");
      const compiler = existsSync(nativeAlias)
        ? nativeAlias
        : join(root, "node_modules", "typescript", "bin", "tsc");
      const compilerPackage = JSON.parse(
        await readFile(join(dirname(compiler), "..", "package.json"), "utf8"),
      ) as { version: string };
      expect(compilerPackage.version).toBe(typescript.typescript);
      const cliVersion = await runner.success("Convex CLI version", node, [cli, "--version"]);
      expect(cliVersion.output.trim()).toBe(convex.convex);
      const compilerVersion = await runner.success("Selected TypeScript CLI version", node, [
        compiler,
        "--version",
      ]);
      expect(compilerVersion.output.trim()).toBe(`Version ${typescript.typescript}`);

      await runner.success("Initialize anonymous local backend", node, [cli, "init"], 240_000);
      let backend = await inspectLocalCodegenBackend(root);
      const confirmStopped = async (): Promise<void> => {
        try {
          await assertLocalBackendStopped(backend);
        } catch (error) {
          portsVerified = false;
          throw error;
        }
      };
      await confirmStopped();
      const codegen = async (label: string, args: string[]) => {
        if (owner && !owner.running)
          throw new Error("Public local dev owner exited before codegen");
        const result = await runner!.run(label, node, [cli, ...args]);
        return result;
      };
      const succeed = async (label: string, args: string[]): Promise<void> => {
        const result = await codegen(label, args);
        expect(result.exitCode, `${label}\n${result.output}`).toBe(0);
      };
      await succeed("Configure fixture-owned auth environment", [
        "env",
        "set",
        "--from-file",
        ".proof.env",
      ]);
      await confirmStopped();
      const manualConfigSource = fixture.originalGeneratedFiles.get(
        "convex/manualPaymentConfig.ts",
      );
      if (!manualConfigSource) throw new Error("Manual payment configuration was not emitted");
      await writeCodegenFile(
        root,
        "convex/manualPaymentConfig.ts",
        manualConfigSource
          .replace("enabled: false", "enabled: true")
          .replace(
            'receiverInstructions: ""',
            'receiverInstructions: "Fixture recipient for local runtime proof"',
          ),
      );
      owner = startCodegenOwner(root, node, runner.environment, fixture.secret);
      await owner.ready;
      backend = await inspectLocalCodegenBackend(root);
      const rootArgs = ["codegen", "--typecheck=enable"];
      const componentArgs = [...rootArgs, "--component-dir", "components/counter"];
      await succeed("Generate and typecheck root", rootArgs);
      await succeed("Generate and typecheck source component", componentArgs);

      const api = await readFile(join(root, "convex", "_generated", "api.d.ts"), "utf8");
      expect(api).not.toMatch(/export declare const (?:api|internal): AnyApi/);
      expect(api).not.toContain("components: AnyComponents");
      expect(api).toContain("codegenProbe");
      expect(api).toContain("counter");
      await runner.success("Strict generated API contracts", node, [
        compiler,
        "-p",
        "proof/tsconfig.json",
        "--noEmit",
        "--pretty",
        "false",
      ]);
      try {
        await runner.success(
          "Native manual receipt HTTP and atomic credit lifecycle",
          process.execPath,
          ["run", ".manual-runtime-proof.ts"],
          120_000,
        );
      } finally {
        await writeCodegenFile(root, "convex/manualPaymentConfig.ts", manualConfigSource);
      }
      await succeed("Restore disabled generated manual configuration", rootArgs);

      for (const target of [
        { component: false, path: ROOT_PROBE_PATH, args: rootArgs, label: "root" },
        { component: true, path: COMPONENT_PROBE_PATH, args: componentArgs, label: "component" },
      ]) {
        await writeCodegenFile(root, target.path, codegenProbeSource(target.component, true));
        try {
          const rejected = await codegen(`Reject invalid ${target.label} return`, target.args);
          expect(rejected.exitCode, rejected.output).not.toBe(0);
          expect(rejected.output).toContain("TS2322");
          expect(rejected.output).toContain(basename(target.path));
        } finally {
          await writeCodegenFile(root, target.path, codegenProbeSource(target.component));
          await succeed(`Restore valid ${target.label}`, target.args);
        }
      }
      await runner.success("Strict contracts after restoration", node, [
        compiler,
        "-p",
        "proof/tsconfig.json",
        "--noEmit",
        "--pretty",
        "false",
      ]);
      await assertGeneratedSourcesUnchanged(root, fixture);
      await owner.close();
      ownerClosed = true;
      await confirmStopped();
      const generatedPaths = [
        "convex/_generated/api.d.ts",
        "convex/_generated/dataModel.d.ts",
        "convex/_generated/server.d.ts",
        "components/counter/_generated/api.ts",
        "components/counter/_generated/component.ts",
        "components/counter/_generated/dataModel.ts",
        "components/counter/_generated/server.ts",
      ];
      const generatedHashes = Object.fromEntries(
        await Promise.all(
          generatedPaths.map(async (path) => [path, await fileSha256(join(root, path))]),
        ),
      );
      console.log(
        JSON.stringify({
          proof: "convex-public-local-codegen",
          node: nodeResult.output.trim(),
          convex: convex.convex,
          typescript: compilerPackage.version,
          compilerPath: relative(root, compiler).replaceAll("\\", "/"),
          backend: { version: backend.version, sha256: backend.sha256 },
          generatedHashes,
          steps: [...runner.steps, owner.receipt],
          cleanupVerified: runner.cleanupVerified && owner.cleanupVerified && portsVerified,
        }),
      );
      proofPassed = true;
    } finally {
      if (owner && !ownerClosed) {
        try {
          await owner.close(runner?.cleanupVerified === false);
          await assertLocalBackendStopped(await inspectLocalCodegenBackend(root));
        } catch (error) {
          portsVerified = false;
          console.error(error instanceof Error ? error.message : String(error));
        }
      }
      if (!proofPassed || runner?.cleanupVerified === false || !portsVerified) {
        console.error(`Preserved failed Convex codegen fixture for diagnosis: ${root}`);
      } else {
        await removeOwnedFixture(root);
      }
    }
  }, 900_000);
});
