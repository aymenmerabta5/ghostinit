import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { analyzeFrontendFile } from "../../src/lib/architecture/frontend/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import {
  manualBillingUiFiles,
  manualDesktopUiFiles,
} from "../../src/templates/billing/ui/manual/index.js";
import { controlledManualFileReader } from "../helpers/manual-file-reader.js";
import { flush } from "../helpers/generated-form-harness.js";
import { settingsFeatureHarness } from "../helpers/settings-feature-harness.js";

const summary = {
  enabled: true,
  balanceMinor: 0,
  currency: "DZD",
  receiverInstructions: "Verified receiver",
  allowedMethods: ["BaridiMob"],
  canReview: false,
};
const receipt = () => new File(["proof"], "transfer.png", { type: "image/png" });

function submissionFixture(file = receipt()) {
  const reader = controlledManualFileReader(false);
  const submissions: Record<string, unknown>[] = [];
  const files = manualBillingUiFiles("src");
  const selected = [
    "model.ts",
    "receipt-utils.ts",
    "schema.ts",
    "mutations.ts",
    "use-manual-payment-form.ts",
  ];
  const source = selected
    .map((name) => {
      const file = files.find(({ path }) => path === "src/features/manual-payments/" + name);
      if (!file) throw new Error("Missing emitted manual file " + name);
      return file.content;
    })
    .join("\n");
  const keys = Object.fromEntries(
    ["summary", "list", "reviewQueue"].map((key) => [key, { key: () => [key] }]),
  );
  const h = settingsFeatureHarness(source, ["useManualPaymentForm"], {
    z,
    FileReader: reader.FileReader,
    orpc: { billing: { manual: keys } },
    orpcClient: {
      billing: {
        manual: {
          submit: async (input: Record<string, unknown>) => {
            submissions.push(input);
            return { id: "payment", status: "pending" };
          },
        },
      },
    },
    authScopedQueryKey: (_scope: unknown, key: unknown[]) => key,
  });
  h.render("useManualPaymentForm", summary);
  const form = h.forms[0]!;
  form.values.amount = "12.50";
  Reflect.set(form.values, "receipt", file);
  return { h, form, reader, submissions, file };
}

describe("manual receipt adapter ownership", () => {
  test("the generated receipt helpers remain pure and file transport belongs to the mutations adapter", () => {
    for (const files of [
      manualBillingUiFiles("src"),
      manualBillingUiFiles("apps/web/src"),
      manualDesktopUiFiles("src/renderer", false),
      manualDesktopUiFiles("apps/desktop/src/renderer", true),
    ]) {
      const selected = files.filter(
        ({ path }) => path.endsWith("/receipt-utils.ts") || path.endsWith("/mutations.ts"),
      );
      expect(selected).toHaveLength(2);
      for (const entry of selected) {
        const parsed = parseFile(entry.content, "ts");
        expect(parsed.diagnostics).toEqual([]);
        expect(
          analyzeFrontendFile({
            file: entry.path,
            source: entry.content,
            program: parsed.program,
            comments: parsed.comments,
            imports: parsed.importReferences,
          }),
        ).toEqual([]);
      }
    }
  });

  test("the emitted mutation waits for the file read and sends the same private receipt payload", async () => {
    const { h, form, reader, submissions, file } = submissionFixture();
    const pending = form.handleSubmit();
    await flush();
    expect(reader.reads).toHaveLength(1);
    expect(reader.reads[0]?.file).toBe(file);
    expect(submissions).toEqual([]);
    expect(form.resets).toBe(0);
    reader.reads[0]!.succeed();
    await pending;
    await flush();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]?.receipt).toEqual({
      base64: "cHJvb2Y=",
      mimeType: "image/png",
      originalName: "transfer.png",
    });
    expect(form.resets).toBe(1);
    expect(h.invalidations).toHaveLength(3);
  });

  for (const failure of ["read-error", "invalid-result"] as const) {
    test(failure + " never submits a receipt or resets the retryable form", async () => {
      const { h, form, reader, submissions, file } = submissionFixture();
      const pending = form.handleSubmit();
      await flush();
      expect(reader.reads).toHaveLength(1);
      if (failure === "read-error") reader.reads[0]!.fail();
      else reader.reads[0]!.succeed(new ArrayBuffer(3));
      await pending;
      await flush();
      expect(submissions).toEqual([]);
      expect(h.invalidations).toEqual([]);
      expect(form.resets).toBe(0);
      expect(form.values.amount).toBe("12.50");
      expect(Reflect.get(form.values, "receipt")).toBe(file);
      expect(h.render("useManualPaymentForm", summary)).toMatchObject({
        error: "manualSubmitFailed",
      });
    });
  }

  for (const interruption of ["owner-change", "unmount"] as const) {
    test(
      interruption + " during file reading suppresses RPC, invalidation, and stale form reset",
      async () => {
        const { h, form, reader, submissions, file } = submissionFixture();
        const pending = form.handleSubmit();
        await flush();
        expect(reader.reads).toHaveLength(1);
        if (interruption === "owner-change") h.changeOwner();
        else h.unmount();
        reader.reads[0]!.succeed();
        await pending;
        await flush();
        expect(submissions).toEqual([]);
        expect(h.invalidations).toEqual([]);
        expect(form.resets).toBe(0);
        expect(form.values.amount).toBe("12.50");
        expect(Reflect.get(form.values, "receipt")).toBe(file);
      },
    );
  }

  test("pure MIME and size validation rejects an invalid receipt before creating a reader", async () => {
    for (const file of [
      new File(["proof"], "transfer.svg", { type: "image/svg+xml" }),
      new File([], "empty.png", { type: "image/png" }),
    ]) {
      const { h, form, reader, submissions } = submissionFixture(file);
      await form.handleSubmit();
      await flush();
      expect(reader.reads).toEqual([]);
      expect(submissions).toEqual([]);
      expect(h.invalidations).toEqual([]);
      expect(form.resets).toBe(0);
      expect(Reflect.get(form.values, "receipt")).toBe(file);
    }
  });
});
