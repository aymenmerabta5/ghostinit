import { children, isFunction, name, node, nodes, staticMember, unwrap } from "./ast.js";
import type { FrontendNode } from "./types.js";

export interface Origin {
  module: string;
  path: string[];
  opaque?: boolean;
}
export interface Binding {
  name: string;
  declaration: FrontendNode;
  initializer?: FrontendNode;
  projection: string[];
  imported?: Origin;
  parameter?: boolean;
}
interface Scope {
  parent?: Scope;
  bindings: Map<string, Binding>;
  functionScope: boolean;
}

/** Lexical bindings are collected before resolution, including later declarations. */
export class FrontendBindings {
  private readonly scopes = new WeakMap<FrontendNode, Scope>();
  private readonly parents = new WeakMap<FrontendNode, FrontendNode>();
  readonly declarations: Binding[] = [];

  constructor(program: unknown) {
    const root = node(program);
    if (root) this.collect(root, { bindings: new Map(), functionScope: true });
  }

  parent(item: FrontendNode): FrontendNode | undefined {
    return this.parents.get(item);
  }

  lookup(identifier: FrontendNode): Binding | undefined {
    const key = name(identifier);
    let scope = this.scopes.get(identifier);
    while (scope && key) {
      const binding = scope.bindings.get(key);
      if (binding) return binding;
      scope = scope.parent;
    }
    return undefined;
  }

  origin(value: unknown, seen = new Set<Binding>()): Origin | undefined {
    const item = unwrap(value);
    if (!item) return undefined;
    if (item.type === "Identifier") {
      const binding = this.lookup(item);
      if (!binding) {
        const identifier = name(item);
        return identifier &&
          [
            "fetch",
            "WebSocket",
            "EventSource",
            "XMLHttpRequest",
            "FileReader",
            "URL",
            "globalThis",
            "window",
            "self",
          ].includes(identifier)
          ? { module: "global", path: [identifier] }
          : undefined;
      }
      if (binding.imported) return binding.imported;
      if (seen.has(binding)) return undefined;
      seen.add(binding);
      const origin = this.origin(binding.initializer, seen);
      return origin ? { ...origin, path: [...origin.path, ...binding.projection] } : undefined;
    }
    if (item.type === "MemberExpression") {
      const origin = this.origin(item.object, seen);
      if (!origin) return undefined;
      const member = staticMember(item);
      return {
        ...origin,
        path: [...origin.path, member ?? "*"],
        opaque: origin.opaque || member === undefined,
      };
    }
    if (item.type === "CallExpression") {
      const callee = node(item.callee);
      if (callee?.type === "Identifier" && callee.name === "require" && !this.lookup(callee)) {
        const module = name(nodes(item.arguments)[0]);
        return module ? { module, path: [] } : undefined;
      }
    }
    if (item.type === "AwaitExpression") return this.origin(item.argument, seen);
    if (item.type === "ImportExpression") {
      const module = name(item.source);
      return module ? { module, path: [] } : undefined;
    }
    return undefined;
  }

  private define(
    pattern: unknown,
    scope: Scope,
    declaration: FrontendNode,
    initializer?: FrontendNode,
    projection: string[] = [],
    parameter = false,
  ): void {
    const item = node(pattern);
    if (!item) return;
    if (item.type === "Identifier") {
      const binding: Binding = {
        name: String(item.name),
        declaration,
        initializer,
        projection,
        parameter,
      };
      scope.bindings.set(binding.name, binding);
      this.declarations.push(binding);
    } else if (item.type === "ObjectPattern") {
      for (const property of nodes(item.properties)) {
        if (property.type === "RestElement")
          this.define(
            property.argument,
            scope,
            declaration,
            initializer,
            [...projection, "*"],
            parameter,
          );
        else
          this.define(
            property.value,
            scope,
            declaration,
            initializer,
            [...projection, name(property.key) ?? "*"],
            parameter,
          );
      }
    } else if (item.type === "ArrayPattern") {
      for (const [index, element] of (Array.isArray(item.elements) ? item.elements : []).entries())
        this.define(
          element,
          scope,
          declaration,
          initializer,
          [...projection, String(index)],
          parameter,
        );
    } else if (item.type === "AssignmentPattern")
      this.define(item.left, scope, declaration, initializer, projection, parameter);
    else if (item.type === "RestElement")
      this.define(item.argument, scope, declaration, initializer, projection, parameter);
  }

  private collect(item: FrontendNode, outer: Scope, parent?: FrontendNode): void {
    let scope = outer;
    if (parent) this.parents.set(item, parent);
    if (item.type === "FunctionDeclaration" || item.type === "ClassDeclaration")
      this.define(item.id, outer, item);
    if (isFunction(item)) {
      scope = { parent: outer, bindings: new Map(), functionScope: true };
      if (item.type === "FunctionExpression") this.define(item.id, scope, item);
      for (const param of nodes(item.params)) this.define(param, scope, item, undefined, [], true);
    } else if (
      [
        "BlockStatement",
        "CatchClause",
        "ForStatement",
        "ForOfStatement",
        "ForInStatement",
        "SwitchStatement",
      ].includes(item.type ?? "")
    ) {
      scope = { parent: outer, bindings: new Map(), functionScope: false };
      if (item.type === "CatchClause") this.define(item.param, scope, item, undefined, [], true);
    }
    this.scopes.set(item, scope);
    if (item.type === "ImportDeclaration" && item.importKind !== "type") {
      const module = name(item.source);
      if (module)
        for (const specifier of nodes(item.specifiers)) {
          if (specifier.importKind === "type") continue;
          const local = node(specifier.local);
          if (!local) continue;
          this.define(local, scope, specifier);
          const binding = scope.bindings.get(String(local.name));
          if (binding)
            binding.imported = {
              module,
              path: specifier.type === "ImportSpecifier" ? [name(specifier.imported) ?? "*"] : [],
            };
        }
    }
    if (item.type === "TSImportEqualsDeclaration" && item.importKind !== "type") {
      const module = name(node(item.moduleReference)?.expression);
      const local = node(item.id);
      if (module && local) {
        this.define(local, scope, item);
        const binding = scope.bindings.get(String(local.name));
        if (binding) binding.imported = { module, path: [] };
      }
    }
    if (item.type === "VariableDeclarator") {
      let destination = scope;
      if (parent?.kind === "var")
        while (!destination.functionScope && destination.parent) destination = destination.parent;
      this.define(item.id, destination, item, node(item.init));
    }
    for (const child of children(item)) this.collect(child, scope, item);
  }
}
