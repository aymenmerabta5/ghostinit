import { isPaddleBrowserAdapterFile } from "../../lib/architecture/rules/vendor.js";

// @allow-long 510: emitted server-only policy keeps resolution, taint propagation, and dominance analysis together

export function checkServerOnlyContent(): string {
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const { moduleReferences, parseOwned, positionOf, relative } = require("./lib/oxc.cjs");

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const JAVASCRIPT_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];
const CODE_EXTENSIONS = [...TYPESCRIPT_EXTENSIONS, ...JAVASCRIPT_EXTENSIONS];
const DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
const SOURCE_ROOTS = ["src", "apps", "packages", "convex"];
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nitro",
  ".output",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
const SERVER_PACKAGES = new Set([
  "@orpc/openapi",
  "@orpc/server",
  "better-auth",
  "crossws",
  "drizzle-kit",
  "drizzle-orm",
  "h3",
  "nitro",
  "pg",
  "posthog-node",
  "react-email",
  "resend",
  "server-only",
  "stripe",
  "ws",
]);
const SERVER_PREFIXES = [
  "@aws-sdk/",
  "@chargily/",
  "@orpc/openapi/",
  "@orpc/server/",
  "@paddle/",
  "@polar-sh/",
  "bun:",
  "convex/server",
  "drizzle-orm/",
  "next/headers",
  "next/server",
  "nitro/",
  "node:",
];

