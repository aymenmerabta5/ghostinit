import { describe, expect, test } from "bun:test";
import { dialogsFiles } from "../../src/templates/apps/fragments/web-ui/dialogs.js";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

const files = dialogsFiles("src");
const read = (suffix: string) => files.find(({ path }) => path.endsWith(suffix))!.content;

describe("reusable confirmation form workflows", () => {
  test("name confirmation admits only a trimmed exact match and resets after success or cancel", async () => {
    let confirmed = 0;
    let fail = false;
    const harness = generatedFormHarness(read("use-name-confirmation.ts"), ["useNameConfirmation"]);
    const workflow = harness.render("useNameConfirmation", {
      expectedName: "Project A",
      onConfirm() {
        if (fail) throw new Error("refused");
        confirmed++;
      },
    }) as { confirm(): Promise<void>; cancel(): void };
    const form = harness.forms[0]!;
    form.values.name = "Project B";
    await workflow.confirm();
    expect(confirmed).toBe(0);
    expect(form.values.name).toBe("Project B");
    form.values.name = " Project A ";
    await workflow.confirm();
    expect(confirmed).toBe(1);
    expect(form.values.name).toBe("");
    form.values.name = "Project A";
    fail = true;
    await expect(workflow.confirm()).rejects.toThrow("refused");
    expect(form.values.name).toBe("Project A");
    workflow.cancel();
    expect(form.values.name).toBe("");
  });

  test("rejection requires a reason, submits trimmed text, and preserves a draft on cancel", async () => {
    const submitted: string[] = [];
    const opened: boolean[] = [];
    const harness = generatedFormHarness(read("use-reject-reason.ts"), ["useRejectReason"]);
    const workflow = harness.render("useRejectReason", {
      onSubmit: (reason: string) => submitted.push(reason),
      onOpenChange: (open: boolean) => opened.push(open),
    }) as { submit(): Promise<void>; cancel(): void };
    const form = harness.forms[0]!;
    form.values.reason = "   ";
    await workflow.submit();
    expect(submitted).toEqual([]);
    form.values.reason = " Missing receipt ";
    workflow.cancel();
    expect(opened).toEqual([false]);
    expect(form.values.reason).toBe(" Missing receipt ");
    await workflow.submit();
    expect(submitted).toEqual(["Missing receipt"]);
    expect(form.values.reason).toBe("");
  });

  test("public dialogs retain their APIs while generated files satisfy frontend ownership", () => {
    expect(read("NameConfirmationAlertDialog.tsx")).toContain(
      "export { NameConfirmationAlertDialog }",
    );
    expect(read("RejectReasonDialog.tsx")).toContain("export { RejectReasonDialog }");
    for (const { path, content } of files) {
      const parsed = parseFile(content, path.endsWith("x") ? "tsx" : "ts");
      expect(parsed.diagnostics, path).toEqual([]);
      expect(
        analyzeFrontendFile({
          file: path,
          source: content,
          program: parsed.program,
          comments: parsed.comments,
          imports: parsed.importReferences,
        }),
        path,
      ).toEqual([]);
    }
  });
});
