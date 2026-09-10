import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import {
  analyzeFrontendFile,
  classifyFrontendFile,
  DEFAULT_FRONTEND_OWNERSHIP_POLICY,
  validateFrontendOwnershipPolicy,
} from "../../src/lib/architecture/frontend/index.js";

function analyze(file: string, source: string) {
  const parsed = parseFile(source, file.endsWith("x") ? "tsx" : "ts");
  expect(parsed.diagnostics).toEqual([]);
  return analyzeFrontendFile({
    file,
    source,
    program: parsed.program,
    comments: parsed.comments,
    imports: parsed.importReferences,
  });
}
function ids(file: string, source: string) {
  return analyze(file, source).map(({ id }) => id);
}
const screen = "apps/web/src/features/payments/screen.tsx";
const view = "apps/web/src/features/payments/components/receipt.tsx";
const workflow = "apps/web/src/features/payments/use-receipt.ts";

describe("frontend ownership roles", () => {
  test.each([
    ["apps/web/src/app/billing/page.tsx", "route"],
    ["src/routes/billing.tsx", "route"],
    ["apps/mobile/app/billing.tsx", "route"],
    ["app/(tabs)/index.tsx", "route"],
    ["apps/desktop/src/renderer/App.tsx", "route"],
    ["src/renderer/features/payments/section.tsx", "composition"],
    ["src/features/payments/queries.ts", "adapter"],
    ["src/features/payments/use-form.ts", "workflow"],
    ["src/features/payments/helpers.ts", "model"],
    ["src/features/payments/components/card.tsx", "view"],
    ["src/components/header.tsx", "view"],
    ["src/components/ui/dialog.tsx", "primitive"],
    ["src/platform/ui/button.tsx", "primitive"],
    ["packages/ui/src/button.tsx", "primitive"],
    ["src/components/query-auth-boundary.tsx", "infrastructure"],
    ["src/components/unreviewed-provider.tsx", "view"],
    ["src/app/api/payments/route.ts", "other"],
    ["src/routes/api.health.ts", "other"],
  ])("classifies %s as %s", (file, role) => {
    expect(classifyFrontendFile(file)).toBe(role);
  });

  test("the persisted policy matches the bundled default and rejects widened exemptions", async () => {
    const saved: unknown = JSON.parse(
      await readFile("policy/frontend-ownership-policy.json", "utf8"),
    );
    expect(validateFrontendOwnershipPolicy(saved)).toEqual([]);
    expect(saved).toMatchObject(DEFAULT_FRONTEND_OWNERSHIP_POLICY);
    expect(
      validateFrontendOwnershipPolicy({
        ...DEFAULT_FRONTEND_OWNERSHIP_POLICY,
        infrastructure: ["src/**"],
      }),
    ).not.toEqual([]);
    expect(
      validateFrontendOwnershipPolicy({
        ...DEFAULT_FRONTEND_OWNERSHIP_POLICY,
        workflow: { maxCodeLines: 201, maxReturnedFields: 21 },
      }),
    ).not.toEqual([]);
  });
});

