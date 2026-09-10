import { describe, expect, test } from "bun:test";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";
import { requestOwnedSnapshotContent } from "../../src/templates/apps/fragments/request-owned-snapshot.js";

function analyze(
  source: string,
  file = "src/features/receipts/use-preview.ts",
  platform: "expo" | "web" = "web",
) {
  const parsed = parseFile(source, file.endsWith("x") ? "tsx" : "ts");
  expect(parsed.diagnostics).toEqual([]);
  return analyzeFrontendFile({
    file,
    source,
    program: parsed.program,
    comments: parsed.comments,
    platform,
  });
}

describe("frontend ownership resource and native boundaries", () => {
  test("the exact SSR snapshot guard remains infrastructure without a filename-family bypass", () => {
    const source = requestOwnedSnapshotContent();
    expect(analyze(source, "src/components/request-owned-snapshot.tsx")).toEqual([]);
    expect(
      analyze(source, "src/components/request-owned-snapshot-other.tsx").map(({ id }) => id),
    ).toContain("frontend-remote-owner");
    expect(
      analyze(source, "src/renderer/components/request-owned-snapshot.tsx").map(({ id }) => id),
    ).toContain("frontend-remote-owner");
  });
  test("standalone AST callers cannot omit import ownership", () => {
    expect(
      analyze(
        'import { useQuery } from "@tanstack/react-query"; useQuery({});',
        "src/features/receipts/screen.tsx",
      ).map(({ id }) => id),
    ).toContain("frontend-remote-owner");
  });

  test("browser object URL handles may own state while their query metadata derives during render", () => {
    const source =
      'import { useState, useEffect } from "react"; import { useReceipt } from "./queries"; export function usePreview() { const query = useReceipt(); const [url, setUrl] = useState<string | null>(null); useEffect(() => { if (!query.data) return; const allocated = URL.createObjectURL(query.data.blob); setUrl(allocated); return () => URL.revokeObjectURL(allocated); }, [query.data]); return { url, name: query.data?.name }; }';
    expect(analyze(source)).toEqual([]);
    const shadow = source.replace(
      "export function usePreview()",
      "const URL = { createObjectURL: (data: string) => data, revokeObjectURL: () => {} }; export function usePreview()",
    );
    expect(analyze(shadow).map(({ id }) => id)).toContain("frontend-derived-effect-state");
  });

  test.each([
    "new FileReader();",
    "new window.FileReader();",
    'new globalThis["FileReader"]();',
    "const { FileReader: Reader } = self; new Reader();",
    "const browser = globalThis; const Reader = browser.FileReader; new Reader();",
    "const Reader = FileReader; new Reader();",
    "const { FileReader } = globalThis; new FileReader();",
    "FileReader.call(null);",
    "const Reader = FileReader.bind(null); new Reader();",
  ])("keeps resolved browser file reads outside pure models and presentation: %s", (source) => {
    for (const root of ["src", "apps/web/src", "apps/desktop/src/renderer", "apps/mobile/src"]) {
      expect(
        analyze(source, root + "/features/receipts/receipt-utils.ts").map(({ id }) => id),
      ).toContain("frontend-model-purity");
      for (const path of [
        "/features/receipts/screen.tsx",
        "/features/receipts/components/receipt.tsx",
      ]) {
        expect(analyze(source, root + path).map(({ id }) => id)).toContain(
          "frontend-view-workflow",
        );
      }
    }
    expect(analyze(source, "src/app/billing/page.tsx").map(({ id }) => id)).toContain(
      "frontend-view-workflow",
    );
  });

  test.each([
    "function local(FileReader: new () => unknown) { return new FileReader(); }",
    "class FileReader {}; new FileReader();",
    "{ const FileReader = class {}; new FileReader(); }",
    'import { FileReader } from "./local-reader"; new FileReader();',
    "function local(window: { FileReader: new () => unknown }) { return new window.FileReader(); }",
    "const globalThis = { FileReader: class {} }; new globalThis.FileReader();",
    "type BrowserReader = FileReader; export interface ReaderProps { reader: BrowserReader }",
    "const readerName = FileReader.name;",
    'export const decode = (encoded: string) => new Blob([atob(encoded)], { type: "application/pdf" });',
  ])(
    "preserves FileReader shadowing, erased types, and deterministic conversions: %s",
    (source) => {
      expect(analyze(source, "src/features/receipts/receipt-utils.ts")).toEqual([]);
    },
  );

  test("browser file reads remain valid in existing adapters and resource workflows", () => {
    for (const root of ["src", "apps/web/src", "apps/desktop/src/renderer", "apps/mobile/src"]) {
      for (const file of ["queries.ts", "mutations.ts", "use-receipt.ts"]) {
        expect(
          analyze(
            "export function read() { return new FileReader(); }",
            root + "/features/receipts/" + file,
          ),
        ).toEqual([]);
      }
    }
  });

  test("only Expo workflow context permits its native TanStack form hook", () => {
    const source =
      'import { useForm as createForm } from "@tanstack/react-form"; export function usePayment() { return createForm({}); }';
    expect(analyze(source, undefined, "expo")).toEqual([]);
    expect(analyze(source).map(({ id }) => id)).toContain("frontend-form-owner");
    expect(
      analyze(source, "src/features/receipts/screen.tsx", "expo").map(({ id }) => id),
    ).toContain("frontend-form-owner");
  });

  test("callable raw-hook aliases and runtime client reexports remain owned", () => {
    expect(
      analyze(
        'import React = require("react"); React.useState(0);',
        "src/features/receipts/screen.tsx",
      ).map(({ id }) => id),
    ).toContain("frontend-view-workflow");
    expect(
      analyze(
        'import * as React from "react"; const invoke = React.useState.bind(null); invoke(0);',
        "src/features/receipts/screen.tsx",
      ).map(({ id }) => id),
    ).toContain("frontend-view-workflow");
    expect(
      analyze('export { useReceipt } from "./queries";', "src/features/receipts/model.ts").map(
        ({ id }) => id,
      ),
    ).toContain("frontend-model-purity");
    expect(
      analyze('export type { Receipt } from "./queries";', "src/features/receipts/model.ts"),
    ).toEqual([]);
  });
  test("comments before a client directive do not grant the server route read exception", () => {
    expect(
      analyze(
        '// client module\n"use client"; export default async function Page() { return fetch("/private"); }',
        "src/app/page.tsx",
      ).map(({ id }) => id),
    ).toContain("frontend-remote-owner");
  });
});
