import { isFunction, name, node, nodes, unwrap, walk } from "./ast.js";
import { importedFeatureRole, isFormImport, isRemoteImport } from "./classify.js";
import type { FrontendContext } from "./context.js";
import type { FrontendNode } from "./types.js";
import type { Origin } from "./bindings.js";

const LIFETIME_HOOKS = new Set([
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useRef",
  "useSyncExternalStore",
  "useActionState",
  "useOptimistic",
  "useImperativeHandle",
]);
const FORM_HOOKS = new Set([
  "useAppForm",
  "useForm",
  "useFormik",
  "useFormContext",
  "useFieldArray",
  "useWatch",
]);

function globalNetwork(origin: Origin): boolean {
  if (origin.module !== "global") return false;
  return (
    ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"].includes(origin.path[0] ?? "") ||
    (["window", "globalThis", "self"].includes(origin.path[0] ?? "") &&
      (origin.opaque === true ||
        ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"].includes(origin.path[1] ?? "")))
  );
}

function globalFileReader(origin: Origin): boolean {
  if (origin.module !== "global") return false;
  const path = ["window", "globalThis", "self"].includes(origin.path[0] ?? "")
    ? origin.path.slice(1)
    : origin.path;
  return (
    path[0] === "FileReader" &&
    (path.length === 1 || (path.length === 2 && ["bind", "call", "apply"].includes(path[1] ?? "")))
  );
}

/** Only explicit route loader/async server-component bodies may perform server reads. */
function serverRouteRead(context: FrontendContext, call: FrontendNode): boolean {
  if (context.role !== "route") return false;
  for (const statement of nodes(node(context.program)?.body)) {
    const directive =
      statement.type === "ExpressionStatement" ? node(statement.expression)?.value : undefined;
    if (typeof directive !== "string") break;
    if (directive === "use client") return false;
  }
  let current = context.bindings.parent(call);
  while (current) {
    if (isFunction(current)) {
      const parent = context.bindings.parent(current);
      if (parent?.type === "Property" && ["loader", "beforeLoad"].includes(name(parent.key) ?? ""))
        return true;
      if (!current.async) return false;
      if (parent?.type === "ExportDefaultDeclaration") return true;
      if (
        parent?.type === "ExportNamedDeclaration" &&
        /^(?:generateMetadata|generateStaticParams|getServerSideProps|getStaticProps)$/.test(
          name(current.id) ?? "",
        )
      )
        return true;
      return false;
    }
    current = context.bindings.parent(current);
  }
  return false;
}

function importNode(program: unknown, specifier: string): FrontendNode | undefined {
  let found: FrontendNode | undefined;
  walk(program, (item) => {
    if (name(item.source) === specifier && !found) found = item;
  });
  return found;
}

export function checkFrontendOwnership(context: FrontendContext): void {
  const { role } = context;
  const composition = role === "route" || role === "composition";
  const pure = role === "model";
  const view = role === "view";
  for (const reference of context.imports ?? []) {
    if (reference.typeOnly) continue;
    const source = importNode(context.program, reference.specifier);
    const targetRole = importedFeatureRole(reference.specifier, reference.target);
    if (
      isRemoteImport(reference.specifier) ||
      (reference.target && isRemoteImport(reference.target))
    ) {
      if (role !== "adapter")
        context.add(
          "frontend-remote-owner",
          "Remote clients and query/mutation libraries belong in feature-root queries.ts or mutations.ts.",
          source,
        );
    }
    if ((view || pure) && (targetRole === "adapter" || targetRole === "workflow")) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Views receive typed props; pure models cannot import feature adapters or workflow hooks.",
        source,
      );
    }
    if (pure && reference.specifier === "react")
      context.add(
        "frontend-model-purity",
        "Pure feature models may import React types, but cannot own React runtime behavior.",
        source,
      );
    if (pure && /^(?:node:|bun:|next\/(?:headers|server)$)/.test(reference.specifier)) {
      context.add(
        "frontend-model-purity",
        "Pure frontend models cannot import server runtime implementations.",
        source,
      );
    }
    if (
      isFormImport(reference.specifier) &&
      !(
        role === "workflow" &&
        context.platform === "expo" &&
        reference.specifier === "@tanstack/react-form"
      )
    )
      context.add(
        "frontend-form-owner",
        "Raw form libraries belong in the shared form foundation; feature workflows compose useAppForm.",
        source,
      );
  }

  walk(context.program, (item, parent) => {
    if (
      ["Identifier", "MemberExpression"].includes(item.type ?? "") &&
      !parent?.type?.startsWith("Import")
    ) {
      const reference = context.bindings.origin(item);
      if (
        reference?.module === "react" &&
        (reference.opaque || reference.path.some((part) => LIFETIME_HOOKS.has(part))) &&
        (composition || pure)
      ) {
        context.add(
          pure ? "frontend-model-purity" : "frontend-view-workflow",
          "Raw React state/effect references belong in semantic workflow hooks, including callable aliases and computed access.",
          item,
        );
      }
    }
    if (item.type !== "CallExpression" && item.type !== "NewExpression") return;
    const callee = unwrap(item.callee);
    const origin = context.bindings.origin(callee);
    const method = origin?.path.at(-1) ?? name(callee);
    if (origin && globalFileReader(origin) && (pure || view || composition)) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Browser file reads belong in feature adapters or workflow hooks, outside pure models and presentation.",
        item,
      );
    }
    if (origin?.module === "react" && (LIFETIME_HOOKS.has(method ?? "") || origin.opaque)) {
      if (composition || pure)
        context.add(
          pure ? "frontend-model-purity" : "frontend-view-workflow",
          "Routes and feature composition files compose semantic hooks; state, effects and resource lifetimes belong in workflow hooks.",
          item,
        );
    }
    if (origin?.module === "react" && pure)
      context.add(
        "frontend-model-purity",
        "Pure feature models cannot call React runtime APIs.",
        item,
      );
    if (FORM_HOOKS.has(method ?? "") && (origin || /^useAppForm$/.test(method ?? ""))) {
      if (role !== "workflow")
        context.add(
          "frontend-form-owner",
          "Form state and submission belong in a feature workflow hook using useAppForm.",
          item,
        );
      else if (
        method !== "useAppForm" &&
        !(
          context.platform === "expo" &&
          origin?.module === "@tanstack/react-form" &&
          method === "useForm"
        )
      )
        context.add(
          "frontend-form-owner",
          "Feature form workflows must compose the shared useAppForm foundation.",
          item,
        );
    }
    if (origin && globalNetwork(origin) && role !== "adapter" && !serverRouteRead(context, item)) {
      context.add(
        "frontend-remote-owner",
        "Network operations belong in feature-root queries.ts or mutations.ts, or an explicit server route loader.",
        item,
      );
    }
    if (pure && origin && (isRemoteImport(origin.module) || isFormImport(origin.module)))
      context.add(
        "frontend-model-purity",
        "Pure feature models cannot own remote or form runtime behavior.",
        item,
      );
    if (
      (view || pure) &&
      method &&
      /^use[A-Z]/.test(method) &&
      origin &&
      importedFeatureRole(origin.module) === "workflow"
    ) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Feature workflow hooks are composed by feature containers, not prop-driven views or pure models.",
        item,
      );
    }
  });
}
