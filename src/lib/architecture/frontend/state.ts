import { isFunction, name, node, nodes, staticMember, unwrap, walk } from "./ast.js";
import { importedFeatureRole, isRemoteImport } from "./classify.js";
import type { Binding } from "./bindings.js";
import type { FrontendContext } from "./context.js";
import type { FrontendNode } from "./types.js";
import { isRealtimeEventSetter } from "./events.js";

interface LocalState {
  value: Binding;
  setter?: Binding;
  call: FrontendNode;
}

function reactCall(
  context: FrontendContext,
  expression: unknown,
  methods: string[],
): FrontendNode | undefined {
  const item = unwrap(expression);
  if (item?.type !== "CallExpression") return undefined;
  const origin = context.bindings.origin(item.callee);
  return origin?.module === "react" && methods.includes(origin.path.at(-1) ?? "")
    ? item
    : undefined;
}

function remoteValue(
  context: FrontendContext,
  expression: unknown,
  seen = new Set<Binding>(),
): boolean {
  const item = unwrap(expression);
  if (!item) return false;
  if (item.type === "Identifier") {
    const binding = context.bindings.lookup(item);
    if (!binding || seen.has(binding)) return false;
    seen.add(binding);
    return remoteValue(context, binding.initializer, seen);
  }
  if (item.type === "CallExpression") {
    const origin = context.bindings.origin(item.callee);
    // A browser object URL is a newly allocated resource handle with its own lifetime.
    // Its input may be remote data; the handle itself is not a copy of that data.
    if (origin?.module === "global" && origin.path.join(".") === "URL.createObjectURL")
      return false;
    const method = origin?.path.at(-1) ?? "";
    if (
      origin &&
      (isRemoteImport(origin.module) ||
        importedFeatureRole(origin.module) === "adapter" ||
        ["useLoaderData", "useRouteContext"].includes(method))
    )
      return true;
    if (origin?.module === "global" && origin.path.at(-1) === "fetch") return true;
    if (
      node(item.callee)?.type === "MemberExpression" &&
      remoteValue(context, node(item.callee)?.object, seen)
    )
      return true;
    return nodes(item.arguments).some((argument) => remoteValue(context, argument, new Set(seen)));
  }
  if (item.type === "MemberExpression") return remoteValue(context, item.object, seen);
  if (item.type === "AwaitExpression") return remoteValue(context, item.argument, seen);
  if (isFunction(item)) {
    const body = node(item.body);
    if (body?.type !== "BlockStatement") return remoteValue(context, body, seen);
    let tainted = false;
    walk(
      body,
      (child) => {
        if (child.type === "ReturnStatement" && remoteValue(context, child.argument, new Set(seen)))
          tainted = true;
      },
      true,
    );
    return tainted;
  }
  if (
    [
      "ObjectExpression",
      "ArrayExpression",
      "ConditionalExpression",
      "LogicalExpression",
      "BinaryExpression",
      "TemplateLiteral",
    ].includes(item.type ?? "")
  ) {
    let tainted = false;
    walk(item, (child) => {
      if (
        child !== item &&
        child.type === "Identifier" &&
        remoteValue(context, child, new Set(seen))
      )
        tainted = true;
    });
    return tainted;
  }
  return false;
}

/** Scalar selection/default-open values are UI state; copied records/collections are not. */
function selectionScalar(expression: unknown, stateName: string): boolean {
  if (!/^(?:selected|active|focused|expanded|open|defaultOpen)(?:[A-Z_]|$)/.test(stateName))
    return false;
  const item = unwrap(expression);
  return (
    item?.type === "MemberExpression" && /^(?:id|key|open|expanded)$/.test(staticMember(item) ?? "")
  );
}

function localStates(context: FrontendContext): LocalState[] {
  const result: LocalState[] = [];
  for (const binding of context.bindings.declarations) {
    if (binding.projection[0] !== "0") continue;
    const call = reactCall(context, binding.initializer, ["useState", "useReducer"]);
    if (!call) continue;
    const setter = context.bindings.declarations.find(
      (candidate) =>
        candidate.declaration === binding.declaration && candidate.projection[0] === "1",
    );
    result.push({ value: binding, setter, call });
  }
  return result;
}