describe("frontend AST ownership", () => {
  test.each([
    'import { useState as state } from "react"; const value = state(0);',
    'import * as R from "react"; const value = R.useState(0);',
    'import R from "react"; const value = R["useState"](0);',
    'import R from "react"; const { useState: state } = R; const value = state(0);',
    'const { useState: state } = require("react"); const value = state(0);',
    'import R from "react"; const value = R[method](0);',
    'import { useEffect } from "react"; useEffect(() => {}, []);',
  ])("finds raw composition hooks through bindings: %s", (source) => {
    expect(ids(screen, source)).toContain("frontend-view-workflow");
  });

  test("lexical shadowing and unrelated local names do not produce hook findings", () => {
    expect(
      analyze(
        screen,
        'import { useState } from "react"; function local(useState: (x: number) => number) { return useState(1); }',
      ),
    ).toEqual([]);
    expect(
      analyze(screen, "const React = { useState: (x: number) => x }; React.useState(1);"),
    ).toEqual([]);
    expect(
      analyze(
        screen,
        'import * as React from "react"; function local() { const React = { useState: (x: number) => x }; return React.useState(1); }',
      ),
    ).toEqual([]);
  });

  test.each([
    'import { useQuery } from "@tanstack/react-query"; export function Screen() { return useQuery({}); }',
    'import { client } from "@/lib/orpc"; client.me();',
    'const { fetch: request } = globalThis; request("/api/me");',
    'const open = fetch; open("/api/me");',
    'new window.WebSocket("wss://example.test");',
    'new EventSource("/events");',
    'export { client } from "@/lib/orpc";',
  ])("keeps remote operations out of composition: %s", (source) => {
    expect(ids(screen, source)).toContain("frontend-remote-owner");
  });

  test("remote operations belong in adapters, including native renderer adapters", () => {
    const source =
      'import { useQuery } from "@tanstack/react-query"; export const useReceipt = () => useQuery({ queryFn: () => fetch("/receipts") });';
    expect(analyze("src/renderer/features/payments/queries.ts", source)).toEqual([]);
    expect(ids(workflow, source)).toContain("frontend-remote-owner");
  });

  test("composition consumes semantic hooks and pure render derivations", () => {
    expect(
      analyze(
        screen,
        'import { useReceipt } from "./use-receipt"; import { useMemo } from "react"; export function Screen() { const receipt = useReceipt(); const label = useMemo(() => receipt.label, [receipt.label]); return <p>{label}</p>; }',
      ),
    ).toEqual([]);
  });

  test("views cannot import workflows, but pure named compatibility exports remain valid", () => {
    expect(
      ids(
        view,
        'import { useReceipt } from "../use-receipt"; export function Receipt() { return useReceipt(); }',
      ),
    ).toContain("frontend-view-workflow");
    expect(
      analyze(
        "src/components/receipt.tsx",
        'export { Receipt } from "../features/payments/screen";',
      ),
    ).toEqual([]);
    expect(
      analyze("src/features/payments/types.ts", 'export type { Receipt } from "./queries";'),
    ).toEqual([]);
  });

  test("models may import erased DTOs but cannot hide network or React behavior", () => {
    const file = "src/features/payments/receipt-utils.ts";
    expect(
      analyze(
        file,
        'import type { Receipt } from "./queries"; export const label = (receipt: Receipt) => receipt.id;',
      ),
    ).toEqual([]);
    expect(ids(file, 'export const load = () => fetch("/receipts");')).toContain(
      "frontend-remote-owner",
    );
    expect(
      ids(file, 'import { useState } from "react"; export const hidden = () => useState(0);'),
    ).toContain("frontend-model-purity");
  });

  test("form lifecycles use the shared foundation in workflow hooks", () => {
    const source =
      'import { useAppForm } from "@/components/ui/form"; export const useReceipt = () => useAppForm({});';
    expect(analyze(workflow, source)).toEqual([]);
    expect(ids(screen, source)).toContain("frontend-form-owner");
    expect(ids(workflow, 'import { useForm } from "react-hook-form"; useForm();')).toContain(
      "frontend-form-owner",
    );
  });

  test("tiny local UI state is allowed, controlled form state is not", () => {
    expect(
      analyze(
        view,
        'import { useState } from "react"; export function TabsView() { const [tab, setTab] = useState("preview"); return <Tabs value={tab} onValueChange={setTab} />; }',
      ),
    ).toEqual([]);
    expect(
      analyze(
        view,
        'import { useState } from "react"; export function Choices() { const [selected, setSelected] = useState(false); return <input type="checkbox" checked={selected} onChange={() => setSelected(!selected)} />; }',
      ),
    ).toEqual([]);
    expect(
      analyze(
        view,
        'import { useState } from "react"; export function Preview() { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(!open)} aria-expanded={open}>Preview</button>; }',
      ),
    ).toEqual([]);
    expect(
      ids(
        view,
        'import { useState } from "react"; export function Amount() { const [amount, setAmount] = useState(""); return <input value={amount} onChange={event => setAmount(event.target.value)} />; }',
      ),
    ).toContain("frontend-form-owner");
  });

  test("preserves explicit Next server reads and TanStack loader reads", () => {
    expect(
      analyze(
        "src/app/billing/page.tsx",
        'export default async function Page() { const response = await fetch("https://example.test"); return <p>{response.status}</p>; }',
      ),
    ).toEqual([]);
    expect(
      analyze(
        "src/routes/billing.tsx",
        'const route = createFileRoute("/billing")({ loader: async () => fetch("https://example.test"), component: Page }); function Page() { return <div />; }',
      ),
    ).toEqual([]);
    expect(
      ids(
        "src/app/billing/page.tsx",
        '"use client"; export default async function Page() { return fetch("/api/billing"); }',
      ),
    ).toContain("frontend-remote-owner");
  });
});

