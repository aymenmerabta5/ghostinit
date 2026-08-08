export function agreementTemplateContent(): string {
  return `import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import * as path from "node:path";

const fontsDir = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
try {
  Font.register({ family: "DejaVu Sans", src: path.join(fontsDir, "DejaVuSans.ttf") });
  Font.register({ family: "DejaVu Sans Bold", src: path.join(fontsDir, "DejaVuSans-Bold.ttf") });
  Font.register({ family: "DejaVu Serif", src: path.join(fontsDir, "DejaVuSerif.ttf") });
  Font.register({ family: "DejaVu Serif Bold", src: path.join(fontsDir, "DejaVuSerif-Bold.ttf") });
} catch {}

const COLORS = { headerBg: "#0f172a", accent: "#d97706", cardBg: "#fafaf9", cardBorder: "#e7e5e4", textPrimary: "#1c1917", textMuted: "#78716c", divider: "#e7e5e4", white: "#ffffff" };

const styles = StyleSheet.create({
  page: { fontFamily: "DejaVu Sans", fontSize: 9, backgroundColor: COLORS.white, color: COLORS.textPrimary },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 36, paddingTop: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  title: { fontFamily: "DejaVu Serif Bold", fontSize: 16, color: "#0f172a", textTransform: "uppercase", letterSpacing: 1.2 },
  subtitle: { fontFamily: "DejaVu Serif", fontSize: 9, color: "#57534e", letterSpacing: 0.5 },
  body: { paddingHorizontal: 36, paddingVertical: 8 },
  partiesRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  partyCard: { flex: 1, backgroundColor: COLORS.cardBg, borderRadius: 6, padding: 8, borderLeftWidth: 4 },
  partyHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  partyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  partyTitle: { fontFamily: "DejaVu Sans Bold", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: "38%", color: COLORS.textMuted, fontSize: 8 },
  value: { flex: 1, fontFamily: "DejaVu Sans Bold", fontSize: 8 },
  details: { backgroundColor: COLORS.cardBg, borderRadius: 6, borderWidth: 1, borderColor: COLORS.cardBorder, padding: 10, marginBottom: 10 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginTop: 8 },
  sigCard: { flex: 1, alignItems: "center" },
  sigLine: { width: "85%", height: 1, backgroundColor: COLORS.textMuted, marginBottom: 5 },
  footer: { marginTop: "auto", borderTopWidth: 1, borderTopColor: COLORS.divider, paddingHorizontal: 36, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});

export interface AgreementParty { name: string; email?: string; phone?: string | null; address?: string | null; roleLabel: string; color: string; }

export interface AgreementData {
  title: string;
  subtitle?: string;
  parties: AgreementParty[];
  effectiveDate: Date;
  expiryDate?: Date | null;
  terms?: string[];
  notes?: string | null;
  verificationCode?: string;
  qrCodeDataUrl?: string;
  verificationUrl?: string;
  logoUrl?: string;
}

export function AgreementTemplate({ data, locale = "en" }: { data: AgreementData; locale?: string }) {
  const formatDate = (d: Date) => d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.topBar}>
          {data.logoUrl ? <Image src={data.logoUrl} style={{ width: 36, height: 36, objectFit: "contain" }} /> : <View style={{ width: 36 }} />}
          <View style={{ alignItems: "center", flex: 1 }}><Text style={styles.subtitle}>{data.subtitle ?? "ghostinit"}</Text><Text style={styles.title}>{data.title}</Text></View>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.body}>
          <View style={styles.partiesRow}>
            {data.parties.map((p, idx) => (
              <View key={idx} style={[styles.partyCard, { borderLeftColor: p.color }]}>
                <View style={styles.partyHeader}><View style={[styles.partyDot, { backgroundColor: p.color }]} /><Text style={styles.partyTitle}>{p.roleLabel}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{p.name}</Text></View>
                {p.email ? <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{p.email}</Text></View> : null}
                {p.phone ? <View style={styles.row}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{p.phone}</Text></View> : null}
                {p.address ? <View style={styles.row}><Text style={styles.label}>Address</Text><Text style={styles.value}>{p.address}</Text></View> : null}
              </View>
            ))}
          </View>
          <View style={styles.details}>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, marginBottom: 8 }}>
              <View style={{ alignItems: "center" }}><Text style={styles.label}>Effective</Text><Text style={{ fontFamily: "DejaVu Serif Bold", fontSize: 11 }}>{formatDate(data.effectiveDate)}</Text></View>
              {data.expiryDate ? <View style={{ alignItems: "center" }}><Text style={styles.label}>Expiry</Text><Text style={{ fontFamily: "DejaVu Serif Bold", fontSize: 11 }}>{formatDate(data.expiryDate)}</Text></View> : null}
            </View>
            {data.terms && data.terms.length > 0 ? <View style={{ marginTop: 6 }}>{data.terms.map((t, i) => <Text key={i} style={{ fontSize: 8, marginBottom: 2 }}>• {t}</Text>)}</View> : null}
            {data.notes ? <Text style={{ fontSize: 8, color: COLORS.textMuted, marginTop: 6 }}>{data.notes}</Text> : null}
          </View>
          <View style={styles.sigRow}>
            {data.parties.map((p, idx) => (
              <View key={idx} style={styles.sigCard}><Text style={{ fontFamily: "DejaVu Sans Bold", fontSize: 8, color: "#57534e", marginBottom: 14 }}>{p.roleLabel}</Text><View style={styles.sigLine} /><Text style={{ fontSize: 7, color: COLORS.textMuted }}>{p.name}</Text></View>
            ))}
          </View>
        </View>
        <View style={styles.footer}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {data.qrCodeDataUrl ? <Image src={data.qrCodeDataUrl} style={{ width: 36, height: 36 }} /> : null}
            <View><Text style={{ fontFamily: "DejaVu Sans Bold", fontSize: 9 }}>{data.verificationCode ?? ""}</Text>{data.verificationUrl ? <Text style={{ fontSize: 7, color: COLORS.textMuted }}>{data.verificationUrl}</Text> : null}</View>
          </View>
          <Text style={{ fontSize: 7, color: COLORS.textMuted }}>{formatDate(new Date())} • GhostInit PDF</Text>
        </View>
      </Page>
    </Document>
  );
}
`;
}
