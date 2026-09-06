import { describe, expect, test } from "bun:test";
import { renderContent } from "../../src/templates/pdf/lib/render.js";
import {
  layoutNodes,
  layoutText,
  pdfLayoutFixture,
  type PdfLayoutNode,
} from "../helpers/pdf-layout-fixture.js";

function glyphs(node: PdfLayoutNode) {
  return (node.lines ?? []).flatMap((line) => line.runs.flatMap((run) => run.glyphs));
}
const codePoints = (value: string) =>
  Array.from(value, (letter) => letter.codePointAt(0)!).sort((a, b) => a - b);

describe("PDF output regressions", () => {
  test("font refresh and rendering form one bounded critical section across module copies", async () => {
    const events: string[] = [];
    const pending: Array<{ resolve(value: Buffer): void; reject(error: Error): void }> = [];
    const fontStore = {};
    const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
      renderContent()
        .replace(/^import[^;]+;\s*/gm, "")
        .replace(/^export /gm, ""),
    );
    const load = () =>
      new Function(
        "Font",
        "renderToBuffer",
        "preparePdfFonts",
        javascript + "\nreturn renderPdfToBuffer;",
      )(
        fontStore,
        (element: string) => {
          events.push("render:" + element);
          return new Promise<Buffer>((resolve, reject) => {
            pending.push({ resolve, reject });
          });
        },
        () => {
          events.push("refresh");
        },
      ) as (element: string) => Promise<Buffer>;
    const firstCopy = load(),
      secondCopy = load();
    const first = firstCopy("first");
    const second = secondCopy("second");
    await expect(firstCopy("excess")).rejects.toMatchObject({ name: "PdfRenderBusyError" });
    expect(events).toEqual(["refresh", "render:first"]);
    const rejected = first.catch((error: unknown) => error);
    pending[0]!.reject(new Error("failed renderer"));
    expect(await rejected).toMatchObject({ message: "failed renderer" });
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
    expect(events).toEqual(["refresh", "render:first", "refresh", "render:second"]);
    pending[1]!.resolve(Buffer.from("second"));
    expect((await second).toString()).toBe("second");
    const recovered = firstCopy("recovered");
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
    pending[2]!.resolve(Buffer.from("recovered"));
    expect((await recovered).toString()).toBe("recovered");
  });

  test("Arabic certificates retain all glyphs after sequential and concurrent Arabic invoices", async () => {
    const fixture = await pdfLayoutFixture();
    try {
      const invoice = {
        ...fixture.examples.invoice,
        from: { name: "شركة الأفق للتقنية" },
        to: { name: "مؤسسة النور" },
      };
      const certificate = {
        ...fixture.examples.certificate,
        recipientName: "محمد عبد الرحمن",
        issuerName: "أكاديمية الأفق",
        reason: "أتم بنجاح الدورة المتقدمة",
        verificationCode: "CERT-VERIFY-2026-0001",
      };
      const checkCertificate = (layout: PdfLayoutNode) => {
        const title = layoutNodes(layout).find(
          (node) => node.type === "TEXT" && layoutText(node) === "شهادة",
        );
        expect(title).toBeDefined();
        expect(
          glyphs(title!)
            .map((glyph) => glyph.id)
            .every((id) => id > 0),
        ).toBe(true);
        expect(
          glyphs(title!)
            .flatMap((glyph) => glyph.codePoints)
            .sort((a, b) => a - b),
        ).toEqual(codePoints("شهادة"));
        expect(layoutText(layout)).toContain("CERT-VERIFY-2026-0001");
      };
      await fixture.render("invoice", invoice, "ar");
      checkCertificate((await fixture.render("certificate", certificate, "ar")).layout);
      const [, concurrent] = await Promise.all([
        fixture.render("invoice", invoice, "ar"),
        fixture.render("certificate", certificate, "ar"),
      ]);
      checkCertificate(concurrent.layout);
      const overridden = await fixture.render("certificate", certificate, "en", {
        verificationCode: "EXPLICIT-CODE",
      });
      expect(layoutText(overridden.layout)).toContain("EXPLICIT-CODE");
      expect(layoutText(overridden.layout)).not.toContain("CERT-VERIFY-2026-0001");
    } finally {
      fixture.close();
    }
  });

  test("long invoices keep each row together and repeat column headers on every item page", async () => {
    const fixture = await pdfLayoutFixture();
    try {
      const items = Array.from({ length: 45 }, (_, index) => ({
        description:
          `Item ${index + 1}: ` +
          "Implementation and complete requirements documentation ".repeat((index % 4) + 1),
        quantity: (index % 3) + 1,
        unitPrice: 1234.56 + index * 20,
      }));
      const data = {
        ...fixture.examples.invoice,
        from: {
          name: "North Atlantic International Software Engineering and Enterprise Digital Transformation Consulting Company",
        },
        items,
      };
      const { layout } = await fixture.render("invoice", data);
      const pages = layout.children ?? [];
      expect(pages.length).toBeGreaterThan(1);
      const itemNumbers: number[] = [];
      for (const page of pages) {
        const rows = (page.children ?? []).filter(
          (node) =>
            node.type === "VIEW" &&
            node.style?.borderBottomWidth === 1 &&
            node.children?.length === 4,
        );
        if (!rows.length) continue;
        const headers = (page.children ?? []).filter(
          (node) => node.type === "VIEW" && layoutText(node).startsWith("Description"),
        );
        expect(headers).toHaveLength(1);
        for (const row of rows) {
          const cells = row.children!;
          for (const cell of cells) expect((cell.lines ?? []).length).toBeGreaterThan(0);
          const renderedDescription = cells[0]!.lines!.map((line) => line.string).join(" ");
          const itemNumber = /^Item (\d+):/.exec(renderedDescription)?.[1];
          expect(itemNumber).toBeDefined();
          itemNumbers.push(Number(itemNumber));
          expect(row.box!.top).toBeGreaterThanOrEqual(
            headers[0]!.box!.top + headers[0]!.box!.height - 0.1,
          );
          expect(row.box!.top + row.box!.height).toBeLessThanOrEqual(page.box!.height - 31.9);
        }
      }
      expect(itemNumbers).toEqual(Array.from({ length: 45 }, (_, index) => index + 1));
      const header = pages[0]!.children!.find((node) => node.style?.borderBottomWidth === 2)!;
      const [sender, meta] = header.children!;
      expect(sender!.box!.left + sender!.box!.width).toBeLessThanOrEqual(meta!.box!.left);
      expect(meta!.box!.left + meta!.box!.width).toBeLessThanOrEqual(header.box!.width + 0.1);
    } finally {
      fixture.close();
    }
  });

  test("Arabic agreement titles and dates render with complete supported glyphs", async () => {
    const fixture = await pdfLayoutFixture();
    try {
      const title = "اتفاقية تقديم الخدمات";
      const { layout } = await fixture.render(
        "agreement",
        { ...fixture.examples.agreement, title, subtitle: "شركة الأفق للتقنية" },
        "ar",
      );
      const heading = layoutNodes(layout).find(
        (node) => node.type === "TEXT" && layoutText(node) === title,
      )!;
      expect(heading.style?.fontFamily).toBe("DejaVu Sans");
      expect(glyphs(heading).every((glyph) => glyph.id > 0)).toBe(true);
      expect(
        glyphs(heading)
          .flatMap((glyph) => glyph.codePoints)
          .sort((a, b) => a - b),
      ).toEqual(codePoints(title));
      const dateValues = layoutNodes(layout).filter(
        (node) => node.type === "TEXT" && node.style?.fontSize === 11,
      );
      expect(dateValues).toHaveLength(2);
      for (const date of dateValues) {
        expect(date.style?.fontFamily).toBe("DejaVu Sans");
        expect(glyphs(date).every((glyph) => glyph.id > 0)).toBe(true);
      }
    } finally {
      fixture.close();
    }
  });

  test("Arabic date paragraphs preserve day-month-year reading order", async () => {
    const fixture = await pdfLayoutFixture();
    try {
      const date = new Date("2026-09-05T12:00:00Z");
      for (const template of ["invoice", "certificate", "agreement"]) {
        const data = {
          ...fixture.examples[template],
          issuedAt: date,
          dueDate: date,
          validUntil: date,
          effectiveDate: date,
          expiryDate: date,
        };
        const { layout } = await fixture.render(template, data, "ar");
        const dates = layoutNodes(layout).filter(
          (node) => node.type === "TEXT" && layoutText(node) === "5 سبتمبر 2026",
        );
        expect(dates.length, template).toBeGreaterThan(0);
        for (const node of dates) {
          expect(node.style?.direction, template).toBe("rtl");
          expect(node.lines?.map((line) => line.string).join(""), template).toBe("2026 ربمتبس 5");
        }
      }
    } finally {
      fixture.close();
    }
  });
});
