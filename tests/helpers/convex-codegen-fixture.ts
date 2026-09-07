import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  auth,
  convex,
  runtime,
  typescript,
  validation,
} from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { minimumReleaseAgeBunfigContent } from "./bunfig.js";

export const ROOT_PROBE_PATH = "convex/codegenProbe.ts";
export const COMPONENT_PROBE_PATH = "components/counter/counter.ts";

export function codegenProbeSource(component: boolean, invalid = false): string {
  return `import { query } from "./_generated/server";
import { v } from "convex/values";
${component ? "" : 'import { components } from "./_generated/api";'}

export const read = query({
  args: { value: v.number() },
  returns: v.number(),
  handler: async (${component ? "_ctx" : "ctx"}, args): Promise<number> => {
    return ${invalid ? '"deliberate-type-error"' : component ? "args.value" : "await ctx.runQuery(components.counter.counter.read, args)"};
  },
});
`;
}

const proofSource = `import { api, components } from "../convex/_generated/api.js";
import type { Doc, Id } from "../convex/_generated/dataModel.js";
import type { Doc as CounterDoc } from "../components/counter/_generated/dataModel.js";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;

export type TypedContracts = [
  Assert<Equal<IsAny<typeof api>, false>>,
  Assert<Equal<FunctionArgs<typeof api.codegenProbe.read>, { value: number }>>,
  Assert<Equal<FunctionReturnType<typeof api.codegenProbe.read>, number>>,
  Assert<Equal<FunctionArgs<typeof components.counter.counter.read>, { value: number }>>,
  Assert<Equal<FunctionReturnType<typeof components.counter.counter.read>, number>>,
  Assert<Equal<FunctionArgs<typeof api.posts.create>, { title: string; content: string }>>,
  Assert<Equal<FunctionReturnType<typeof api.posts.create>, Id<"posts">>>,
  Assert<Equal<Doc<"posts">["title"], string>>,
  Assert<Equal<Doc<"users">["authId"], string>>,
  Assert<Equal<CounterDoc<"counters">["value"], number>>,
];

// @ts-expect-error Real codegen must reject a missing root function.
export const missingRoot = api.codegenProbe.missing;
// @ts-expect-error Real codegen must reject a missing component.
export const missingComponent = components.missing;
// @ts-expect-error Real codegen must reject a missing component function.
export const missingComponentFunction = components.counter.counter.missing;
// @ts-expect-error Root arguments must not retain the bootstrap AnyApi type.
export const badRootArgs: FunctionArgs<typeof api.codegenProbe.read> = { value: "wrong" };
// @ts-expect-error Component arguments must not retain AnyComponents.
export const badComponentArgs: FunctionArgs<typeof components.counter.counter.read> = { value: "wrong" };
// @ts-expect-error App tables must not leak into the component data model.
export type MissingComponentTable = CounterDoc<"posts">;
// @ts-expect-error Component tables must not leak into the app data model.
export type MissingRootTable = Doc<"counters">;
`;

export async function writeCodegenFile(root: string, path: string, content: string): Promise<void> {
  const transaction = new FsTransaction(root);
  await transaction.write(path, content);
  await transaction.commit();
}

export interface CodegenFixture {
  readonly secret: string;
  readonly originalGeneratedFiles: ReadonlyMap<string, string>;
}

