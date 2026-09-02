// @allow-long 769: one structural pass keeps bounded raw-body lineage, response status, and catch dominance coherent
/** Structural facts extracted from one webhook function. */

import { parseSync } from "oxc-parser";

type Node = Record<string, unknown> & { type?: string; start?: number; end?: number };

export interface WebhookFunctionFacts {
  name: string;
  routeHandler: boolean;
  bodyReads: number[];
  unboundedBodyReads: number[];
  forbiddenBodyReads: number[];
  verifierCalls: number[];
  invalidVerifierCalls: number[];
  bodyParses: number[];
  successReturns: Array<{ position: number; duplicateGuard: boolean }>;
  claims: number[];
  completions: number[];
  failures: number[];
  sideEffects: number[];
  unsafeCatches: number[];
  randomEventIds: number[];
}

function node(value: unknown): Node | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : undefined;
}

function children(value: Node): Node[] {
  const result: Node[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (["loc", "range", "start", "end"].includes(key)) continue;
    if (Array.isArray(child)) {
      for (const entry of child) {
        const childNode = node(entry);
        if (childNode) result.push(childNode);
      }
    } else {
      const childNode = node(child);
      if (childNode) result.push(childNode);
    }
  }
  return result;
}

function memberName(value: unknown): string | undefined {
  const current = node(value);
  if (!current) return undefined;
  if (current.type === "Identifier" && typeof current.name === "string") return current.name;
  if (current.type === "MemberExpression" || current.type === "OptionalMemberExpression") {
    const objectName = memberName(current.object);
    const propertyName = memberName(current.property) ?? literal(current.property);
    return [objectName, propertyName].filter(Boolean).join(".");
  }
  return undefined;
}

function requestBodyMethod(name: string): string | undefined {
  return name.match(/(?:^|\.)(?:request|req)\.(arrayBuffer|json|text|formData|blob)$/)?.[1];
}

function literal(value: unknown): string | undefined {
  const current = node(value);
  return current?.type === "Literal" && typeof current.value === "string"
    ? current.value
    : undefined;
}

function slice(source: string, value: Node): string {
  return source.slice(value.start ?? 0, value.end ?? value.start ?? 0);
}

function functionName(value: Node, parent?: Node): string {
  const own = memberName(value.id);
  if (own) return own;
  if (parent?.type === "VariableDeclarator") return memberName(parent.id) ?? "anonymous";
  if (parent?.type === "Property")
    return memberName(parent.key) ?? literal(parent.key) ?? "anonymous";
  return "anonymous";
}

function isFunction(value: Node): boolean {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
    value.type ?? "",
  );
}

function collectFunctionNodes(program: Node): Array<{ fn: Node; parent?: Node }> {
  const functions: Array<{ fn: Node; parent?: Node }> = [];
  const stack: Array<{ value: Node; parent?: Node }> = [{ value: program }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (isFunction(current.value)) functions.push({ fn: current.value, parent: current.parent });
    for (const child of children(current.value))
      stack.push({ value: child, parent: current.value });
  }
  return functions.toSorted((left, right) => (left.fn.start ?? 0) - (right.fn.start ?? 0));
}

function descendants(root: Node): Array<{ value: Node; ancestors: Node[] }> {
  const result: Array<{ value: Node; ancestors: Node[] }> = [];
  const stack: Array<{ value: Node; ancestors: Node[] }> = [{ value: root, ancestors: [] }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    result.push(current);
    for (const child of children(current.value)) {
      if (child !== root && isFunction(child)) continue;
      stack.push({ value: child, ancestors: [...current.ancestors, current.value] });
    }
  }
  return result.toSorted((left, right) => (left.value.start ?? 0) - (right.value.start ?? 0));
}

type RawLineage = "none" | "bytes" | "text";

interface LineageBindings {
  bytes: Set<string>;
  text: Set<string>;
}

