import { posix } from "node:path";
import { parseSync } from "oxc-parser";
import { file, type TemplateFile } from "../../shared.js";

type Program = ReturnType<typeof parseSync>["program"];
type ExportStatement = Extract<Program["body"][number], { type: "ExportNamedDeclaration" }>;

const SERVER_PAGE_EXPORTS = new Set([
  "config",
  "dynamic",
  "dynamicParams",
  "experimental_ppr",
  "fetchCache",
  "generateMetadata",
  "generateStaticParams",
  "generateViewport",
  "instant",
  "maxDuration",
  "metadata",
  "preferredRegion",
  "revalidate",
  "runtime",
  "viewport",
]);

function parse(entry: TemplateFile): Program {
  const result = parseSync(entry.path, entry.content, { sourceType: "module" });
  if (result.errors.length > 0) {
    throw new Error(`Cannot compose localized page ${entry.path}: invalid TypeScript`);
  }
  return result.program;
}

function isClient(program: Program): boolean {
  return program.body.some(
    (statement) => statement.type === "ExpressionStatement" && statement.directive === "use client",
  );
}

function exportedName(name: ExportStatement["specifiers"][number]["exported"]): string {
  return name.type === "Identifier" ? name.name : String(name.value);
}

function namedClientExports(program: Program, path: string): string[] {
  const names: { name: string; typeOnly: boolean }[] = [];
  for (const statement of program.body) {
    if (statement.type === "ExportAllDeclaration") {
      throw new Error(`Localized client page ${path} must use explicit named exports`);
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.declaration) {
      const declaration = statement.declaration;
      if (declaration.type === "VariableDeclaration") {
        for (const binding of declaration.declarations) {
          if (binding.id.type !== "Identifier") {
            throw new Error(`Localized client page ${path} must name exported bindings explicitly`);
          }
          names.push({ name: binding.id.name, typeOnly: false });
        }
      } else if ("id" in declaration && declaration.id?.type === "Identifier") {
        names.push({ name: declaration.id.name, typeOnly: statement.exportKind === "type" });
      } else {
        throw new Error(`Unsupported export in localized client page ${path}`);
      }
    }
    for (const specifier of statement.specifiers) {
      const name = exportedName(specifier.exported);
      if (name !== "default") {
        names.push({
          name,
          typeOnly: statement.exportKind === "type" || specifier.exportKind === "type",
        });
      }
    }
  }
  for (const { name } of names) {
    if (SERVER_PAGE_EXPORTS.has(name)) {
      throw new Error(
        `Localized client page ${path} exports server-only route configuration: ${name}`,
      );
    }
  }
  return names.map(
    ({ name, typeOnly }) => `export ${typeOnly ? "type " : ""}{ ${name} } from "./page.client";`,
  );
}

