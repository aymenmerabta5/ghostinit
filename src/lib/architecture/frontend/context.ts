import { classifyFrontendFile } from "./classify.js";
import { FrontendBindings } from "./bindings.js";
import { DEFAULT_FRONTEND_OWNERSHIP_POLICY } from "./policy.js";
import { frontendImportFacts } from "./import-facts.js";
import type { FrontendAnalysisInput, FrontendFinding, FrontendNode } from "./types.js";

export function createFrontendContext(input: FrontendAnalysisInput) {
  const policy = input.policy ?? DEFAULT_FRONTEND_OWNERSHIP_POLICY;
  const findings: FrontendFinding[] = [];
  const seen = new Set<string>();
  const starts = [0];
  for (let index = 0; index < input.source.length; index++)
    if (input.source[index] === "\n") starts.push(index + 1);
  return {
    ...input,
    imports: frontendImportFacts(input.program, input.imports),
    policy,
    role: classifyFrontendFile(input.file, input.source, policy),
    bindings: new FrontendBindings(input.program),
    findings,
    add(id: string, message: string, item?: FrontendNode) {
      const offset = item?.start ?? 0;
      const key = `${id}:${offset}`;
      if (seen.has(key)) return;
      seen.add(key);
      let low = 0;
      let high = starts.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        if ((starts[middle] ?? 0) <= offset) low = middle + 1;
        else high = middle - 1;
      }
      const line = Math.max(0, high);
      findings.push({
        id,
        message,
        file: input.file,
        severity: "HIGH",
        rule: "frontend-ownership",
        line: line + 1,
        column: offset - (starts[line] ?? 0) + 1,
      });
    },
  };
}

export type FrontendContext = ReturnType<typeof createFrontendContext>;
