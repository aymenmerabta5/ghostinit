import { describe, expect, test } from "bun:test";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

describe("PDF UI event completion", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const target of ["web", "mobile", "desktop"] as const) {
      test(`${framework}/${target} coalesces repeated clicks, presents rejection and permits retry`, async () => {
        const output = generatedUiOutput(framework);
        const root =
          target === "web"
            ? output.root
            : target === "mobile"
              ? "apps/mobile"
              : "apps/desktop/src/renderer";
        const path =
          target === "web"
            ? `${root}/${framework === "nextjs" ? "app/pdf/page.tsx" : "routes/pdf.tsx"}`
            : target === "mobile"
              ? `${root}/app/pdf.tsx`
              : `${root}/routes/pdf.tsx`;
        const component =
          target === "web" ? "PdfWorkspace" : target === "mobile" ? "PdfScreen" : "PdfPage";
        const first = deferred<string>();
        const second = deferred<string>();
        const queue = [first, second];
        let calls = 0;
        const state = { loading: false, error: null as string | null };
        const generate = async () => {
          calls += 1;
          state.loading = true;
          state.error = null;
          const next = queue.shift();
          if (!next) throw new Error("Duplicate PDF request");
          try {
            return await next.promise;
          } catch (cause) {
            state.error = "PDF generation failed";
            throw cause;
          } finally {
            state.loading = false;
          }
        };
        const route = output.read(path);
        const clientPage = route.match(/import GhostinitPageContent from "\.\/([^"]+)"/);
        const source = clientPage
          ? output.read(`${path.slice(0, path.lastIndexOf("/"))}/${clientPage[1]}.tsx`)
          : route;
        const ui = generatedFormHarness(source, [component], {
          usePdf: () => ({ ...state, generate }),
          usePdfMobile: () => ({ ...state, generateAndShare: generate }),
          generatePdfDesktop: generate,
          downloadPdfBase64() {},
          useSurfaceLocale: () => "en",
          useTranslations: () => (key: string) => key,
          usePlatformI18n: () => ({ locale: "en" }),
          createFileRoute: () => (options: unknown) => options,
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
        });
        const render = () => ui.render(component);
        const click = (tree: unknown) => {
          const button = elements(tree).find(
            (node) =>
              node.type === "Button" && /generateDownload|generateShare/.test(textContent(node)),
          );
          if (!button) throw new Error("Missing PDF action");
          (button.props[target === "mobile" ? "onPress" : "onClick"] as () => void)();
        };
        const initial = render();
        click(initial);
        click(initial);
        expect(calls).toBe(1);
        expect(
          elements(render()).some((node) => node.type === "Button" && node.props.disabled === true),
        ).toBe(true);
        first.reject(new Error("Renderer unavailable"));
        await flush();
        expect(textContent(render())).toContain("generationError");
        click(render());
        expect(calls).toBe(2);
        second.resolve("PDF bytes");
        await flush();
        expect(textContent(render())).not.toContain("generationError");
      });
    }
  }
});