function expressionLineage(
  value: unknown,
  bindings: LineageBindings,
  rawBodyFunctions: ReadonlySet<string>,
): RawLineage {
  const current = node(value);
  if (!current) return "none";
  if (current.type === "Identifier") {
    const name = String(current.name ?? "");
    if (bindings.bytes.has(name)) return "bytes";
    if (bindings.text.has(name)) return "text";
    return "none";
  }
  if (current.type === "MemberExpression" || current.type === "OptionalMemberExpression") {
    const name = memberName(current);
    if (name === "input.rawBody") return "bytes";
    return expressionLineage(current.object, bindings, rawBodyFunctions);
  }
  if (
    [
      "AwaitExpression",
      "TSAsExpression",
      "TSTypeAssertion",
      "TSNonNullExpression",
      "ChainExpression",
      "ParenthesizedExpression",
    ].includes(current.type ?? "")
  ) {
    return expressionLineage(current.argument ?? current.expression, bindings, rawBodyFunctions);
  }
  if (current.type === "CallExpression") {
    const name = memberName(current.callee) ?? "";
    const args = Array.isArray(current.arguments) ? current.arguments : [];
    if (requestBodyMethod(name) === "arrayBuffer") return "bytes";
    if (rawBodyFunctions.has(name)) return "bytes";
    if (name === "Buffer.from") {
      return expressionLineage(args[0], bindings, rawBodyFunctions) === "bytes" ? "bytes" : "none";
    }
    if (name.endsWith(".toString")) {
      const input = expressionLineage(node(current.callee)?.object, bindings, rawBodyFunctions);
      return input === "none" ? "none" : "text";
    }
  }
  if (current.type === "ObjectExpression" && Array.isArray(current.properties)) {
    const lineages = current.properties.map((property) =>
      expressionLineage(node(property)?.value, bindings, rawBodyFunctions),
    );
    if (lineages.includes("bytes")) return "bytes";
    if (lineages.includes("text")) return "text";
  }
  return "none";
}

function taintedBindings(
  nodes: Array<{ value: Node }>,
  rawBodyFunctions: ReadonlySet<string>,
): LineageBindings {
  const bindings: LineageBindings = { bytes: new Set<string>(), text: new Set<string>() };
  let changed = true;
  while (changed) {
    changed = false;
    for (const { value } of nodes) {
      if (value.type !== "VariableDeclarator" && value.type !== "AssignmentExpression") continue;
      const name = memberName(value.id ?? value.left);
      const expression = value.init ?? value.right;
      if (!name || bindings.bytes.has(name) || bindings.text.has(name)) continue;
      const lineage = expressionLineage(expression, bindings, rawBodyFunctions);
      if (lineage === "bytes") {
        bindings.bytes.add(name);
        changed = true;
      } else if (lineage === "text") {
        bindings.text.add(name);
        changed = true;
      }
    }
  }
  return bindings;
}

function callArguments(value: Node): unknown[] {
  return Array.isArray(value.arguments) ? value.arguments : [];
}

function isSuccessReturn(value: Node, source: string): boolean {
  if (value.type !== "ReturnStatement") return false;
  const text = slice(source, value);
  if (/\bvalid\s*:\s*true\b/.test(text)) return true;
  const statuses = responseStatuses(value);
  if (!statuses) return false;
  return statuses.length === 0 || statuses.some((status) => status >= 200 && status < 300);
}

function responseStatuses(value: Node): number[] | undefined {
  const response = node(value.argument);
  if (!response || !["NewExpression", "CallExpression"].includes(response.type ?? "")) {
    return undefined;
  }
  const callee = memberName(response.callee);
  if (callee !== "Response" && callee !== "Response.json") return undefined;
  const args = callArguments(response);
  const options = node(args[1]);
  if (options?.type !== "ObjectExpression" || !Array.isArray(options.properties)) return [];
  const statusProperty = options.properties
    .map(node)
    .find(
      (property) => memberName(property?.key) === "status" || literal(property?.key) === "status",
    );
  return statusProperty ? numericLiterals(node(statusProperty.value)) : [];
}

