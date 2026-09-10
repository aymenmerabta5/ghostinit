import { describe, expect, test } from "bun:test";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";

function findings(body: string, file = "src/features/messages/queries.ts") {
  const source =
    'import { useEffect, useState } from "react"; import { subscribeRealtime as subscribe } from "@/lib/realtime"; import { useRows } from "./queries";\nexport function useStatus(owner: string) { const [state, setState] = useState({}); const query = useRows(); useEffect(() => {' +
    body +
    "}, [owner]); return state; }";
  const parsed = parseFile(source, "ts");
  expect(parsed.diagnostics).toEqual([]);
  return analyzeFrontendFile({
    file,
    source,
    program: parsed.program,
    comments: parsed.comments,
  }).map(({ id }) => id);
}

describe("event state remains distinct from effect-derived render state", () => {
  test("status and realtime events may retain an owner tag with newly delivered values", () => {
    expect(
      findings(
        "const status = (connected: boolean) => { setState(current => ({ owner, connected, current })); }; return subscribe(owner, (event: { userId: string }) => setState({ owner, user: event.userId }), status);",
      ),
    ).toEqual([]);
    expect(
      findings(
        "function status(connected: boolean) { setState({ owner, connected }); } return subscribe(owner, () => {}, status);",
      ),
    ).toEqual([]);
  });
  test("a subscription callback cannot hide query copies or ignore its event and derive props", () => {
    expect(
      findings("return subscribe(owner, event => setState({ ...query.data, event }));"),
    ).toContain("frontend-derived-effect-state");
    expect(
      findings('return subscribe(owner, event => setState({ owner, event: "constant" }));'),
    ).toContain("frontend-derived-effect-state");
  });
  test("ordinary synchronous array callbacks and fake local subscription names remain checked", () => {
    expect(findings("[1].forEach(event => setState({ owner, event }));")).toContain(
      "frontend-derived-effect-state",
    );
    expect(
      findings(
        'const subscribe = (_owner: string, callback: (event: string) => void) => callback("sync"); subscribe(owner, event => setState({ owner, event }));',
      ),
    ).toContain("frontend-derived-effect-state");
  });
  test("views still cannot own realtime clients", () => {
    expect(
      findings(
        "return subscribe(owner, event => setState({ owner, event }));",
        "src/features/messages/components/view.ts",
      ),
    ).toContain("frontend-remote-owner");
  });
});
