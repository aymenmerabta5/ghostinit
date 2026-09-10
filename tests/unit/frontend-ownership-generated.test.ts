import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { analyzeProjectReport } from "../../src/lib/architecture/analyzer.js";
import { analyzeFrontendProject } from "../../src/lib/architecture/frontend/runner.js";
import {
  FRONTEND_OWNERSHIP_RUNTIME,
  FRONTEND_OWNERSHIP_RUNTIME_SHA256,
} from "../../src/generation/embedded-frontend-runtime.js";
import { frontendOwnershipLintFiles } from "../../src/templates/tooling/frontend-lint.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(sources: Record<string, string>): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-frontend-ownership-"));
  roots.push(root);
  const transaction = new FsTransaction(root);
  await transaction.write(
    "package.json",
    JSON.stringify({ name: "fixture", private: true, dependencies: { react: "19.0.0" } }),
  );
  for (const file of frontendOwnershipLintFiles()) await transaction.write(file.path, file.content);
  for (const [path, source] of Object.entries(sources)) await transaction.write(path, source);
  await transaction.commit();
  return root;
}

async function generated(root: string, json = true) {
  const transaction = new FsTransaction(root);
  await transaction.write(
    "probe.cjs",
    `require("./scripts/lib/frontend-ownership.cjs").analyzeFrontendProject(process.cwd()).then(report => console.log(JSON.stringify(report))).catch(error => { console.error(error); process.exitCode = 1; });`,
  );
  await transaction.commit();
  const child = Bun.spawn(["node", json ? "probe.cjs" : "scripts/check-frontend-ownership.cjs"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NODE_PATH: join(process.cwd(), "node_modules") },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("canonical generated frontend checker", () => {
  test("embedded runtime has its recorded digest and no second policy implementation", () => {
    expect(createHash("sha256").update(FRONTEND_OWNERSHIP_RUNTIME).digest("hex")).toBe(
      FRONTEND_OWNERSHIP_RUNTIME_SHA256,
    );
    expect(FRONTEND_OWNERSHIP_RUNTIME).toContain("src/lib/architecture/frontend/ownership.ts");
    expect(FRONTEND_OWNERSHIP_RUNTIME).toContain(
      "src/lib/architecture/collectors/source-traversal.ts",
    );
  });

  test("host and generated Node scanner reject the same web, Expo and Electron ownership violations", async () => {
    const root = await fixture({
      "src/app/page.tsx":
        'import * as R from "react"; export default function Page() { const [value] = R["useState"](0); return <p>{value}</p>; }',
      "apps/mobile/app/index.tsx":
        'import { useEffect as effect } from "react"; export default function Page() { effect(() => {}, []); return null; }',
      "apps/desktop/src/renderer/features/payments/screen.tsx":
        'export function Screen() { return fetch("/api/payments"); }',
      "src/features/payments/model.ts": 'export const hidden = () => fetch("/api/payments");',
    });
    const host = await analyzeProjectReport(root);
    const standalone = await analyzeFrontendProject(root);
    const result = await generated(root);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { findings: unknown[]; complete: boolean };
    expect(parsed.complete).toBe(true);
    expect(parsed.findings).toEqual(standalone.findings);
    const signatures = (findings: Array<{ id: string; file: string; line?: number }>) =>
      findings
        .filter(({ id }) => id.startsWith("frontend-"))
        .map(({ id, file, line }) => `${file}:${line}:${id}`)
        .sort();
    expect(signatures(host.findings)).toEqual(signatures(standalone.findings));
    expect(new Set(standalone.findings.map(({ file }) => file)).size).toBe(4);
    const cli = await generated(root, false);
    expect(cli.exitCode).toBe(1);
    expect(cli.stderr).toContain("frontend-view-workflow");
  });

  test("the generated runner fails closed on malformed owned source", async () => {
    const root = await fixture({
      "app/index.tsx": "export default function Page( { return <p />;",
    });
    const host = await analyzeFrontendProject(root);
    const result = await generated(root, false);
    expect(host.complete).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("parse-error");
  });

  test("a symlink outside the project cannot silently disappear from source coverage", async () => {
    const outside = await fixture({
      "src/page.tsx": "export default function Page() { return null; }",
    });
    const root = await fixture({ "src/safe.tsx": "export const safe = true;" });
    symlinkSync(join(outside, "src"), join(root, "src", "external"), "junction");
    const result = await generated(root, false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/outside|traversal/i);
  });

  test("generated lint accepts typed views, semantic workflow ownership, primitives and ignored build output", async () => {
    const root = await fixture({
      "src/features/payments/screen.tsx":
        'import { usePayment } from "./use-payment"; export function Screen() { const payment = usePayment(); return <p>{payment.open}</p>; }',
      "src/features/payments/use-payment.ts":
        'import { useState } from "react"; export function usePayment() { const [open, setOpen] = useState(false); return { open, setOpen }; }',
      "src/components/ui/input.tsx":
        'import { useState } from "react"; export function Input() { const [value, change] = useState(""); return <input value={value} onChange={event => change(event.target.value)} />; }',
      "src/.next/broken.tsx": "intentionally not valid TSX",
      "src/generated.d.ts": "declare const generated: string;",
    });
    const result = await generated(root, false);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Frontend ownership check passed");
  });
});
