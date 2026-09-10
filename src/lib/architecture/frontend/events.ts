import { isFunction, nodes, walk } from "./ast.js";
import type { FrontendContext } from "./context.js";
import type { FrontendNode } from "./types.js";

/** Subscription callbacks may keep an owner tag alongside newly delivered event state. */
export function isRealtimeEventSetter(
  context: FrontendContext,
  call: FrontendNode,
  effect: FrontendNode,
): boolean {
  const effectCallback = nodes(effect.arguments)[0];
  let callback = context.bindings.parent(call);
  while (callback && !isFunction(callback)) callback = context.bindings.parent(callback);
  if (!callback || callback === effectCallback) return false;
  const parameters = context.bindings.declarations.filter(
    (binding) => binding.parameter && binding.declaration === callback,
  );
  let consumesEvent = false;
  walk(nodes(call.arguments)[0], (item, parent) => {
    if (parent?.type === "MemberExpression" && parent.property === item && !parent.computed) return;
    if (parent?.type === "Property" && parent.key === item && !parent.computed && !parent.shorthand)
      return;
    if (item.type === "Identifier" && parameters.includes(context.bindings.lookup(item)!))
      consumesEvent = true;
  });
  if (!consumesEvent) return false;
  let subscribed = false;
  walk(effectCallback, (item) => {
    if (item.type !== "CallExpression") return;
    const origin = context.bindings.origin(item.callee);
    if (
      origin?.path.at(-1) !== "subscribeRealtime" ||
      !/(?:^|\/)lib\/realtime(?:\.[cm]?[jt]s)?$/.test(origin.module)
    )
      return;
    for (const argument of nodes(item.arguments)) {
      const binding =
        argument.type === "Identifier" ? context.bindings.lookup(argument) : undefined;
      if (
        argument === callback ||
        binding?.initializer === callback ||
        binding?.declaration === callback
      )
        subscribed = true;
    }
  });
  return subscribed;
}
