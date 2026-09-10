import { describe, expect, test } from "bun:test";
import { deferred, elements, flush, textContent } from "../helpers/generated-form-harness.js";
import { pdfUiHarness } from "../helpers/pdf-ui-harness.js";

function successResponse() {
  return Response.json({ pdfBase64: btoa("PDF bytes"), fileName: "invoice.pdf" });
}

describe("PDF UI event completion", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const target of ["web", "mobile", "desktop"] as const) {
      const click = (tree: unknown) => {
        const button = elements(tree).find(
          (node) =>
            node.type === "Button" && /generateDownload|generateShare/.test(textContent(node)),
        );
        if (!button) throw new Error("Missing PDF action");
        (button.props[target === "mobile" ? "onPress" : "onClick"] as () => void)();
      };

      test(`${framework}/${target} coalesces repeated clicks, presents rejection and permits retry`, async () => {
        const first = deferred<Response>();
        const second = deferred<Response>();
        const queue = [first, second];
        const calls: Array<{ url: string; options: RequestInit }> = [];
        const ui = pdfUiHarness(framework, target, (url, options) => {
          calls.push({ url, options });
          const next = queue.shift();
          if (!next) throw new Error("Duplicate PDF request");
          return next.promise;
        });
        const initial = ui.render();
        click(initial);
        click(initial);
        await flush();
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe("https://pdf.example.test/api/pdf");
        expect(calls[0]?.options.credentials).toBe("include");
        expect(JSON.parse(String(calls[0]?.options.body))).toMatchObject({
          template: "invoice",
          locale: "en",
          fileName: "invoice.pdf",
        });
        expect(
          elements(ui.render()).some(
            (node) => node.type === "Button" && node.props.disabled === true,
          ),
        ).toBe(true);
        first.reject(new Error("Renderer unavailable"));
        await flush();
        expect(textContent(ui.render())).toContain("generationError");
        expect(ui.downloads).toEqual([]);
        click(ui.render());
        await flush();
        expect(calls).toHaveLength(2);
        second.resolve(successResponse());
        await flush();
        expect(textContent(ui.render())).not.toContain("generationError");
        expect(ui.downloads).toEqual([target === "mobile" ? "cache:/invoice.pdf" : "invoice.pdf"]);
        expect(ui.revoked).toEqual(target === "mobile" ? [] : ["blob:pdf-preview"]);
        ui.unmount();
      });

      test(`${framework}/${target} discards a completed PDF after the authenticated owner changes`, async () => {
        const pending = deferred<Response>();
        const ui = pdfUiHarness(framework, target, () => pending.promise);
        click(ui.render());
        await flush();
        ui.changeOwner();
        pending.resolve(successResponse());
        await flush();
        expect(ui.downloads).toEqual([]);
        expect(ui.files).toEqual([]);
        expect(textContent(ui.render())).not.toContain("generationError");
        ui.unmount();
      });
    }
  }
});
