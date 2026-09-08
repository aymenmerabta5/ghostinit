import { expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { singleHealthRouteContent } from "../../src/templates/modes/single/api/routes.js";
import { isExactHealthPayload } from "../integration/e2e-build-process.js";

const common = [
  "config",
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "generateStaticParams",
  "instant",
  "prefetch",
  "unstable_dynamicStaleTime",
];
const pageExports = new Set([
  ...common,
  "default",
  "metadata",
  "generateMetadata",
  "viewport",
  "generateViewport",
]);
const routeExports = new Set([
  ...common,
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
]);

function valueExports(path: string, content: string): string[] {
  const parsed = parseSync(path, content);
  expect(parsed.errors, path).toEqual([]);
  const names: string[] = [];
  for (const node of parsed.program.body) {
    if (node.type === "ExportDefaultDeclaration") names.push("default");
    if (node.type === "ExportAllDeclaration" && node.exportKind !== "type") {
      throw new Error(`${path}: entrypoints must declare their exports explicitly`);
    }
    if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") continue;
    const declaration = node.declaration;
    if (declaration?.type === "VariableDeclaration") {
      for (const binding of declaration.declarations) {
        if (binding.id.type !== "Identifier") {
          throw new Error(`${path}: destructured entrypoint exports need explicit contract review`);
        }
        names.push(binding.id.name);
      }
    } else if (declaration && "id" in declaration && declaration.id?.type === "Identifier") {
      names.push(declaration.id.name);
    } else if (declaration) {
      throw new Error(`${path}: unsupported entrypoint export ${declaration.type}`);
    }
    for (const specifier of node.specifiers) {
      if (specifier.exportKind === "type") continue;
      names.push(
        specifier.exported.type === "Identifier"
          ? specifier.exported.name
          : String(specifier.exported.value),
      );
    }
  }
  return names;
}

for (const mode of ["single", "monorepo"] as const) {
  for (const database of ["postgres", "convex"] as const) {
    for (const i18n of [false, true]) {
      test(`${mode}/${database}/i18n=${i18n} capability-rich Next entrypoints expose only framework-supported values`, () => {
        const result = resolveCreateConfig({
          name: "next-entry-contract",
          mode,
          framework: "nextjs",
          runtime: "bun",
          apps: ["web"],
          preset: "saas",
          database,
          billing: ["stripe", "chargily", "paddle", "polar"],
          features: [],
          withI18n: i18n,
          withMessaging: true,
          withStorage: true,
          withNotifications: true,
          withJobs: true,
          withPdf: true,
          withEve: database === "postgres",
          featureFlags: "posthog",
        });
        if (!result.ok) throw new Error(result.message);
        const files = buildProjectGenerationPlan(result.resolvedConfig).files.filter(
          ({ physicalPath }) => /\/app\/(?:.*\/)?(?:page|layout|route)\.tsx?$/.test(physicalPath),
        );
        expect(files.length).toBeGreaterThan(5);
        expect(
          files.some(({ physicalPath }) =>
            physicalPath.endsWith("/api/messaging/attachments/route.ts"),
          ),
        ).toBe(true);
        for (const entry of files) {
          const allowed = entry.physicalPath.endsWith("/route.ts") ? routeExports : pageExports;
          expect(
            valueExports(entry.physicalPath, entry.content).filter((name) => !allowed.has(name)),
            entry.physicalPath,
          ).toEqual([]);
        }
      });
    }
  }
}

test("single Next health route satisfies the shared live health contract", async () => {
  const source = new Bun.Transpiler({ loader: "ts" })
    .transformSync(singleHealthRouteContent().replace(/^import[^\n]*\n/, ""))
    .replace("export async function GET", "return async function GET");
  const factory = new Function("connection", "NextResponse", source) as (
    connection: () => Promise<void>,
    response: { json: (value: unknown) => Response },
  ) => () => Promise<Response>;
  let connected = false;
  const response = await factory(
    async () => {
      connected = true;
    },
    { json: (value) => Response.json(value) },
  )();
  expect(connected).toBe(true);
  expect(response.status).toBe(200);
  expect(isExactHealthPayload(await response.json())).toBe(true);
});
