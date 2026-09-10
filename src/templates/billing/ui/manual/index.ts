import { file, type TemplateFile } from "../../../shared.js";
import { surfaceTranslationFiles } from "../../../i18n/surface.js";
import { manualClientContent } from "./client.js";
import { manualFormContent } from "./form.js";
import { manualFieldsContent } from "./fields.js";
import { manualHistoryContent } from "./history.js";
import { manualHookContent } from "./hook.js";
import { manualPanelContent } from "./panel.js";
import { manualReceiptContent } from "./receipt.js";
import { manualReviewContent } from "./review.js";
import { manualReviewRowContent } from "./review-row.js";
import { manualReviewDecisionContent } from "./review-decision.js";
import { manualModelContent, manualSchemaContent, manualTypesContent } from "./model.js";
import { manualQueriesContent, manualMutationsContent } from "./data.js";
import {
  manualFormHookContent,
  manualReviewHookContent,
  manualReceiptHookContent,
} from "./workflows.js";
import {
  manualFormViewContent,
  manualReviewRowViewContent,
  manualReceiptViewContent,
} from "./views.js";

/** Receipt transport and review are their own balance workflow, never provider checkout. */
export function manualBillingUiFiles(sourceRoot: string): TemplateFile[] {
  const base = `${sourceRoot}/features/manual-payments`;
  return [
    file(`${base}/model.ts`, manualModelContent()),
    file(`${base}/schema.ts`, manualSchemaContent()),
    file(`${base}/types.ts`, manualTypesContent()),
    file(`${base}/receipt-utils.ts`, manualClientContent()),
    file(`${base}/queries.ts`, manualQueriesContent()),
    file(`${base}/mutations.ts`, manualMutationsContent()),
    file(`${base}/use-manual-payments.ts`, manualHookContent()),
    file(`${base}/use-manual-payment-form.ts`, manualFormHookContent()),
    file(`${base}/use-payment-review.ts`, manualReviewHookContent()),
    file(`${base}/use-receipt-preview.ts`, manualReceiptHookContent()),
    file(`${base}/screen.tsx`, manualPanelContent()),
    file(`${base}/payment-form.tsx`, manualFormContent()),
    file(`${base}/payment-review.tsx`, manualReviewRowContent()),
    file(`${base}/receipt-preview.tsx`, manualReceiptContent()),
    file(`${base}/components/payment-form.tsx`, manualFormViewContent()),
    file(`${base}/components/payment-fields.tsx`, manualFieldsContent()),
    file(`${base}/components/payment-history.tsx`, manualHistoryContent()),
    file(`${base}/components/review-queue.tsx`, manualReviewContent()),
    file(`${base}/components/review-row.tsx`, manualReviewRowViewContent()),
    file(`${base}/components/review-decision.tsx`, manualReviewDecisionContent()),
    file(`${base}/components/receipt-preview.tsx`, manualReceiptViewContent()),
  ];
}

/** Desktop uses its existing platform locale while sharing the owned web controls. */
export function manualDesktopUiFiles(sourceRoot: string, hasI18n: boolean): TemplateFile[] {
  const translations = surfaceTranslationFiles({
    sourceRoot,
    framework: "tanstack",
    enabled: hasI18n,
  })
    .filter(
      (entry) =>
        entry.path.endsWith("translations.ts") || entry.path.endsWith("translations.en.json"),
    )
    .map((entry) =>
      entry.path.endsWith("translations.ts") && hasI18n
        ? file(
            entry.path,
            entry.content
              .replace("useLocale as useFrameworkLocale", "usePlatformI18n")
              .replace("return useFrameworkLocale();", "return usePlatformI18n().locale;"),
          )
        : entry,
    );
  return [...manualBillingUiFiles(sourceRoot), ...translations].map((entry) =>
    sourceRoot === "src/renderer"
      ? file(
          entry.path,
          entry.content
            .replaceAll("@/lib/", "@/renderer/lib/")
            .replaceAll("@/hooks/", "@/renderer/hooks/"),
        )
      : entry,
  );
}