function resolveSource(
  files: ReadonlyMap<string, TemplateFile>,
  importer: string,
  source: string,
  sourceRoot: string,
): TemplateFile | undefined {
  const base = source.startsWith("@/")
    ? `${sourceRoot}/${source.slice(2)}`
    : source.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(importer), source))
      : null;
  if (!base) return undefined;
  const extensionless = base.replace(/\.js$/, "");
  return [
    base,
    `${extensionless}.ts`,
    `${extensionless}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]
    .map((path) => files.get(path))
    .find((entry) => entry !== undefined);
}

function wrapper(importStatement: string, preserved: readonly string[] = []): string {
  return `import type { ComponentProps as GhostinitPageProps } from "react";
import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";
${importStatement}
${preserved.join("\n")}

export default function RequestLocalizedPage(props: GhostinitPageProps<typeof GhostinitPageContent> & object) {
  return <>
    <RequestLocalizedMetadataBoundary />
    <GhostinitPageContent {...props} />
  </>;
}
`;
}

function clientReexport(
  entry: TemplateFile,
  program: Program,
  files: ReadonlyMap<string, TemplateFile>,
  sourceRoot: string,
): string | null {
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || !statement.source) continue;
    const source = statement.source.value;
    const defaultExport = statement.specifiers.find(
      (specifier) => exportedName(specifier.exported) === "default",
    );
    if (!defaultExport) continue;
    const target = resolveSource(files, entry.path, source, sourceRoot);
    if (!target || !isClient(parse(target))) return null;
    const imported = exportedName(defaultExport.local);
    const importStatement =
      imported === "default"
        ? `import GhostinitPageContent from ${JSON.stringify(source)};`
        : `import { ${imported} as GhostinitPageContent } from ${JSON.stringify(source)};`;
    // Preserve whole statements using parser ranges, including route metadata
    // and configuration. Only the default re-export becomes the server wrapper.
    const preserved = program.body.flatMap((node) => {
      if (node !== statement) return [entry.content.slice(node.start, node.end)];
      const otherExports = statement.specifiers
        .filter((specifier) => specifier !== defaultExport)
        .map((specifier) => {
          const local = exportedName(specifier.local);
          const name = exportedName(specifier.exported);
          return `${specifier.exportKind === "type" ? "type " : ""}${local}${local === name ? "" : ` as ${name}`}`;
        });
      return otherExports.length > 0
        ? [
            `export ${statement.exportKind === "type" ? "type " : ""}{ ${otherExports.join(", ")} } from ${JSON.stringify(source)};`,
          ]
        : [];
    });
    return wrapper(importStatement, preserved);
  }
  return null;
}

export function requestLocalizedMetadataContent(): string {
  return `import { Suspense } from "react";
import { connection } from "next/server";

async function RequestLocalizedMetadata(): Promise<null> {
  await connection();
  return null;
}

/** Request-localized metadata is an intentional dynamic part of this page. */
export function RequestLocalizedMetadataBoundary() {
  return <Suspense fallback={null}><RequestLocalizedMetadata /></Suspense>;
}
`;
}

function staticServerPage(entry: TemplateFile, program: Program): string {
  if (
    program.body.some(
      (node) =>
        node.type === "ImportDeclaration" &&
        node.source.value === "@/lib/request-localized-metadata",
    )
  )
    return entry.content;
  const exported = program.body.find((node) => node.type === "ExportDefaultDeclaration");
  const component = exported?.type === "ExportDefaultDeclaration" ? exported.declaration : null;
  if (component?.type !== "FunctionDeclaration" || component.async || !component.body) {
    throw new Error(`Static localized page must export a synchronous function: ${entry.path}`);
  }
  const returns = component.body.body.filter((node) => node.type === "ReturnStatement");
  let argument = returns.length === 1 ? returns[0].argument : null;
  while (argument?.type === "ParenthesizedExpression") argument = argument.expression;
  if (!argument || (argument.type !== "JSXElement" && argument.type !== "JSXFragment")) {
    throw new Error(`Static localized page must return one JSX tree: ${entry.path}`);
  }
  // OXC's UTF-16 ranges preserve imports, metadata exports, and the original
  // page tree. This explicit composition applies only to declared static pages.
  return (
    'import { RequestLocalizedMetadataBoundary } from "@/lib/request-localized-metadata";\n' +
    entry.content.slice(0, argument.start) +
    "<><RequestLocalizedMetadataBoundary />" +
    entry.content.slice(argument.start, argument.end) +
    "</>" +
    entry.content.slice(argument.end)
  );
}

/** Compose client page entrypoints before the immutable GenerationPlan is built. */
export function composeRequestLocalizedPages(
  entries: readonly TemplateFile[],
  sourceRoot: string,
  options: { readonly staticServerPages?: readonly string[] } = {},
): TemplateFile[] {
  const files = new Map(entries.map((entry) => [entry.path, entry]));
  const result: TemplateFile[] = [];
  let composed = false;
  for (const entry of entries) {
    if (!entry.path.startsWith(`${sourceRoot}/app/`) || !entry.path.endsWith("/page.tsx")) {
      result.push(entry);
      continue;
    }
    const program = parse(entry);
    if (options.staticServerPages?.includes(entry.path) && !isClient(program)) {
      result.push(file(entry.path, staticServerPage(entry, program)));
      composed = true;
      continue;
    }
    if (isClient(program)) {
      const clientPath = `${posix.dirname(entry.path)}/page.client.tsx`;
      if (files.has(clientPath))
        throw new Error(`Localized page companion already exists: ${clientPath}`);
      if (!program.body.some((node) => node.type === "ExportDefaultDeclaration")) {
        throw new Error(`Localized client page has no default component: ${entry.path}`);
      }
      result.push(file(clientPath, entry.content));
      result.push(
        file(
          entry.path,
          wrapper(
            'import GhostinitPageContent from "./page.client";',
            namedClientExports(program, entry.path),
          ),
        ),
      );
      composed = true;
      continue;
    }
    const content = clientReexport(entry, program, files, sourceRoot);
    result.push(content === null ? entry : file(entry.path, content));
    composed ||= content !== null;
  }
  if (composed) {
    const path = `${sourceRoot}/lib/request-localized-metadata.tsx`;
    if (files.has(path)) throw new Error(`Localized metadata boundary already exists: ${path}`);
    result.push(file(path, requestLocalizedMetadataContent()));
  }
  return result;
}