function numericLiterals(root: Node | undefined): number[] {
  if (!root) return [];
  const values: number[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.type === "Literal" && typeof current.value === "number") {
      values.push(current.value);
    }
    stack.push(...children(current));
  }
  return values;
}

interface FunctionProofs {
  boundedBodyReaders: Set<string>;
  streamBodyReaders: Set<string>;
  declaredBodyCaps: Set<string>;
  strictDeclaredBodyCaps: Set<string>;
}

interface ArrayBufferRead {
  position: number;
  binding?: string;
}

function rejectsRequest(root: Node): boolean {
  return descendants(root).some(({ value }) => {
    if (value.type === "ThrowStatement") return true;
    if (value.type !== "ReturnStatement") return false;
    const statuses = responseStatuses(value);
    if (statuses?.some((status) => status >= 400)) return true;
    const argument = node(value.argument);
    return memberName(argument?.callee) === "payloadTooLarge";
  });
}

function limitTest(value: Node, source: string, byteLengthRequired: boolean): boolean {
  const test = node(value.test);
  if (!test) return false;
  const text = slice(source, test);
  const declaredOneMiBLimit =
    /const\s+MAX_WEBHOOK_BODY_BYTES\s*=\s*(?:1_?048_?576|1024\s*\*\s*1024)\b/.test(source);
  const hasLimit =
    /1_?048_?576/.test(text) || (/MAX_WEBHOOK_BODY_BYTES/.test(text) && declaredOneMiBLimit);
  const hasComparison = /[<>]=?/.test(text);
  return hasLimit && hasComparison && (!byteLengthRequired || /byteLength/.test(text));
}