describe("state ownership and workflow budgets", () => {
  test.each([
    "const data = useReceipts(); const [copy] = useState(data);",
    "const query = useReceipts(); const [copy] = useState(query.data);",
    "const { data: receipts } = useReceipts(); const alias = receipts; const [copy] = useState(() => alias);",
    "const query = useReceipts(); const [copy] = useState(() => { return query.data; });",
  ])("detects remote-state copies through aliases and lazy initializers", (body) => {
    expect(
      ids(
        workflow,
        `import { useState } from "react"; import { useReceipts } from "./queries"; export function useReceipt() { ${body} }`,
      ),
    ).toContain("frontend-server-state-copy");
  });

  test("selection scalar state and owner resets remain allowed", () => {
    expect(
      analyze(
        workflow,
        'import { useState, useEffect } from "react"; import { useReceipts } from "./queries"; export function useReceipt(owner: string) { const query = useReceipts(); const [selectedId, setSelectedId] = useState(query.data.id); useEffect(() => { setSelectedId(null); }, [owner]); return { selectedId }; }',
      ),
    ).toEqual([]);
  });

  test("deriving state in an effect is rejected while focus effects remain valid", () => {
    expect(
      ids(
        workflow,
        'import { useState, useEffect } from "react"; export function useReceipt(first: string, last: string) { const [name, setName] = useState(""); useEffect(() => { setName(first + last); }, [first, last]); return { name }; }',
      ),
    ).toContain("frontend-derived-effect-state");
    expect(
      analyze(
        view,
        'import { useRef, useEffect } from "react"; export function Focus() { const ref = useRef<HTMLInputElement>(null); useEffect(() => { ref.current?.focus(); }, []); return <input ref={ref} />; }',
      ),
    ).toEqual([]);
  });

  test("counts code lines without comments and only explicit fields of workflow returns", () => {
    const comments = Array.from({ length: 210 }, (_, index) => `// documentation ${index}`).join(
      "\n",
    );
    expect(
      analyze(workflow, `${comments}\nexport function useReceipt() { return { a: 1 }; }`),
    ).toEqual([]);
    const fields = Array.from({ length: 21 }, (_, index) => `field${index}: ${index}`).join(",");
    expect(ids(workflow, `export function useReceipt() { return { ${fields} }; }`)).toContain(
      "frontend-workflow-budget",
    );
    const lines = Array.from({ length: 201 }, (_, index) => `const value${index} = ${index};`).join(
      "\n",
    );
    expect(ids(workflow, lines)).toContain("frontend-workflow-budget");
    expect(
      analyze(
        workflow,
        "export function useReceipt() { return { ...first, ...second, ...third, ...fourth }; }",
      ),
    ).toEqual([]);
  });
});