/** Exercise emitted backend files without installing an unrelated frontend application. */
export async function prepareCodegenFixture(root: string): Promise<CodegenFixture> {
  const generated = generateProjectFiles(
    projectConfigSchema.parse({
      name: "convex-codegen-proof",
      runtime: "node",
      version: "0.1.0",
      mode: "single",
      preset: "custom",
      framework: "nextjs",
      database: "convex",
      apps: ["web"],
      deploy: "none",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      eve: false,
      i18n: false,
      pdf: false,
      messaging: false,
      storage: false,
      notifications: false,
      featureFlags: "none",
      jobs: false,
      cache: "none",
      billing: [],
      features: [],
    }),
    { dryRun: true },
  ).filter(({ path }) => path.startsWith("convex/") || path === "convex.json");
  const originals = new Map(generated.map(({ path, content }) => [path, content]));
  for (const path of [
    "convex/auth.ts",
    "convex/users.ts",
    "convex/posts.ts",
    "convex/tsconfig.json",
  ]) {
    if (!originals.has(path)) throw new Error(`Required generated backend file missing: ${path}`);
  }
  if (!originals.get("convex/_generated/api.d.ts")?.includes("export declare const api: AnyApi")) {
    throw new Error("The fixture must begin with the actual generated AnyApi bootstrap");
  }
  const transaction = new FsTransaction(root);
  for (const { path, content } of generated) await transaction.write(path, content);
  const generatedConfig = originals.get("convex/convex.config.ts") ?? "";
  if (!generatedConfig.includes("const app = defineApp();")) {
    throw new Error("Cannot attach the proof component to the generated Convex app");
  }
  await transaction.write(
    "convex/convex.config.ts",
    'import counter from "../components/counter/convex.config.js";\n' +
      generatedConfig.replace(
        "const app = defineApp();",
        'const app = defineApp();\napp.use(counter, { name: "counter" });',
      ),
  );
  const config = JSON.parse(originals.get("convex.json") ?? "{}");
  await transaction.write(
    "convex.json",
    JSON.stringify({ ...config, typescriptCompiler: "tsc", aiFiles: { enabled: false } }),
  );
  await transaction.write(
    "package.json",
    JSON.stringify({
      name: "ghostinit-convex-codegen-proof",
      private: true,
      type: "module",
      packageManager: `bun@${runtime.bun}`,
      dependencies: {
        convex: convex.convex,
        "@convex-dev/better-auth": convex["@convex-dev/better-auth"],
        "better-auth": auth["better-auth"],
        zod: validation.zod,
      },
      devDependencies: { typescript: typescript.typescript, "@types/node": runtime["@types/node"] },
    }),
  );
  await transaction.write("bunfig.toml", minimumReleaseAgeBunfigContent());
  const { compilerOptions } = JSON.parse(originals.get("convex/tsconfig.json")!) as {
    compilerOptions: Record<string, unknown>;
  };
  const componentTsconfig = JSON.stringify({
    compilerOptions: { ...compilerOptions, types: [] },
    include: ["./**/*"],
    exclude: ["./_generated"],
  });
  await transaction.write("components/counter/tsconfig.json", componentTsconfig);
  await transaction.write(
    "components/counter/convex.config.ts",
    'import { defineComponent } from "convex/server";\nexport default defineComponent("counter");\n',
  );
  await transaction.write(
    "components/counter/schema.ts",
    'import { defineSchema, defineTable } from "convex/server";\nimport { v } from "convex/values";\nexport default defineSchema({ counters: defineTable({ value: v.number() }) });\n',
  );
  await transaction.write(ROOT_PROBE_PATH, codegenProbeSource(false));
  await transaction.write(COMPONENT_PROBE_PATH, codegenProbeSource(true));
  await transaction.write("proof/contracts.ts", proofSource);
  await transaction.write(
    ".proof-hold.ts",
    `import { existsSync } from "node:fs";
import { FsTransaction } from ${JSON.stringify(pathToFileURL(join(import.meta.dir, "../../src/lib/fs.ts")).href)};
const transaction = new FsTransaction(process.cwd());
await transaction.write(".proof-ready", "ready");
await transaction.commit();
setInterval(() => { if (existsSync(".proof-release")) process.exit(0); }, 25);
setTimeout(() => process.exit(1), 480_000);
`,
  );
  await transaction.write(
    "proof/tsconfig.json",
    JSON.stringify({ compilerOptions, include: ["contracts.ts"] }),
  );
  const secret = randomBytes(32).toString("base64url");
  await transaction.write(
    ".proof.env",
    `SITE_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${secret}\n`,
  );
  for (const directory of [".home", ".home/AppData/Local", ".home/AppData/Roaming", ".tmp"]) {
    await transaction.write(`${directory}/.keep`, "");
  }
  await transaction.commit();
  return { secret, originalGeneratedFiles: originals };
}

export async function assertGeneratedSourcesUnchanged(
  root: string,
  fixture: CodegenFixture,
): Promise<void> {
  for (const [path, content] of fixture.originalGeneratedFiles) {
    if (
      path === "convex.json" ||
      path === "convex/convex.config.ts" ||
      path.startsWith("convex/_generated/")
    )
      continue;
    if ((await readFile(join(root, path), "utf8")) !== content) {
      throw new Error(`Codegen proof changed the generated backend source: ${path}`);
    }
  }
}