function refersTo(context: FrontendContext, expression: unknown, binding: Binding): boolean {
  let found = false;
  walk(expression, (item) => {
    if (item.type === "Identifier" && context.bindings.lookup(item) === binding) found = true;
  });
  return found;
}

function reactiveDerivation(
  context: FrontendContext,
  expression: unknown,
  effect: FrontendNode,
): boolean {
  const item = unwrap(expression);
  if (!item || item.type === "Literal") return false;
  let reactive = false;
  walk(item, (child, parent) => {
    if (child.type !== "Identifier") return;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed)
      return;
    if (
      parent?.type === "Property" &&
      parent.key === child &&
      !parent.computed &&
      !parent.shorthand
    )
      return;
    const binding = context.bindings.lookup(child);
    if (!binding) return;
    const start = binding.declaration.start ?? 0;
    if (start >= (effect.start ?? 0) && start <= (effect.end ?? 0)) return;
    // Module constants and literal reset defaults do not derive reactive state.
    if (node(binding.initializer)?.type === "Literal") return;
    if (
      binding.parameter ||
      reactCall(context, binding.initializer, ["useState", "useReducer"]) ||
      remoteValue(context, child)
    )
      reactive = true;
  });
  return reactive;
}

export function checkFrontendState(context: FrontendContext): void {
  const states = localStates(context);
  for (const state of states) {
    const args = nodes(state.call.arguments);
    const origin = context.bindings.origin(state.call.callee);
    const initial = args[origin?.path.at(-1) === "useReducer" ? 1 : 0];
    if (remoteValue(context, initial) && !selectionScalar(initial, state.value.name))
      context.add(
        "frontend-server-state-copy",
        "Keep remote data in its query/loader owner; derive it during render instead of copying it into React state.",
        state.call,
      );
  }
  walk(context.program, (item) => {
    const effect = reactCall(context, item, ["useEffect", "useLayoutEffect", "useInsertionEffect"]);
    if (effect) {
      const callback = nodes(effect.arguments)[0];
      walk(callback, (call) => {
        if (call.type !== "CallExpression") return;
        const callee = unwrap(call.callee);
        if (callee?.type !== "Identifier") return;
        const setter = context.bindings.lookup(callee);
        const state = states.find((entry) => entry.setter === setter);
        if (!state) return;
        const next = nodes(call.arguments)[0];
        if (
          remoteValue(context, next) ||
          (reactiveDerivation(context, next, effect) &&
            !isRealtimeEventSetter(context, call, effect))
        )
          context.add(
            "frontend-derived-effect-state",
            "Do not synchronize derived props, query data or React state into another state value in an effect; derive during render.",
            call,
          );
      });
    }
    if (context.role !== "view" || item.type !== "JSXAttribute") return;
    const opening = context.bindings.parent(item);
    if (opening?.type !== "JSXOpeningElement") return;
    const tag = name(opening.name);
    if (!["input", "Input", "textarea", "Textarea", "TextInput"].includes(tag ?? "")) return;
    const type = nodes(opening.attributes).find((attribute) => name(attribute.name) === "type");
    const inputType = node(type?.value)?.value;
    if (["checkbox", "radio", "range", "button", "submit", "reset"].includes(String(inputType)))
      return;
    const attribute = name(item.name);
    if (
      ![
        "value",
        "checked",
        "onChange",
        "onChangeText",
        "onValueChange",
        "onCheckedChange",
      ].includes(attribute ?? "")
    )
      return;
    for (const state of states) {
      if (
        refersTo(context, item.value, state.value) ||
        (state.setter && refersTo(context, item.value, state.setter))
      )
        context.add(
          "frontend-form-owner",
          "Controlled form field state belongs in a workflow using useAppForm; pass field state and callbacks to this view.",
          item,
        );
    }
  });
}