function isCodeFile(file) {
  return CODE_EXTENSIONS.some((extension) => file.endsWith(extension)) && !isDeclarationFile(file);
}
function collect(directory, files) {
  if (!fs.existsSync(directory)) return;
  if (path.resolve(directory) === path.join(process.cwd(), "convex", "_generated")) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target, files);
    else if (entry.isFile() && isCodeFile(target) && !target.endsWith(".test.ts") && !target.endsWith(".test.tsx")) files.push(target);
  }
}
function isTypeOnlyReference(reference) {
  const node = reference.node;
  if (node.type === "TSImportType") return true;
  if (node.importKind === "type" || node.exportKind === "type") return true;
  const specifiers = node.specifiers ?? [];
  if (specifiers.length === 0) return false;
  if (node.type === "ImportDeclaration") return specifiers.every((specifier) => specifier.importKind === "type");
  if (node.type === "ExportNamedDeclaration") return specifiers.every((specifier) => specifier.exportKind === "type");
  return false;
}
function isStaticReference(reference) {
  return reference.kind === "ImportDeclaration" || reference.kind === "ExportAllDeclaration" || reference.kind === "ExportNamedDeclaration";
}
function isOwnedSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/") || specifier.startsWith("@repo/");
}
function isKnownGeneratedReference(specifier) {
  const clean = specifier.split(/[?#]/, 1)[0].replaceAll("\\\\", "/");
  return clean.endsWith("/routeTree.gen") || clean === "./routeTree.gen";
}
function isGeneratedConvexServer(file) {
  const target = relative(file);
  return CODE_EXTENSIONS.some((extension) => target === "convex/_generated/server" + extension);
}
function exportTarget(value, typeOnly = false) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const conditions = typeOnly
    ? ["types", "import", "default", "react-server", "node"]
    : ["import", "default", "react-server", "node"];
  for (const condition of conditions) {
    const target = exportTarget(value[condition], typeOnly);
    if (target) return target;
  }
  return null;
}
function isDeclarationFile(file) {
  return DECLARATION_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(extension));
}
function declarationCandidates(base, extension) {
  const stem = base.slice(0, -extension.length);
  if (extension === ".mjs") return [stem + ".d.mts", stem + ".d.ts"];
  if (extension === ".cjs") return [stem + ".d.cts", stem + ".d.ts"];
  return [stem + ".d.ts"];
}
function sourceSubstitutionCandidates(base, extension) {
  const stem = base.slice(0, -extension.length);
  if (extension === ".mjs") return [stem + ".mts", stem + ".ts"];
  if (extension === ".cjs") return [stem + ".cts", stem + ".ts"];
  if (extension === ".jsx") return [stem + ".tsx", stem + ".ts"];
  return [stem + ".ts", stem + ".tsx"];
}
function resolveAsFile(base, allowDeclarations = false) {
  if (isDeclarationFile(base)) {
    if (!allowDeclarations) return undefined;
    return fs.existsSync(base) && fs.statSync(base).isFile() ? path.resolve(base) : undefined;
  }
  const candidates = [];
  const extension = path.extname(base);
  if (CODE_EXTENSIONS.includes(extension)) {
    if (JAVASCRIPT_EXTENSIONS.includes(extension)) {
      candidates.push(...sourceSubstitutionCandidates(base, extension));
      if (allowDeclarations) candidates.push(...declarationCandidates(base, extension));
    }
    candidates.push(base);
  } else {
    candidates.push(base);
    for (const candidateExtension of TYPESCRIPT_EXTENSIONS) candidates.push(base + candidateExtension);
    if (allowDeclarations) {
      for (const candidateExtension of DECLARATION_EXTENSIONS) candidates.push(base + candidateExtension);
    }
    for (const candidateExtension of JAVASCRIPT_EXTENSIONS) candidates.push(base + candidateExtension);
  }
  for (const candidateExtension of TYPESCRIPT_EXTENSIONS) candidates.push(path.join(base, "index" + candidateExtension));
  if (allowDeclarations) {
    for (const candidateExtension of DECLARATION_EXTENSIONS) candidates.push(path.join(base, "index" + candidateExtension));
  }
  for (const candidateExtension of JAVASCRIPT_EXTENSIONS) candidates.push(path.join(base, "index" + candidateExtension));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return path.resolve(candidate);
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return null;
  return undefined;
}
function appSourceRoot(file) {
  const normalized = relative(file);
  const match = /^apps\\/([^/]+)\\//.exec(normalized);
  if (!match) return path.join(process.cwd(), "src");
  return path.join(
    process.cwd(),
    "apps",
    match[1],
    "src",
    ...(match[1] === "desktop" ? ["renderer"] : []),
  );
}
function resolveRepoPackage(specifier, typeOnly) {
  const parts = specifier.slice("@repo/".length).split("/");
  const packageName = parts.shift();
  if (!packageName) return undefined;
  const packageRoot = path.join(process.cwd(), "packages", packageName);
  if (!fs.existsSync(packageRoot)) return undefined;
  const subpath = parts.join("/");
  const manifestPath = path.join(packageRoot, "package.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const key = subpath ? "./" + subpath : ".";
    const target = exportTarget(manifest.exports?.[key], typeOnly);
    if (target) {
      const resolved = resolveAsFile(path.resolve(packageRoot, target), typeOnly);
      if (resolved !== undefined) return resolved;
    }
  }
  return resolveAsFile(path.join(packageRoot, "src", subpath || "index"), typeOnly);
}
function resolveOwnedReference(file, specifier, typeOnly) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (cleanSpecifier.startsWith("@repo/")) return resolveRepoPackage(cleanSpecifier, typeOnly);
  if (cleanSpecifier.startsWith("@/")) return resolveAsFile(path.join(appSourceRoot(file), cleanSpecifier.slice(2)), typeOnly);
  return resolveAsFile(path.resolve(path.dirname(file), cleanSpecifier), typeOnly);
}
function isIntrinsicServer(file) {
  const normalized = relative(file);
  return normalized.startsWith("src/server/") ||
    /^(?:packages\\/config\\/src|src\\/lib\\/env)\\/server(?:-schema)?\\.[cm]?[jt]s$/.test(normalized) ||
    /^apps\\/[^/]+\\/(?:src\\/server|server)\\//.test(normalized);
}
function isClientSurface(file, program) {
  const normalized = relative(file);
  return program.body.some((statement) => statement.directive === "use client") ||
    normalized.startsWith("apps/mobile/") ||
    normalized.startsWith("apps/desktop/src/renderer/") ||
    normalized.startsWith("src/renderer/");
}
function isServerAction(program) {
  if (!program.body.some((statement) => statement.directive === "use server")) return false;
  return program.body.every((statement) => {
    if (statement.type !== "ExportNamedDeclaration" && statement.type !== "ExportDefaultDeclaration") return true;
    if (statement.exportKind === "type") return true;
    const declaration = statement.declaration;
    if (declaration?.type === "FunctionDeclaration") return declaration.async === true;
    if (declaration?.type === "VariableDeclaration") {
      return declaration.declarations.every((entry) => {
        const init = entry.init;
        return (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") && init.async === true;
      });
    }
    return false;
  });
}
function isTanStackServerFunctionReference(file, program, source) {
  const normalized = relative(file);
  if (!/^(?:apps\\/web\\/)?src\\/lib\\/server-functions\\.[cm]?[jt]sx?$/.test(normalized)) return false;
  if (program.body.some((statement) => statement.directive === "use client")) return false;
  if (!source.includes('createServerFn({ method: "GET" })')) return false;
  return moduleReferences(program)
    .filter((reference) => !isTypeOnlyReference(reference))
    .every((reference) =>
      reference.specifier === "@tanstack/react-start" ||
      (reference.kind === "ImportExpression" &&
        (reference.specifier === "@tanstack/react-start/server" ||
          reference.specifier === "@repo/services/application" ||
          reference.specifier === "@/server/services/application")));
}
const isPaddleBrowserAdapterFile = ${isPaddleBrowserAdapterFile.toString()};
function isServerPackage(file, specifier) {
  if (specifier === "@paddle/paddle-js" && isPaddleBrowserAdapterFile(relative(file))) return false;
  return SERVER_PACKAGES.has(specifier) || SERVER_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}
function memberName(node) {
  if (node?.type !== "MemberExpression") return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  return typeof node.property?.value === "string" ? node.property.value : null;
}
function isEnvironmentObject(node) {
  if (node?.type === "Identifier") return node.name === "process" || node.name === "Bun" || node.name === "Deno";
  if (node?.type === "MetaProperty") {
    return node.meta?.name === "import" && node.property?.name === "meta";
  }
  return node?.type === "MemberExpression" && node.object?.type === "Identifier" && node.object.name === "globalThis" && memberName(node) === "process";
}
function isImportMeta(node) {
  return node?.type === "MetaProperty" && node.meta?.name === "import" && node.property?.name === "meta";
}
function isPublicEnvironmentKey(key, environmentObject) {
  if (isImportMeta(environmentObject)) {
    return key.startsWith("VITE_") || ["DEV", "PROD", "MODE", "SSR", "BASE_URL"].includes(key);
  }
  return key === "NODE_ENV" || key.startsWith("NEXT_PUBLIC_") || key.startsWith("EXPO_PUBLIC_");
}
function walkWithParent(root, visit) {
  const seen = new Set();
  function visitNode(node, parent) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visitNode(child, parent);
      return;
    }
    visit(node, parent);
    for (const [key, child] of Object.entries(node)) {
      if (["loc", "range", "start", "end"].includes(key)) continue;
      if (child && typeof child === "object") visitNode(child, node);
    }
  }
  visitNode(root, null);
}
function environmentReason(program, source) {
  let reason = null;
  walkWithParent(program, (node, parent) => {
    if (reason || node.type !== "MemberExpression") return;
    if (node.object?.type === "MemberExpression" && memberName(node.object) === "env" && isEnvironmentObject(node.object.object)) {
      const key = memberName(node);
      if (!key || !isPublicEnvironmentKey(key, node.object.object)) reason = "accesses server environment key " + JSON.stringify(key ?? "<dynamic>");
      return;
    }
    if (memberName(node) !== "env" || !isEnvironmentObject(node.object)) return;
    const consumedByProperty = parent?.type === "MemberExpression" && parent.object === node;
    const guardedBrowserFallback = node.object?.type === "Identifier" && node.object.name === "process" && /typeof\\s+process\\s*===?\\s*["']undefined["']/.test(source);
    if (!consumedByProperty && !guardedBrowserFallback) reason = "accesses the complete server environment object";
  });
  return reason;
}
function publicEnvironmentImport(program, reference, target) {
  if (reference.node.type !== "ImportDeclaration" || !["env.ts", "env.tsx", "env.js", "env.jsx"].includes(path.basename(target))) return false;
  const specifier = (reference.node.specifiers ?? []).find((candidate) => candidate.type === "ImportSpecifier" && (candidate.imported?.name ?? candidate.imported?.value) === "env");
  const binding = specifier?.local?.name;
  if (!binding) return false;
  let used = false;
  let safe = true;
  walkWithParent(program, (node, parent) => {
    if (!safe || node.type !== "Identifier" || node.name !== binding) return;
    if (parent?.type === "ImportSpecifier") return;
    if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if (parent?.type === "MemberExpression" && parent.object === node) {
      used = true;
      const key = memberName(parent);
      if (!key || !isPublicEnvironmentKey(key)) safe = false;
      return;
    }
    safe = false;
  });
  return used && safe;
}
function describeTaint(node, nodes, clientPath = false) {
  const chain = [relative(node.file)];
  const seen = new Set([node.file]);
  let current = node;
  let next = (clientPath ? current.clientVia : current.taintVia) ?? current.serverVia;
  while (next && !seen.has(next)) {
    seen.add(next);
    current = nodes.get(next);
    if (!current) break;
    chain.push(relative(current.file));
    next = (clientPath ? current.clientVia : current.taintVia) ?? current.serverVia;
  }
  if (current?.directReason) chain.push(current.directReason);
  else if (current?.intrinsicServer) chain.push("intrinsic server module");
  return chain.join(" -> ");
}
function servicePublicEntries() {
  const packageRoot = path.join(process.cwd(), "packages", "services");
  if (!fs.existsSync(packageRoot)) return [];
  const manifestPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(manifestPath)) throw new Error("packages/services is missing package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const exportMap = manifest.exports;
  const targets = [];
  if (typeof exportMap === "string") targets.push(exportMap);
  else if (exportMap && typeof exportMap === "object" && !Array.isArray(exportMap)) {
    const entries = Object.entries(exportMap);
    if (entries.some(([key]) => key.startsWith("."))) {
      for (const [, value] of entries) {
        const target = exportTarget(value);
        if (target) targets.push(target);
      }
    } else {
      const target = exportTarget(exportMap);
      if (target) targets.push(target);
    }
  }
  if (targets.length === 0) targets.push("./src/index.ts");
  return [...new Set(targets)].map((target) => {
    const resolved = resolveAsFile(path.resolve(packageRoot, target));
    if (!resolved) throw new Error("Cannot resolve packages/services public export " + JSON.stringify(target));
    return resolved;
  });
}
function unguardedRuntimePath(file, nodes, visiting = new Set()) {
  if (visiting.has(file)) return null;
  const node = nodes.get(file);
  if (!node || node.marker) return null;
  visiting.add(file);
  if (node.directReason) return [relative(file), node.directReason];
  if (node.intrinsicServer) return [relative(file), "intrinsic server module"];
  for (const edge of node.edges) {
    if (!edge.runtime) continue;
    const child = unguardedRuntimePath(edge.target, nodes, visiting);
    if (child) return [relative(file), ...child];
  }
  visiting.delete(file);
  return null;
}
function main() {
  const files = [];
  for (const root of SOURCE_ROOTS) collect(path.join(process.cwd(), root), files);
  if (files.length === 0) {
    console.error("Server-only check could not find generated source roots");
    process.exit(2);
  }

  const nodes = new Map();
  const resolutionErrors = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const program = parseOwned(file, source);
    const node = {
      file,
      source,
      intrinsicServer: isIntrinsicServer(file),
      client: isClientSurface(file, program),
      serverAction: isServerAction(program),
      serverFunctionReference: isTanStackServerFunctionReference(file, program, source),
      marker: false,
      directReason: environmentReason(program, source),
      edges: [],
      tainted: false,
      taintVia: null,
      clientUnsafe: false,
      clientVia: null,
      protected: false,
      serverReachable: isIntrinsicServer(file),
      serverVia: null,
    };
    for (const reference of moduleReferences(program)) {
      const typeOnly = isTypeOnlyReference(reference);
      if (!typeOnly && reference.specifier === "server-only") node.marker = true;
      if (isOwnedSpecifier(reference.specifier)) {
        const target = resolveOwnedReference(file, reference.specifier, typeOnly);
        if (target === undefined) {
          if (isKnownGeneratedReference(reference.specifier)) continue;
          const position = positionOf(source, reference.node);
          resolutionErrors.push(relative(file) + ":" + position.line + ":" + position.column + " cannot resolve " + JSON.stringify(reference.specifier));
        } else if (target) {
          if (!typeOnly && isGeneratedConvexServer(target)) {
            node.directReason ??= "imports server runtime " + JSON.stringify(reference.specifier);
          }
          node.edges.push({
            target,
            runtime: !typeOnly,
            static: isStaticReference(reference),
            publicEnvironmentOnly: !typeOnly && publicEnvironmentImport(program, reference, target),
          });
        }
      } else if (!typeOnly && isServerPackage(file, reference.specifier)) {
        node.directReason ??= "imports server runtime " + JSON.stringify(reference.specifier);
      }
    }
    if (node.marker) {
      node.directReason ??= 'imports "server-only"';
      node.protected = true;
    }
    node.tainted = node.directReason !== null;
    node.clientUnsafe = node.directReason !== null;
    nodes.set(file, node);
  }
  if (resolutionErrors.length > 0) throw new Error("Unresolved local imports in server-only check:\\n  " + resolutionErrors.join("\\n  "));

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes.values()) {
      for (const edge of node.edges) {
        if (!edge.runtime) continue;
        const target = nodes.get(edge.target);
        if (!target) continue;
        // React replaces a Client Component's import of a use-server export
        // with an opaque action reference. The action module and its imports do
        // not become part of the client runtime graph.
        if (target.serverAction || target.serverFunctionReference) continue;
        if (!node.tainted && !edge.publicEnvironmentOnly && target.tainted) {
          node.tainted = true;
          node.taintVia = target.file;
          changed = true;
        }
        if (!node.clientUnsafe && !edge.publicEnvironmentOnly && target.clientUnsafe) {
          node.clientUnsafe = true;
          node.clientVia = target.file;
          changed = true;
        }
        if (!node.protected && edge.static && target.protected) {
          node.protected = true;
          changed = true;
        }
        if (!node.serverReachable && target.serverReachable) {
          node.serverReachable = true;
          node.serverVia = target.file;
          changed = true;
        }
      }
    }
  }

  const violations = [];
  for (const entry of servicePublicEntries()) {
    const node = nodes.get(entry);
    if (!node) throw new Error("packages/services public export is outside the scanned source graph: " + relative(entry));
    const unguarded = unguardedRuntimePath(entry, nodes);
    if (unguarded) violations.push("Unprotected packages/services export: " + unguarded.join(" -> "));
  }
  for (const node of nodes.values()) {
    if (node.client && (node.clientUnsafe || node.serverReachable)) {
      violations.push("Client-reachable server runtime: " + describeTaint(node, nodes, true));
    }
  }
  if (violations.length === 0) {
    console.log("Server-only runtime boundary check passed.");
    return;
  }
  console.error("Server-only runtime boundary violations:");
  for (const violation of violations.sort()) console.error("  " + violation);
  process.exit(1);
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown server-only checker failure");
  process.exit(2);
}
`;
}
