import { generatedUiOutput } from "./generated-ui-output.js";
import { settingsFeatureHarness } from "./settings-feature-harness.js";

type Target = "web" | "mobile" | "desktop";

/** Runs the emitted PDF screen, view, form workflow, mutation adapter and transport helper. */
export function pdfUiHarness(
  framework: "nextjs" | "tanstack-start",
  target: Target,
  request: (input: string, options: RequestInit) => Promise<Response>,
) {
  const output = generatedUiOutput(framework);
  const root =
    target === "web"
      ? output.root
      : target === "mobile"
        ? "apps/mobile/src"
        : "apps/desktop/src/renderer";
  const featureRoot = `${root}/features/pdf`;
  const clientPath =
    target === "web"
      ? "packages/pdf/src/client/usePdf.ts"
      : target === "mobile"
        ? `${root}/hooks/usePdf.ts`
        : "apps/desktop/src/lib/pdf.ts";
  const screenPath = target === "web" ? "pdf-workspace.tsx" : "page.tsx";
  const downloads: string[] = [];
  const files: string[] = [];
  const revoked: string[] = [];
  const source = [
    clientPath,
    `${featureRoot}/sample-data.ts`,
    `${featureRoot}/mutations.ts`,
    `${featureRoot}/use-pdf-workspace.ts`,
    `${featureRoot}/components/pdf-workspace-view.tsx`,
    `${featureRoot}/${screenPath}`,
  ]
    .map((path) => output.read(path))
    .join("\n");
  const ui = settingsFeatureHarness(
    source +
      "\nfunction renderPdfWorkspace() { const view = PdfWorkspace(); return PdfWorkspaceView(view.props); }",
    ["renderPdfWorkspace"],
    {
      fetch: request,
      desktopBridgeFetch: request,
      window: {
        location: { origin: "https://pdf.example.test" },
        desktopBridge: { apiUrl: "https://pdf.example.test" },
      },
      URL: class extends URL {
        static override createObjectURL() {
          return "blob:pdf-preview";
        }
        static override revokeObjectURL(value: string) {
          revoked.push(value);
        }
      },
      document: {
        createElement: () => ({
          href: "",
          download: "",
          click() {
            downloads.push(this.download);
          },
          remove() {},
        }),
        body: { appendChild() {} },
      },
      File: class {
        readonly uri: string;
        constructor(_cache: string, name: string) {
          this.uri = `cache:/${name}`;
        }
        write() {
          files.push(this.uri);
        }
      },
      Paths: { cache: "cache:/" },
      Sharing: {
        isAvailableAsync: async () => true,
        shareAsync: async (uri: string) => {
          downloads.push(uri);
        },
      },
      Platform: { OS: "android" },
      authClient: { getCookie: async () => "session=test" },
      env: { EXPO_PUBLIC_API_URL: "https://pdf.example.test" },
      useSurfaceLocale: () => "en",
      useTranslations: () => (key: string) => key,
      usePlatformI18n: () => ({ locale: "en" }),
      Select: "Select",
      SelectContent: "SelectContent",
      SelectGroup: "SelectGroup",
      SelectItem: "SelectItem",
      SelectTrigger: "SelectTrigger",
      SelectValue: "SelectValue",
      Field: "Field",
      FieldLabel: "FieldLabel",
      Text: "Text",
      ScrollView: "ScrollView",
      View: "View",
      Link: "Link",
    },
  );
  return { ...ui, downloads, files, revoked, render: () => ui.render("renderPdfWorkspace") };
}