function functionProofs(
  functions: Array<{ fn: Node; parent?: Node }>,
  source: string,
): FunctionProofs {
  const boundedBodyReaders = new Set<string>();
  const streamBodyReaders = new Set<string>();
  const declaredBodyCaps = new Set<string>();
  const strictDeclaredBodyCaps = new Set<string>();

  for (const { fn, parent } of functions) {
    const name = functionName(fn, parent);
    if (name === "anonymous") continue;
    const nodes = descendants(fn);
    const calls = nodes.filter(({ value }) => value.type === "CallExpression");
    const callNamed = (suffix: string) =>
      calls.filter(({ value }) => (memberName(value.callee) ?? "").endsWith(suffix));

    const getReaders = callNamed(".getReader");
    const reads = callNamed(".read");
    const cancels = callNamed(".cancel");
    if (getReaders.length > 0 || reads.length > 0) streamBodyReaders.add(name);

    const contentLengthCall = calls.find(({ value }) => {
      if (!(memberName(value.callee) ?? "").endsWith(".headers.get")) return false;
      return callArguments(value).some(
        (argument) => literal(argument)?.toLowerCase() === "content-length",
      );
    });
    const contentLengthBinding = contentLengthCall
      ? assignedBinding(contentLengthCall.ancestors)
      : undefined;
    const declaredLimitGuard = nodes.some(
      ({ value }) =>
        value.type === "IfStatement" &&
        limitTest(value, source, false) &&
        !/byteLength/.test(slice(source, node(value.test) ?? value)) &&
        rejectsRequest(node(value.consequent) ?? value),
    );
    if (contentLengthCall && declaredLimitGuard) declaredBodyCaps.add(name);
    const rejectingIfTests = nodes
      .filter(
        ({ value }) =>
          value.type === "IfStatement" && rejectsRequest(node(value.consequent) ?? value),
      )
      .map(({ value }) => slice(source, node(value.test) ?? value));
    const rejectsMissingLength = Boolean(
      contentLengthBinding &&
      rejectingIfTests.some(
        (test) => test.includes(contentLengthBinding) && /(?:===|==)\s*null/.test(test),
      ),
    );
    const validatesInteger = rejectingIfTests.some((test) => /Number\.isSafeInteger/.test(test));
    const rejectsInvalidOrNegative = rejectingIfTests.some(
      (test) => /\.test\s*\(/.test(test) || /<\s*0/.test(test),
    );
    if (
      contentLengthCall &&
      declaredLimitGuard &&
      rejectsMissingLength &&
      validatesInteger &&
      rejectsInvalidOrNegative
    ) {
      strictDeclaredBodyCaps.add(name);
    }

    const bodyMember = nodes.some(
      ({ value }) =>
        (value.type === "MemberExpression" || value.type === "OptionalMemberExpression") &&
        (memberName(value) ?? "").endsWith(".body"),
    );
    const loopRead = reads.some(({ ancestors }) =>
      ancestors.some((ancestor) =>
        ["WhileStatement", "DoWhileStatement", "ForStatement", "ForOfStatement"].includes(
          ancestor.type ?? "",
        ),
      ),
    );
    const byteGuards = nodes.filter(
      ({ value }) =>
        value.type === "IfStatement" &&
        limitTest(value, source, true) &&
        rejectsRequest(node(value.consequent) ?? value),
    );
    const guardingCancel = byteGuards.find(({ value: guard }) =>
      descendants(node(guard.consequent) ?? guard).some(
        ({ value }) =>
          value.type === "CallExpression" && (memberName(value.callee) ?? "").endsWith(".cancel"),
      ),
    );
    const firstPush = callNamed(".push")[0]?.value.start ?? Number.POSITIVE_INFINITY;
    const bufferAllocation = calls.find(
      ({ value, ancestors }) =>
        ["Buffer.alloc", "Buffer.allocUnsafe", "Buffer.concat"].includes(
          memberName(value.callee) ?? "",
        ) && assignedBinding(ancestors),
    );
    const bufferBinding = bufferAllocation
      ? assignedBinding(bufferAllocation.ancestors)
      : undefined;
    const bufferCopy = callNamed(".set")[0];
    const releaseLock = callNamed(".releaseLock")[0];
    const forbiddenRead = calls.some(({ value }) =>
      /\.(?:arrayBuffer|json|text|formData|blob)$/.test(memberName(value.callee) ?? ""),
    );
    const guardPosition = guardingCancel?.value.start ?? Number.POSITIVE_INFINITY;
    const bufferPosition = bufferAllocation?.value.start ?? Number.NEGATIVE_INFINITY;
    const successfulBufferReturn = nodes.some(({ value }) => {
      if (value.type !== "ReturnStatement" || (value.start ?? 0) <= bufferPosition) return false;
      return Boolean(bufferBinding && memberName(value.argument) === bufferBinding);
    });

    if (
      bodyMember &&
      getReaders.length === 1 &&
      reads.length === 1 &&
      cancels.length >= 1 &&
      loopRead &&
      guardingCancel &&
      guardPosition < firstPush &&
      bufferAllocation &&
      bufferCopy &&
      releaseLock &&
      successfulBufferReturn &&
      !forbiddenRead
    ) {
      boundedBodyReaders.add(name);
    }
  }

  return {
    boundedBodyReaders,
    streamBodyReaders,
    declaredBodyCaps,
    strictDeclaredBodyCaps,
  };
}

function assignedBinding(ancestors: Node[]): string | undefined {
  const declaration = ancestors
    .toReversed()
    .find((ancestor) =>
      ["VariableDeclarator", "AssignmentExpression"].includes(ancestor.type ?? ""),
    );
  return memberName(declaration?.id ?? declaration?.left);
}

function guardedDeclaredCapBefore(
  nodes: Array<{ value: Node; ancestors: Node[] }>,
  position: number,
  declaredBodyCaps: ReadonlySet<string>,
  source: string,
): boolean {
  const headerRead = nodes.find(
    ({ value }) =>
      value.type === "CallExpression" &&
      (value.start ?? 0) < position &&
      (memberName(value.callee) ?? "").endsWith(".headers.get") &&
      callArguments(value).some(
        (argument) => literal(argument)?.toLowerCase() === "content-length",
      ),
  );
  const contentLengthBinding = headerRead ? assignedBinding(headerRead.ancestors) : undefined;
  const inlineLimit = nodes.some(
    ({ value }) =>
      value.type === "IfStatement" &&
      (value.start ?? 0) < position &&
      limitTest(value, source, false) &&
      rejectsRequest(node(value.consequent) ?? value),
  );
  const rejectingTests = nodes
    .filter(
      ({ value }) =>
        value.type === "IfStatement" &&
        (value.start ?? 0) < position &&
        rejectsRequest(node(value.consequent) ?? value),
    )
    .map(({ value }) => slice(source, node(value.test) ?? value));
  const missingRejected = Boolean(
    contentLengthBinding &&
    rejectingTests.some(
      (test) => test.includes(contentLengthBinding) && /(?:===|==)\s*null/.test(test),
    ),
  );
  const integerValidated = rejectingTests.some((test) => /Number\.isSafeInteger/.test(test));
  const invalidOrNegativeRejected = rejectingTests.some(
    (test) => /\.test\s*\(/.test(test) || /<\s*0/.test(test),
  );
  if (headerRead && inlineLimit && missingRejected && integerValidated && invalidOrNegativeRejected)
    return true;

  return nodes.some(({ value, ancestors }) => {
    if (value.type !== "CallExpression" || (value.start ?? 0) >= position) return false;
    const call = memberName(value.callee) ?? "";
    if (!declaredBodyCaps.has(call)) return false;
    const binding = assignedBinding(ancestors);
    if (!binding) return false;
    return nodes.some(
      ({ value: guard }) =>
        guard.type === "IfStatement" &&
        (guard.start ?? 0) > (value.start ?? 0) &&
        (guard.start ?? 0) < position &&
        new RegExp(`\\b${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`).test(
          slice(source, node(guard.test) ?? guard),
        ) &&
        rejectsRequest(node(guard.consequent) ?? guard),
    );
  });
}

function guardedActualCapAfter(
  nodes: Array<{ value: Node; ancestors: Node[] }>,
  read: ArrayBufferRead,
  boundary: number,
  source: string,
): boolean {
  return nodes.some(({ value }) => {
    if (
      value.type !== "IfStatement" ||
      (value.start ?? 0) <= read.position ||
      (value.start ?? 0) >= boundary ||
      !limitTest(value, source, true) ||
      !rejectsRequest(node(value.consequent) ?? value)
    ) {
      return false;
    }
    if (!read.binding) return true;
    const test = slice(source, node(value.test) ?? value);
    return test.includes(`${read.binding}.byteLength`);
  });
}

function responseUnionHandled(
  nodes: Array<{ value: Node; ancestors: Node[] }>,
  binding: string,
  after: number,
  before: number,
  source: string,
): boolean {
  return nodes.some(({ value }) => {
    if (
      value.type !== "IfStatement" ||
      (value.start ?? 0) <= after ||
      (value.start ?? 0) >= before
    ) {
      return false;
    }
    const test = slice(source, node(value.test) ?? value);
    if (!test.includes(binding) || !/instanceof\s+Response/.test(test)) return false;
    return descendants(node(value.consequent) ?? value).some(
      ({ value: child }) => child.type === "ReturnStatement" || child.type === "ThrowStatement",
    );
  });
}

function boundedReaderCallIsGuarded(
  callNode: Node,
  ancestors: Node[],
  nodes: Array<{ value: Node; ancestors: Node[] }>,
  declaredBodyCaps: ReadonlySet<string>,
  source: string,
): boolean {
  const callPosition = callNode.start ?? 0;
  const resultBinding = assignedBinding(ancestors);
  if (!resultBinding) return false;
  const processingBoundary = Math.min(
    ...nodes
      .filter(
        ({ value }) =>
          value.type === "CallExpression" &&
          (value.start ?? 0) > callPosition &&
          /(?:constructEvent(?:Async)?|verifySignature|unmarshal|validateEvent|verify\w*Webhook|claimWebhookDelivery|claimWebhookEvent|handle\w*Event|process\w*Event)$/.test(
            memberName(value.callee) ?? "",
          ),
      )
      .map(({ value }) => value.start ?? Number.POSITIVE_INFINITY),
    Number.POSITIVE_INFINITY,
  );
  if (!responseUnionHandled(nodes, resultBinding, callPosition, processingBoundary, source)) {
    return false;
  }

  const inputBinding = memberName(callArguments(callNode)[0]);
  if (!inputBinding) return false;
  const gateDeclaration = nodes.find(({ value }) => {
    if (value.type !== "VariableDeclarator" || memberName(value.id) !== inputBinding) return false;
    const initializer = node(value.init);
    return (
      initializer?.type === "CallExpression" &&
      declaredBodyCaps.has(memberName(initializer.callee) ?? "")
    );
  })?.value;
  if (!gateDeclaration || (gateDeclaration.start ?? 0) >= callPosition) return false;
  return responseUnionHandled(
    nodes,
    inputBinding,
    gateDeclaration.start ?? 0,
    callPosition,
    source,
  );
}

function hasSafeFailure(value: Node, source: string): boolean {
  const text = slice(source, value);
  if (
    /\b(?:failWebhookDelivery|failWebhookEvent)\s*\(/.test(text) ||
    /\bthrow\b/.test(text) ||
    /\bvalid\s*:\s*false\b/.test(text)
  ) {
    return true;
  }
  return descendants(value).some(({ value: child }) => {
    if (child.type !== "ReturnStatement") return false;
    const statuses = responseStatuses(child);
    return Boolean(statuses && statuses.length > 0 && statuses.every((status) => status >= 400));
  });
}

function duplicateGuard(ancestors: Node[], source: string): boolean {
  const guard = ancestors.toReversed().find((ancestor) => ancestor.type === "IfStatement");
  if (!guard) return false;
  return /(?:processed|(?:status|claim)\s*={2,3}\s*["']completed["'])/.test(slice(source, guard));
}

function randomIdContext(ancestors: Node[], source: string): boolean {
  return ancestors.some((ancestor) => {
    if (ancestor.type === "VariableDeclarator") {
      return /(?:provider)?eventId/i.test(memberName(ancestor.id) ?? "");
    }
    if (ancestor.type === "Property") {
      return /(?:provider)?eventId/i.test(memberName(ancestor.key) ?? literal(ancestor.key) ?? "");
    }
    return ancestor.type === "TemplateLiteral" && /evt_/.test(slice(source, ancestor));
  });
}

export function inspectWebhookFunctions(source: string, extension: string): WebhookFunctionFacts[] {
  const ext = extension.toLowerCase();
  const lang = ext.endsWith("x")
    ? ext.endsWith("jsx")
      ? "jsx"
      : "tsx"
    : ext.includes("t")
      ? "ts"
      : "js";
  const parsed = parseSync(`webhook${extension}`, source, { sourceType: "unambiguous", lang });
  if (parsed.errors.length > 0) return [];
  const facts: WebhookFunctionFacts[] = [];
  const functions = collectFunctionNodes(parsed.program as unknown as Node);
  const proofs = functionProofs(functions, source);

  for (const { fn, parent } of functions) {
    const nodes = descendants(fn);
    const lineage = taintedBindings(nodes, proofs.boundedBodyReaders);
    const name = functionName(fn, parent);
    const bodyReads: number[] = [];
    const unboundedBodyReads: number[] = [];
    const arrayBufferReads: ArrayBufferRead[] = [];
    const forbiddenBodyReads: number[] = [];
    const verifierCalls: number[] = [];
    const invalidVerifierCalls: number[] = [];
    const bodyParses: number[] = [];
    const successReturns: WebhookFunctionFacts["successReturns"] = [];
    const claims: number[] = [];
    const completions: number[] = [];
    const failures: number[] = [];
    const sideEffects: number[] = [];
    const unsafeCatches: number[] = [];
    const randomEventIds: number[] = [];

    for (const { value, ancestors } of nodes) {
      const position = value.start ?? 0;
      if (value.type === "ReturnStatement" && isSuccessReturn(value, source)) {
        successReturns.push({ position, duplicateGuard: duplicateGuard(ancestors, source) });
      }
      if (
        value.type === "CatchClause" &&
        !hasSafeFailure(value, source) &&
        !ancestors.some(
          (ancestor) => ancestor.type === "CatchClause" && hasSafeFailure(ancestor, source),
        )
      ) {
        unsafeCatches.push(position);
      }
      if (value.type !== "CallExpression") continue;
      const call = memberName(value.callee) ?? "";
      const args = callArguments(value);
      if (requestBodyMethod(call) === "arrayBuffer") {
        bodyReads.push(position);
        arrayBufferReads.push({ position, binding: assignedBinding(ancestors) });
      }
      if (proofs.streamBodyReaders.has(call)) {
        bodyReads.push(position);
        if (
          !proofs.boundedBodyReaders.has(call) ||
          !boundedReaderCallIsGuarded(value, ancestors, nodes, proofs.declaredBodyCaps, source)
        ) {
          unboundedBodyReads.push(position);
        }
      }
      if (["json", "text", "formData", "blob"].includes(requestBodyMethod(call) ?? "")) {
        forbiddenBodyReads.push(position);
        bodyReads.push(position);
      }
      if (
        call === "JSON.parse" &&
        expressionLineage(args[0], lineage, proofs.boundedBodyReaders) !== "none"
      )
        bodyParses.push(position);
      if (
        /(?:constructEvent(?:Async)?|verifySignature|unmarshal|validateEvent|verify\w*Webhook)$/.test(
          call,
        )
      ) {
        const verifierAcceptsRawText = call.endsWith(".unmarshal");
        if (
          args.some((argument) => {
            const argumentLineage = expressionLineage(argument, lineage, proofs.boundedBodyReaders);
            return (
              argumentLineage === "bytes" || (verifierAcceptsRawText && argumentLineage === "text")
            );
          })
        )
          verifierCalls.push(position);
        else invalidVerifierCalls.push(position);
      }
      const text = slice(source, value);
      if (/\b(?:claimWebhookDelivery|claimWebhookEvent)\b/.test(text)) claims.push(position);
      if (/\b(?:completeWebhookDelivery|completeWebhookEvent)\b/.test(text)) {
        completions.push(position);
      }
      if (/\b(?:failWebhookDelivery|failWebhookEvent)\b/.test(text)) failures.push(position);
      if (/\bprocessed\s*:\s*true\b/.test(text)) completions.push(position);
      if (
        /\b(?:db\.(?:insert|update|delete)|runMutation|handle\w*Event|process\w*Event)\b/.test(text)
      ) {
        sideEffects.push(position);
      }
      if ((call === "Date.now" || call === "Math.random") && randomIdContext(ancestors, source)) {
        randomEventIds.push(position);
      }
    }

    for (const read of arrayBufferReads) {
      const boundaryCandidates = [
        ...verifierCalls,
        ...invalidVerifierCalls,
        ...bodyParses,
        ...claims,
        ...sideEffects,
        ...successReturns.map(({ position }) => position),
      ].filter((position) => position > read.position);
      const boundary =
        boundaryCandidates.length > 0
          ? Math.min(...boundaryCandidates)
          : (fn.end ?? Number.POSITIVE_INFINITY);
      if (
        !guardedDeclaredCapBefore(nodes, read.position, proofs.strictDeclaredBodyCaps, source) ||
        !guardedActualCapAfter(nodes, read, boundary, source)
      ) {
        unboundedBodyReads.push(read.position);
      }
    }

    const relevant =
      bodyReads.length + verifierCalls.length + invalidVerifierCalls.length + bodyParses.length;
    if (relevant === 0 && !/webhook/i.test(name)) continue;
    facts.push({
      name,
      routeHandler: /^(?:POST|handler|handle\w*Webhook)$/i.test(name),
      bodyReads,
      unboundedBodyReads,
      forbiddenBodyReads,
      verifierCalls,
      invalidVerifierCalls,
      bodyParses,
      successReturns,
      claims,
      completions,
      failures,
      sideEffects,
      unsafeCatches,
      randomEventIds,
    });
  }
  return facts;
}
