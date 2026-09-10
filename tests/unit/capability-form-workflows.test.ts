import { describe, expect, test } from "bun:test";
import { capabilityClientFiles } from "../../src/templates/apps/capability-clients/index.js";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { pdfFeatureSupportFiles } from "../../src/templates/pdf/surface-features.js";
import { flush, generatedFormHarness } from "../helpers/generated-form-harness.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";

const files = capabilityClientFiles({
  mode: "monorepo",
  framework: "nextjs",
  apps: ["web", "mobile", "desktop"],
  notifications: true,
  storage: true,
  jobs: true,
  featureFlags: true,
  i18n: false,
  requestApplication: true,
});
function invoke(model: unknown, method: string, ...args: string[]) {
  if (!model || typeof model !== "object") throw new Error("Missing workflow");
  const operation: unknown = Reflect.get(model, method);
  if (typeof operation !== "function") throw new Error(`Missing ${method}`);
  return Reflect.apply(operation, model, args);
}
function runtime(source: string, name: string, bindings: Record<string, unknown>) {
  const mutation = queryMutationHarness();
  return generatedFormHarness(`${authOwnedMutationContent()}\n${source}`, [name], {
    useQueryClient: () => ({}),
    currentQueryAuthGeneration: () => 0,
    subscribeQueryAuthGeneration: () => () => {},
    useMutation: mutation.useMutation,
    useAuthOwnedEffect: () => () => () => true,
    ...bindings,
  });
}

describe("capability workflows submit the form library's current values", () => {
  for (const target of ["web", "mobile", "desktop"] as const) {
    const root = target === "desktop" ? "apps/desktop/src/renderer" : `apps/${target}/src`;
    const read = (feature: string, hook: string) =>
      files.find((file) => file.path === `${root}/features/${feature}/${hook}.ts`)!.content;

    test(`${target} notification drafts remain in one form and submit current fields`, async () => {
      const submitted: unknown[] = [];
      const ui = runtime(
        read("notifications", "use-notification-workspace"),
        "useNotificationWorkspace",
        {
          Platform: { OS: "ios" },
          usePushNotifications: () => ({}),
          useRouter: () => ({}),
          useNavigate: () => () => {},
          useNotificationInbox: () => ({ data: [] }),
          useInvalidateNotificationInbox: () => async () => {},
          publishSelfNotification: async (input: unknown) => {
            submitted.push(input);
            return { title: "title", body: "body" };
          },
        },
      );
      const model = ui.render("useNotificationWorkspace");
      invoke(model, "setTitle", "Updated title");
      invoke(model, "setBody", "Updated body");
      invoke(model, "publish");
      await flush();
      expect(submitted).toEqual([
        { kind: "publish", title: "Updated title", body: "Updated body" },
      ]);
      expect(ui.forms).toHaveLength(1);
      expect(ui.forms[0]!.values).toEqual({ title: "Updated title", body: "Updated body" });
    });

    test(`${target} storage upload and object actions read their current form fields`, async () => {
      const submitted: unknown[] = [];
      const ui = runtime(read("storage", "use-storage-workspace"), "useStorageWorkspace", {
        uploadTextObject: async (input: unknown) => {
          submitted.push(input);
          return { id: "uploaded-object" };
        },
        downloadObjectBase64: async (id: string) => {
          submitted.push(["download", id]);
          return { base64: "" };
        },
        removeStoredObject: async (id: string) => {
          submitted.push(["remove", id]);
        },
      });
      const model = ui.render("useStorageWorkspace");
      invoke(model, "setName", "updated.txt");
      invoke(model, "setText", "updated content");
      invoke(model, "upload");
      await flush();
      invoke(model, "setObjectId", "read-this-object");
      invoke(model, "download");
      await flush();
      invoke(model, "setObjectId", "remove-this-object");
      invoke(model, "remove");
      await flush();
      expect(submitted).toEqual([
        { originalName: "updated.txt", text: "updated content" },
        ["download", "read-this-object"],
        ["remove", "remove-this-object"],
      ]);
      expect(ui.forms).toHaveLength(2);
    });

    test(`${target} job and flag lookups submit the edited identifier without awaiting a render`, async () => {
      const operations: unknown[] = [];
      const jobs = runtime(read("jobs", "use-job-workspace"), "useJobWorkspace", {
        useOwnedJobRun: () => ({
          read: async (id: string) => {
            operations.push(["lookup", id]);
          },
          accept: () => {},
        }),
        enqueueOwnedJob: async (message: string) => {
          operations.push(["enqueue", message]);
          return { run: { id: "new-run" } };
        },
        cancelOwnedJob: async (id: string) => {
          operations.push(["cancel", id]);
          return { run: { id } };
        },
      });
      const model = jobs.render("useJobWorkspace");
      invoke(model, "setMessage", "edited message");
      invoke(model, "enqueue");
      await flush();
      invoke(model, "setRunId", "lookup-run");
      invoke(model, "refresh");
      await flush();
      invoke(model, "setRunId", "cancel-run");
      invoke(model, "cancel");
      await flush();
      const flags = runtime(
        read("feature-flags", "use-feature-flag-evaluation"),
        "useFeatureFlagEvaluation",
        {
          useFeatureFlagQuery: () => ({
            evaluate: async (key: string) => {
              operations.push(["flag", key]);
            },
          }),
        },
      );
      const evaluator = flags.render("useFeatureFlagEvaluation");
      invoke(evaluator, "setKey", "edited-flag");
      invoke(evaluator, "evaluate");
      await flush();
      expect(operations).toEqual([
        ["enqueue", "edited message"],
        ["lookup", "lookup-run"],
        ["cancel", "cancel-run"],
        ["flag", "edited-flag"],
      ]);
    });

    test(`${target} PDF selection is submitted from its form`, async () => {
      const source = pdfFeatureSupportFiles("monorepo", target).find((file) =>
        file.path.endsWith("/use-pdf-workspace.ts"),
      )!.content;
      const submitted: unknown[] = [];
      const ref = { current: false };
      const operation = async (input: unknown) => {
        submitted.push(input);
      };
      const ui = runtime(source, "usePdfWorkspace", {
        useRef: () => ref,
        useSurfaceLocale: () => "en",
        samplePdfData: (template: string) => ({ template }),
        usePdfGenerator: () => ({ generate: operation, generateAndShare: operation }),
        generateAndDownloadPdf: operation,
      });
      const model = ui.render("usePdfWorkspace");
      invoke(model, "setTemplate", "certificate");
      invoke(model, "download");
      await flush();
      expect(submitted).toEqual([
        {
          template: "certificate",
          data: { template: "certificate" },
          locale: "en",
          fileName: "certificate.pdf",
        },
      ]);
      expect(ui.forms).toHaveLength(1);
    });
  }
});
