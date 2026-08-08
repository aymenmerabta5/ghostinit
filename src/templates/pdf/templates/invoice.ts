export function invoiceTemplateContent(): string {
  return `import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import * as path from "node:path";

const fontsDir = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
try {
  Font.register({ family: "DejaVu Sans", src: path.join(fontsDir, "DejaVuSans.ttf") });
  Font.register({ family: "DejaVu Sans Bold", src: path.join(fontsDir, "DejaVuSans-Bold.ttf") });
} catch {}

const styles = StyleSheet.create({
  page: { fontFamily: "DejaVu Sans", fontSize: 9, padding: 32, backgroundColor: "#ffffff", color: "#1e293b" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 12 },
  brand: { fontFamily: "DejaVu Sans Bold", fontSize: 18, color: "#0f172a" },
  meta: { fontSize: 8, color: "#64748b", marginTop: 4 },
  title: { fontFamily: "DejaVu Sans Bold", fontSize: 22, color: "#0f172a", textTransform: "uppercase", letterSpacing: 1 },
  section: { marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  value: { fontFamily: "DejaVu Sans Bold", fontSize: 9 },
  tableHeader: { flexDirection: "row", backgroundColor: "#0f172a", color: "#ffffff", padding: 6, borderRadius: 4 },
  tableRow: { flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  cell: { flex: 1, fontSize: 8 },
  cellRight: { flex: 1, fontSize: 8, textAlign: "right" },
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
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
}
function formatMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function InvoiceTemplate({ data, locale = "en" }: { data: InvoiceData; locale?: string }) {
  const subtotal = data.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const currency = data.currency ?? "USD";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View><Text style={styles.brand}>{data.from.name}</Text><Text style={styles.meta}>{data.from.email ?? ""}</Text><Text style={styles.meta}>{data.from.address ?? ""}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text style={styles.title}>Invoice</Text><Text style={styles.meta}>#{data.invoiceNumber}</Text><Text style={styles.meta}>{formatDate(data.issuedAt, locale)}</Text></View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          <View style={styles.section}><Text style={styles.label}>Bill To</Text><Text style={styles.value}>{data.to.name}</Text><Text style={styles.meta}>{data.to.email ?? ""}</Text><Text style={styles.meta}>{data.to.address ?? ""}</Text></View>
          <View style={[styles.section, { alignItems: "flex-end" }]}>{data.dueDate ? <><Text style={styles.label}>Due Date</Text><Text style={styles.value}>{formatDate(data.dueDate, locale)}</Text></> : null}<Text style={styles.label}>Currency</Text><Text style={styles.value}>{currency}</Text></View>
        </View>
        <View style={styles.tableHeader}><Text style={[styles.cell, { color: "#ffffff" }]}>Description</Text><Text style={[styles.cellRight, { color: "#ffffff" }]}>Qty</Text><Text style={[styles.cellRight, { color: "#ffffff" }]}>Unit</Text><Text style={[styles.cellRight, { color: "#ffffff" }]}>Amount</Text></View>
        {data.items.map((it, idx) => (
          <View key={idx} style={styles.tableRow}><Text style={styles.cell}>{it.description}</Text><Text style={styles.cellRight}>{it.quantity}</Text><Text style={styles.cellRight}>{formatMoney(it.unitPrice, currency)}</Text><Text style={styles.cellRight}>{formatMoney(it.quantity * it.unitPrice, currency)}</Text></View>
        ))}
        <View style={styles.totalBox}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatMoney(subtotal, currency)}</Text></View>
        {data.notes ? <View style={[styles.section, { marginTop: 16 }]}><Text style={styles.label}>Notes</Text><Text style={{ fontSize: 8, marginTop: 4 }}>{data.notes}</Text></View> : null}
        {data.verificationCode ? <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><View><Text style={styles.label}>Verification</Text><Text style={{ fontFamily: "DejaVu Sans Bold", fontSize: 9 }}>{data.verificationCode}</Text></View>{data.qrCodeDataUrl ? <View style={{ width: 48, height: 48 }} /> : null}</View> : null}
        <Text style={styles.footer}>Generated with GhostInit PDF — {data.from.name} • Thank you for your business</Text>
      </Page>
    </Document>
  );
}
`;
}
