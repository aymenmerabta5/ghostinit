export function certificateTemplateContent(): string {
  return `import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import * as path from "node:path";
import { type BorderStyleKey, borderComponents } from "../borders";

const fontsDir = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
try {
  Font.register({ family: "DejaVu Sans", src: path.join(fontsDir, "DejaVuSans.ttf") });
  Font.register({ family: "DejaVu Sans Bold", src: path.join(fontsDir, "DejaVuSans-Bold.ttf") });
} catch {}

const styles = StyleSheet.create({
  page: { fontFamily: "DejaVu Sans", fontSize: 11, padding: 32, backgroundColor: "#ffffff" },
  header: { alignItems: "center" },
  title: { fontFamily: "DejaVu Sans Bold", fontSize: 28, letterSpacing: 2, color: "#1a1a2e", textTransform: "uppercase", marginBottom: 8 },
  goldLine: { width: 120, height: 2, backgroundColor: "#c9a227", marginBottom: 8 },
  university: { fontSize: 11, color: "#444444", textTransform: "uppercase", letterSpacing: 1 },
  body: { alignItems: "center", textAlign: "center", marginVertical: 16, paddingHorizontal: 32 },
  certifyText: { fontSize: 13, color: "#333333", lineHeight: 1.7, marginBottom: 20 },
  strong: { fontFamily: "DejaVu Sans Bold" },
  detailsRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-start", marginTop: 8 },
  detailItem: { alignItems: "center", paddingHorizontal: 16 },
  detailItemBorder: { alignItems: "center", paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: "#e0e0e0" },
  detailLabel: { fontSize: 9, color: "#888888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  detailValue: { fontFamily: "DejaVu Sans Bold", fontSize: 11, color: "#1a1a2e", textAlign: "center" },
  emailText: { fontSize: 9, color: "#666666", marginTop: 12 },
  sigSection: { flexDirection: "row", justifyContent: "center", gap: 80, marginTop: 16 },
  sigBox: { alignItems: "center", width: 160 },
  sigLine: { width: "100%", borderTopWidth: 1, borderTopColor: "#1a1a2e", paddingTop: 4, fontSize: 9, color: "#555555", textAlign: "center" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 },
  issueDate: { fontSize: 8, color: "#999999" },
  verificationBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  qrCode: { width: 48, height: 48 },
  vTextBox: { alignItems: "flex-start" },
  vCode: { fontFamily: "DejaVu Sans Bold", fontSize: 9, color: "#1a1a2e" },
  vUrl: { fontSize: 7, color: "#888888", marginTop: 2 },
});

export interface CertificateData {
  recipientName: string;
  recipientEmail?: string;
  title?: string;
  issuerName: string;
  issuerLogoUrl?: string;
  reason: string;
  issuedAt?: Date;
  validUntil?: Date | null;
  verificationCode?: string;
  qrCodeDataUrl?: string;
}

export function CertificateTemplate({ data, locale = "en", borderStyle = "classic", verificationCode, qrCodeDataUrl }: { data: CertificateData; locale?: string; borderStyle?: BorderStyleKey; verificationCode?: string; qrCodeDataUrl?: string }) {
  const formatDate = (d: Date) => d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  const Border = borderComponents[borderStyle] ?? borderComponents.classic;
  const title = data.title ?? (locale === "fr" ? "CERTIFICAT" : "CERTIFICATE");
  const issuedLabel = locale === "fr" ? "Délivré le" : "Issued on";
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Border>
          <View style={styles.header}>
            {data.issuerLogoUrl ? <Image src={data.issuerLogoUrl} style={{ width: 64, height: 64, objectFit: "contain", marginBottom: 8 }} /> : null}
            <Text style={styles.title}>{title}</Text>
            <View style={styles.goldLine} />
            <Text style={styles.university}>{data.issuerName}</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.certifyText}>
              {locale === "fr" ? "Nous certifions que" : "This is to certify that"} <Text style={styles.strong}>{data.recipientName}</Text> {data.reason}
            </Text>
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}><Text style={styles.detailLabel}>{issuedLabel}</Text><Text style={styles.detailValue}>{formatDate(data.issuedAt ?? new Date())}</Text></View>
              {data.validUntil ? <View style={styles.detailItemBorder}><Text style={styles.detailLabel}>Valid until</Text><Text style={styles.detailValue}>{formatDate(data.validUntil)}</Text></View> : null}
            </View>
            {data.recipientEmail ? <Text style={styles.emailText}>{data.recipientEmail}</Text> : null}
          </View>
          <View style={styles.sigSection}><View style={styles.sigBox}><Text style={styles.sigLine}>{locale === "fr" ? "Signature" : "Signature"}</Text></View></View>
          <View style={styles.bottomRow}>
            <Text style={styles.issueDate}>{issuedLabel} {formatDate(data.issuedAt ?? new Date())}</Text>
            {verificationCode ? <View style={styles.verificationBox}>{qrCodeDataUrl ? <Image style={styles.qrCode} src={qrCodeDataUrl} /> : null}<View style={styles.vTextBox}><Text style={styles.vCode}>{verificationCode}</Text><Text style={styles.vUrl}>verify</Text></View></View> : null}
          </View>
        </Border>
      </Page>
    </Document>
  );
}
`;
}
