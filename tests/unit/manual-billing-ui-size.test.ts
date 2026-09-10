import { expect, test } from "bun:test";
import { manualBillingUiFiles } from "../../src/templates/billing/ui/manual/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";

test("formatted manual payment controllers and presenters satisfy the generated feature size policy", () => {
  const files = manualBillingUiFiles("apps/web/src");
  for (const file of files) {
    const formatted = Bun.spawnSync(
      [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", file.path],
      {
        stdin: Buffer.from(file.content),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(formatted.exitCode, new TextDecoder().decode(formatted.stderr)).toBe(0);
    const code = new TextDecoder().decode(formatted.stdout);
    const lines = code.split(/\r?\n/).length;
    if (file.path.endsWith(".tsx"))
      expect(
        lines,
        `${file.path} has ${lines} formatted lines (standalone limit 150)`,
      ).toBeLessThanOrEqual(150);
    const parsed = parseFile(code, file.path.endsWith("x") ? "tsx" : "ts");
    expect(parsed.diagnostics).toEqual([]);
    expect(
      analyzeFrontendFile({
        file: file.path,
        source: code,
        program: parsed.program,
        comments: parsed.comments,
        imports: parsed.importReferences,
      }),
      file.path,
    ).toEqual([]);
  }
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const form = byPath.get("apps/web/src/features/manual-payments/use-manual-payment-form.ts") ?? "";
  const row = byPath.get("apps/web/src/features/manual-payments/use-payment-review.ts") ?? "";
  const fields =
    byPath.get("apps/web/src/features/manual-payments/components/payment-fields.tsx") ?? "";
  const decision =
    byPath.get("apps/web/src/features/manual-payments/components/review-decision.tsx") ?? "";
  expect(form).toContain("busy.current");
  expect(form).toContain("mutation.submit");
  expect(row).toContain("busy.current");
  expect(row).toContain("mutation.review");
  const mutations = byPath.get("apps/web/src/features/manual-payments/mutations.ts") ?? "";
  expect(mutations).toContain("orpcClient.billing.manual.submit");
  expect(mutations).toContain("orpcClient.billing.manual.review");
  for (const presenter of [fields, decision]) {
    expect(presenter).not.toContain("manualBillingClient");
    expect(presenter).not.toContain("useAuthOwnedEffect");
  }
});
