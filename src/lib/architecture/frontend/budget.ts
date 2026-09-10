import { isFunction, name, node, nodes, unwrap, walk } from "./ast.js";
import type { FrontendContext } from "./context.js";
import type { FrontendNode } from "./types.js";

function codeLines(source: string, comments: readonly unknown[]): number {
  const chars = source.split("");
  for (const value of comments) {
    if (!value || typeof value !== "object") continue;
    const comment = value as { start?: number; end?: number };
    if (typeof comment.start !== "number" || typeof comment.end !== "number") continue;
    for (let index = comment.start; index < comment.end; index++)
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
  }
  return chars
    .join("")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}

function fields(
  context: FrontendContext,
  expression: unknown,
  seen = new Set<FrontendNode>(),
): number {
  const item = unwrap(expression);
  if (!item || seen.has(item)) return 0;
  seen.add(item);
  if (item.type === "ObjectExpression")
    return nodes(item.properties).filter((property) => property.type === "Property").length;
  if (item.type === "Identifier")
    return fields(context, context.bindings.lookup(item)?.initializer, seen);
  if (item.type === "ConditionalExpression")
    return Math.max(fields(context, item.consequent, seen), fields(context, item.alternate, seen));
  return 0;
}

export function checkWorkflowBudget(context: FrontendContext): void {
  if (context.role !== "workflow") return;
  const lines = codeLines(context.source, context.comments ?? []);
  if (lines > context.policy.workflow.maxCodeLines)
    context.add(
      "frontend-workflow-budget",
      `Workflow file has ${lines} code lines; split cohesive responsibilities to stay within ${context.policy.workflow.maxCodeLines}.`,
    );
  walk(context.program, (item, parent) => {
    if (!isFunction(item)) return;
    const hookName =
      name(item.id) ?? (parent?.type === "VariableDeclarator" ? name(parent.id) : undefined);
    if (!hookName || !/^use[A-Z]/.test(hookName)) return;
    const body = node(item.body);
    const returns = body?.type === "BlockStatement" ? [] : [body];
    if (body?.type === "BlockStatement")
      walk(
        body,
        (statement) => {
          if (statement.type === "ReturnStatement") returns.push(node(statement.argument));
        },
        true,
      );
    for (const returned of returns) {
      const count = fields(context, returned);
      if (count > context.policy.workflow.maxReturnedFields)
        context.add(
          "frontend-workflow-budget",
          `Workflow ${hookName} returns ${count} explicit fields; expose a focused contract of at most ${context.policy.workflow.maxReturnedFields}.`,
          returned,
        );
    }
  });
}
