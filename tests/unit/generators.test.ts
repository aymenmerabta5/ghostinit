import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateModule } from "../../src/generators/module";
import { generateUseCase } from "../../src/generators/use-case";
import { generateProcedure } from "../../src/generators/procedure";
import { generateAction } from "../../src/generators/action";
import { Logger } from "../../src/lib/logger";
import { ghostinitVersion } from "../../packages/versions";
import type { GlobalOptions } from "../../src/commands/types";

function quietOptions(cwd: string): GlobalOptions {
  return {
    cwd,
    json: true,
    yes: true,
    force: true,
    dryRun: false,
    noInstall: true,
    runtime: "bun",
    kind: undefined,
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

function writeMinimalProject(root: string): void {
  mkdirSync(join(root, ".ghostinit"), { recursive: true });
  const config = {
    name: "demo",
    runtime: "bun" as const,
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(root, ".ghostinit", "state.json"),
    JSON.stringify(
      {
        version: 1,
        project: config,
        checksums: {},
        generatedBy: ghostinitVersion,
        generatedAt: config.generatedAt,
        modules: ["identity"],
        procedures: [],
      },
      null,
      2,
    ),
    "utf-8",
  );
  mkdirSync(join(root, "packages", "modules", "src"), { recursive: true });
  writeFileSync(join(root, "packages", "modules", "src", "index.ts"), "", "utf-8");
  mkdirSync(join(root, "packages", "api", "src", "procedures"), { recursive: true });
  writeFileSync(
    join(root, "packages", "api", "src", "contract.ts"),
    "export const appContract = {};\n",
    "utf-8",
  );
  writeFileSync(
    join(root, "packages", "api", "src", "router.ts"),
    "export const appRouter = {};\n",
    "utf-8",
  );
  mkdirSync(join(root, "apps", "web", "src", "actions"), { recursive: true });
}

describe("generators", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-generators-"));
    writeMinimalProject(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("generateModule creates a module and returns false on first call", async () => {
    const options = quietOptions(root);
    const noop = await generateModule(root, "billing", options);
    expect(noop).toBe(false);
    expect(
      existsSync(join(root, "packages", "modules", "src", "billing", "domain", "types.ts")),
    ).toBe(true);
    expect(existsSync(join(root, "packages", "database", "src", "schema", "billing.ts"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(
          root,
          "packages",
          "modules",
          "src",
          "billing",
          "infrastructure",
          "database",
          "schema.ts",
        ),
      ),
    ).toBe(false);
  });

  it("generateModule is idempotent and preserves existing files", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    const domainFile = join(root, "packages", "modules", "src", "billing", "domain", "types.ts");
    const original = readFileSync(domainFile, "utf-8");
    writeFileSync(domainFile, "// user edit\n" + original, "utf-8");
    const noop = await generateModule(root, "billing", options);
    expect(noop).toBe(true);
    expect(readFileSync(domainFile, "utf-8")).toContain("// user edit");
  });

  it("generateUseCase creates a use-case, updates the index, and is idempotent", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    const first = await generateUseCase(root, "billing", "create-invoice", "command", options);
    expect(first).toBe(false);
    const indexPath = join(
      root,
      "packages",
      "modules",
      "src",
      "billing",
      "application",
      "index.ts",
    );
    expect(readFileSync(indexPath, "utf-8")).toContain("CreateInvoiceCommandUseCase");

    writeFileSync(
      join(
        root,
        "packages",
        "modules",
        "src",
        "billing",
        "application",
        "create-invoice.command.ts",
      ),
      "// modified\n",
      "utf-8",
    );
    const second = await generateUseCase(root, "billing", "create-invoice", "command", options);
    expect(second).toBe(true);
    const index = readFileSync(indexPath, "utf-8");
    expect((index.match(/CreateInvoiceCommandUseCase/g) ?? []).length).toBe(1);
  });

  it("generateProcedure invokes the module use-case and maps errors", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    await generateUseCase(root, "billing", "create-invoice", "command", options);
    const noop = await generateProcedure(root, "billing", "create-invoice", options);
    expect(noop).toBe(false);
    const file = join(root, "packages", "api", "src", "procedures", "create-invoice.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("CreateInvoiceCommandUseCase");
    expect(content).toContain("createInvoice");
    expect(content).toContain("await CreateInvoiceCommandUseCase(");
    expect(content).toContain("new ORPCError");
    expect(content).toContain("ErrorCode.INTERNAL_ERROR");
    expect(content).not.toContain("createContext");
  });

  it("generateProcedure is idempotent", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    await generateUseCase(root, "billing", "create-invoice", "command", options);
    await generateProcedure(root, "billing", "create-invoice", options);
    const path = join(root, "packages", "api", "src", "procedures", "create-invoice.ts");
    writeFileSync(path, "// edited\n" + readFileSync(path, "utf-8"), "utf-8");
    const noop = await generateProcedure(root, "billing", "create-invoice", options);
    expect(noop).toBe(true);
    expect(readFileSync(path, "utf-8")).toContain("// edited");
  });

  it("generateAction validates input, invokes the use-case, and maps errors", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    await generateUseCase(root, "billing", "create-invoice", "command", options);
    const noop = await generateAction(root, "billing", "create-invoice", options);
    expect(noop).toBe(false);
    const file = join(root, "apps", "web", "src", "actions", "billing", "create-invoice.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"use server"');
    expect(content).toContain("CreateInvoiceCommandUseCase");
    expect(content).toContain("InputSchema.safeParse");
    expect(content).toContain("revalidatePath");
    expect(content).toContain("{ ok: true");
    expect(content).toContain("{ ok: false");
    expect(content).not.toContain("TODO");
  });

  it("generateAction is idempotent", async () => {
    const options = quietOptions(root);
    await generateModule(root, "billing", options);
    await generateUseCase(root, "billing", "create-invoice", "command", options);
    await generateAction(root, "billing", "create-invoice", options);
    const path = join(root, "apps", "web", "src", "actions", "billing", "create-invoice.ts");
    writeFileSync(path, "// edited\n" + readFileSync(path, "utf-8"), "utf-8");
    const noop = await generateAction(root, "billing", "create-invoice", options);
    expect(noop).toBe(true);
    expect(readFileSync(path, "utf-8")).toContain("// edited");
  });
});
