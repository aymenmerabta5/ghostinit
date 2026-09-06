export function invoiceTemplateContent(): string {
  return `import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { normalizePdfLocale, pdfLocaleTag, pdfMessage, pdfRowDirection, pdfTextAlign, pdfTextDirection } from "../lib/locale";

const styles = StyleSheet.create({
  page: { fontFamily: "DejaVu Sans", fontSize: 9, padding: 32, backgroundColor: "#ffffff", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24, borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 12 },
  sender: { width: "58%", minWidth: 0, flexShrink: 1 },
  documentMeta: { width: "38%", minWidth: 0, flexShrink: 1 },
  brand: { fontFamily: "DejaVu Sans Bold", fontSize: 18, color: "#0f172a" },
  meta: { fontSize: 8, color: "#64748b", marginTop: 4 },
  title: { fontFamily: "DejaVu Sans Bold", fontSize: 22, color: "#0f172a", textTransform: "uppercase", letterSpacing: 1 },
  arabicDisplay: { fontFamily: "DejaVu Sans", letterSpacing: 0, textTransform: "none" },
  section: { marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  value: { fontFamily: "DejaVu Sans Bold", fontSize: 9 },
  tableHeader: { flexDirection: "row", backgroundColor: "#0f172a", color: "#ffffff", padding: 6, borderRadius: 4 },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  cell: { width: "52%", paddingHorizontal: 4, fontSize: 8 },
  quantityCell: { width: "10%", paddingHorizontal: 4, fontSize: 8, textAlign: "right" },
  priceCell: { width: "18%", paddingHorizontal: 4, fontSize: 8, textAlign: "right" },
  amountCell: { width: "20%", paddingHorizontal: 4, fontSize: 8, textAlign: "right" },
  totalBox: { marginTop: 12, alignItems: "flex-end" },
  totalLabel: { fontSize: 10, color: "#64748b" },
  totalValue: { fontFamily: "DejaVu Sans Bold", fontSize: 16, color: "#0f172a" },
  footer: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export interface InvoiceItem { description: string; quantity: number; unitPrice: number; }

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  dueDate?: Date | null;
  from: { name: string; email?: string; address?: string | null };
  to: { name: string; email?: string; address?: string | null };
  items: InvoiceItem[];
  currency?: string;
  notes?: string | null;
  verificationCode?: string;
  qrCodeDataUrl?: string;
}

function formatDate(d: Date, locale = "en"): string {
  return d.toLocaleDateString(pdfLocaleTag(locale), { year: "numeric", month: "long", day: "numeric" });
}
function formatMoney(amount: number, currency = "USD", locale = "en"): string {
  return new Intl.NumberFormat(pdfLocaleTag(locale), { style: "currency", currency }).format(amount);
}

export function InvoiceTemplate({ data, locale = "en" }: { data: InvoiceData; locale?: string }) {
  const resolvedLocale = normalizePdfLocale(locale);
  const message = (key: Parameters<typeof pdfMessage>[1]) => pdfMessage(resolvedLocale, key);
  const subtotal = data.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const currency = data.currency ?? "USD";
  return (
    <Document>
      <Page size="A4" style={[styles.page, { textAlign: pdfTextAlign(resolvedLocale) }]}>
        <View wrap={false} style={[styles.header, { flexDirection: pdfRowDirection(resolvedLocale) }]}>
          <View style={styles.sender}><Text style={[styles.brand, resolvedLocale === "ar" ? styles.arabicDisplay : {}]}>{data.from.name}</Text><Text style={styles.meta}>{data.from.email ?? ""}</Text><Text style={styles.meta}>{data.from.address ?? ""}</Text></View>
          <View style={[styles.documentMeta, { alignItems: resolvedLocale === "ar" ? "flex-start" : "flex-end" }]}><Text style={[styles.title, resolvedLocale === "ar" ? styles.arabicDisplay : {}]}>{message("invoice")}</Text><Text style={styles.meta}>#{data.invoiceNumber}</Text><Text style={[styles.meta, { direction: pdfTextDirection(resolvedLocale) }]}>{formatDate(data.issuedAt, resolvedLocale)}</Text></View>
        </View>
        <View wrap={false} style={{ flexDirection: pdfRowDirection(resolvedLocale), justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <View style={[styles.section, styles.sender]}><Text style={styles.label}>{message("billTo")}</Text><Text style={styles.value}>{data.to.name}</Text><Text style={styles.meta}>{data.to.email ?? ""}</Text><Text style={styles.meta}>{data.to.address ?? ""}</Text></View>
          <View style={[styles.section, styles.documentMeta, { alignItems: resolvedLocale === "ar" ? "flex-start" : "flex-end" }]}>{data.dueDate ? <><Text style={styles.label}>{message("dueDate")}</Text><Text style={[styles.value, { direction: pdfTextDirection(resolvedLocale) }]}>{formatDate(data.dueDate, resolvedLocale)}</Text></> : null}<Text style={styles.label}>{message("currency")}</Text><Text style={styles.value}>{currency}</Text></View>
        </View>
        <View fixed minPresenceAhead={24} style={[styles.tableHeader, { flexDirection: pdfRowDirection(resolvedLocale) }]}><Text style={[styles.cell, { color: "#ffffff" }]}>{message("description")}</Text><Text style={[styles.quantityCell, { color: "#ffffff" }]}>{message("quantity")}</Text><Text style={[styles.priceCell, { color: "#ffffff" }]}>{message("unit")}</Text><Text style={[styles.amountCell, { color: "#ffffff" }]}>{message("amount")}</Text></View>
        {data.items.map((it, idx) => (
          <View key={idx} wrap={false} style={[styles.tableRow, { flexDirection: pdfRowDirection(resolvedLocale) }]}><Text style={styles.cell}>{it.description}</Text><Text style={styles.quantityCell}>{it.quantity}</Text><Text style={styles.priceCell}>{formatMoney(it.unitPrice, currency, resolvedLocale)}</Text><Text style={styles.amountCell}>{formatMoney(it.quantity * it.unitPrice, currency, resolvedLocale)}</Text></View>
        ))}
        <View wrap={false} style={[styles.totalBox, { alignItems: resolvedLocale === "ar" ? "flex-start" : "flex-end" }]}><Text style={styles.totalLabel}>{message("total")}</Text><Text style={styles.totalValue}>{formatMoney(subtotal, currency, resolvedLocale)}</Text></View>
        {data.notes ? <View style={[styles.section, { marginTop: 16 }]}><Text style={styles.label}>{message("notes")}</Text><Text style={{ fontSize: 8, marginTop: 4 }}>{data.notes}</Text></View> : null}
        {data.verificationCode ? <View style={{ marginTop: 16, flexDirection: pdfRowDirection(resolvedLocale), justifyContent: "space-between", alignItems: "center" }}><View><Text style={styles.label}>{message("verification")}</Text><Text style={{ fontFamily: "DejaVu Sans Bold", fontSize: 9 }}>{data.verificationCode}</Text></View>{data.qrCodeDataUrl ? <View style={{ width: 48, height: 48 }} /> : null}</View> : null}
        <Text style={styles.footer}>{message("generatedWith")} — {data.from.name} • {message("thankYou")}</Text>
      </Page>
    </Document>
  );
}
`;
}
