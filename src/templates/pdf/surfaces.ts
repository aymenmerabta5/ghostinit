import { nativeI18nTemplate } from "../apps/fragments/native-i18n.js";
import { EN_MESSAGES } from "../i18n/messages/en.js";

type PdfMode = "monorepo" | "single";
type PdfFramework = "nextjs" | "tanstack-start";

const sampleDataFunction = `type PdfTemplate = "invoice" | "certificate" | "agreement";
type PdfSampleKey =
  | "sample.customer"
  | "sample.recipient"
  | "sample.invoiceItem"
  | "sample.invoiceNotes"
  | "sample.certificateReason"
  | "sample.agreementTitle"
  | "sample.provider"
  | "sample.customerRole"
  | "sample.deliverService"
  | "sample.protectInformation";

const PDF_SAMPLE_ENGLISH: Readonly<Record<PdfSampleKey, string>> = {
  "sample.customer": ${JSON.stringify(EN_MESSAGES.pdf.sample.customer)},
  "sample.recipient": ${JSON.stringify(EN_MESSAGES.pdf.sample.recipient)},
  "sample.invoiceItem": ${JSON.stringify(EN_MESSAGES.pdf.sample.invoiceItem)},
  "sample.invoiceNotes": ${JSON.stringify(EN_MESSAGES.pdf.sample.invoiceNotes)},
  "sample.certificateReason": ${JSON.stringify(EN_MESSAGES.pdf.sample.certificateReason)},
  "sample.agreementTitle": ${JSON.stringify(EN_MESSAGES.pdf.sample.agreementTitle)},
  "sample.provider": ${JSON.stringify(EN_MESSAGES.pdf.sample.provider)},
  "sample.customerRole": ${JSON.stringify(EN_MESSAGES.pdf.sample.customerRole)},
  "sample.deliverService": ${JSON.stringify(EN_MESSAGES.pdf.sample.deliverService)},
  "sample.protectInformation": ${JSON.stringify(EN_MESSAGES.pdf.sample.protectInformation)},
};

function samplePdfData(
  template: PdfTemplate,
  translate: (key: PdfSampleKey) => string = (key) => PDF_SAMPLE_ENGLISH[key],
): Record<string, unknown> {
  const now = new Date();
  if (template === "invoice") {
    return {
      invoiceNumber: "INV-DEMO-001",
      issuedAt: now.toISOString(),
      dueDate: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
      from: { name: "GhostInit Studio", email: "billing@example.com" },
      to: { name: translate("sample.customer"), email: "customer@example.com" },
      items: [{ description: translate("sample.invoiceItem"), quantity: 1, unitPrice: 49 }],
      currency: "USD",
      notes: translate("sample.invoiceNotes"),
    };
  }
  if (template === "certificate") {
    return {
      recipientName: translate("sample.recipient"),
      recipientEmail: "recipient@example.com",
      issuerName: "GhostInit Academy",
      reason: translate("sample.certificateReason"),
      issuedAt: now.toISOString(),
    };
  }
  return {
    title: translate("sample.agreementTitle"),
    subtitle: "GhostInit",
    parties: [
      { name: "GhostInit Studio", email: "legal@example.com", roleLabel: translate("sample.provider"), color: "#2563eb" },
      { name: translate("sample.customer"), email: "customer@example.com", roleLabel: translate("sample.customerRole"), color: "#059669" },
    ],
    effectiveDate: now.toISOString(),
    expiryDate: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
    terms: [translate("sample.deliverService"), translate("sample.protectInformation")],
  };
}`;

function webPresentationContent(hookImport: string): string {
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePdf } from "${hookImport}";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";

${sampleDataFunction}

export function PdfWorkspace(): React.JSX.Element {
  const locale = useSurfaceLocale();
  const t = useSurfaceTranslations("pdf");
  const [template, setTemplate] = React.useState<PdfTemplate>("invoice");
  const downloadInFlight = React.useRef(false);
  const { generate, loading, error } = usePdf();
  const templateOptions = [
    { label: t("invoice"), value: "invoice" },
    { label: t("certificate"), value: "certificate" },
    { label: t("agreement"), value: "agreement" },
  ] as const;

  async function download(): Promise<void> {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    try { await generate({ template, data: samplePdfData(template, t), locale, fileName: \`\${template}.pdf\` }); }
    catch { /* The hook exposes the error; the UI event must settle. */ }
    finally { downloadInFlight.current = false; }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2"><p className="text-sm font-medium text-primary">{t("documentWorkspace")}</p><h1 className="text-3xl font-semibold tracking-tight">{t("secureTitle")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">{t("webDescription")}</p></div>
      <Card><CardHeader><CardTitle>{t("template")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
        <Field><FieldLabel id="pdf-template-label">{t("template")}</FieldLabel><Select items={templateOptions} value={template} onValueChange={(value) => { if (value === "invoice" || value === "certificate" || value === "agreement") setTemplate(value); }}><SelectTrigger aria-labelledby="pdf-template-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{templateOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        {error ? <Alert variant="destructive"><AlertDescription>{t("generationError")}</AlertDescription></Alert> : null}
        <Button type="button" disabled={loading} aria-busy={loading} onClick={() => void download()}>{loading ? t("generating") : t("generateDownload")}</Button>
      </CardContent></Card>
    </main>
  );
}`;
}

export function pdfWebPageContent(mode: PdfMode, framework: PdfFramework): string {
  const hookImport = mode === "monorepo" ? "@repo/pdf/client/usePdf" : "@/hooks/usePdf";
  const presentation = webPresentationContent(hookImport);
  if (framework === "nextjs") return `${presentation}\nexport default PdfWorkspace;\n`;
  return `${presentation}
import { createFileRoute } from "@tanstack/react-router";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
export const Route = createFileRoute("/pdf")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  // PDF bytes are produced only after an explicit POST and are never dehydrated into HTML.
  loader: ({ context }) => loadProtectedRoute(context),
  component: PdfWorkspace,
});
`;
}

export function pdfExpoPageContent(
  hookImport = "@/hooks/usePdf",
  hasI18n = false,
  i18nImport = "@/lib/i18n",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "pdf", i18nImport);
  const localeImport = hasI18n ? `import { usePlatformI18n } from "${i18nImport}";` : "";
  const localeState = hasI18n
    ? "  const { locale } = usePlatformI18n();"
    : '  const locale = "en" as const;';
  const labels = hasI18n
    ? `  const templateLabels: Record<PdfTemplate, string> = {
    invoice: t("invoice"),
    certificate: t("certificate"),
    agreement: t("agreement"),
  };`
    : "";
  const sampleData = hasI18n ? "samplePdfData(template, t)" : "samplePdfData(template)";
  return `import * as React from "react";
import { ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { usePdfMobile } from "${hookImport}";
${i18n.importLine}
${localeImport}

${sampleDataFunction}

export default function PdfScreen(): React.JSX.Element {
${i18n.hookLine}
${localeState}
  const [template, setTemplate] = React.useState<PdfTemplate>("invoice");
  const downloadInFlight = React.useRef(false);
  const { generateAndShare, loading, error } = usePdfMobile();
  const templates: PdfTemplate[] = ["invoice", "certificate", "agreement"];
${labels}

  async function download(): Promise<void> {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    try { await generateAndShare({ template, data: ${sampleData}, locale, fileName: \`\${template}.pdf\` }); }
    catch { /* The hook exposes the error; the UI event must settle. */ }
    finally { downloadInFlight.current = false; }
  }

  return (
    <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[760px] self-center gap-5 p-5"><View className="flex-row items-center justify-between"><View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("mobileTitle", "PDF workspace")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Generate on the authenticated server, then share natively.")}</Text></View><Link href="/dashboard" asChild><Button variant="outline"><Text>${i18n.child("dashboard", "Dashboard")}</Text></Button></Link></View><Card><CardHeader><CardTitle>${i18n.child("template", "Template")}</CardTitle><CardDescription>${i18n.child("templateDescription", "Choose a bounded sample document.")}</CardDescription></CardHeader><CardContent className="gap-3"><View className="flex-row flex-wrap gap-2">{templates.map((item) => <Button key={item} variant={item === template ? "default" : "outline"} onPress={() => setTemplate(item)}><Text>{${hasI18n ? "templateLabels[item]" : "item"}}</Text></Button>)}</View>{error ? <Text accessibilityRole="alert" className="text-sm text-destructive">${hasI18n ? `{t("generationError")}` : "{error}"}</Text> : null}<Button disabled={loading} isLoading={loading} onPress={() => void download()}><Text>{loading ? ${i18n.value("generating", "Generating…")} : ${i18n.value("generateShare", "Generate and share")}}</Text></Button></CardContent></Card></View></ScrollView>
  );
}
`;
}

export function pdfDesktopPageContent(hasI18n = false, i18nImport = "@/lib/i18n"): string {
  const i18n = nativeI18nTemplate(hasI18n, "pdf", i18nImport);
  const localeImport = hasI18n ? `import { usePlatformI18n } from "${i18nImport}";` : "";
  const localeState = hasI18n
    ? "  const { locale } = usePlatformI18n();"
    : '  const locale = "en" as const;';
  const labels = `  const templateOptions = [
    { label: ${i18n.value("invoice", "Invoice")}, value: "invoice" },
    { label: ${i18n.value("certificate", "Certificate")}, value: "certificate" },
    { label: ${i18n.value("agreement", "Agreement")}, value: "agreement" },
  ] as const;`;
  const sampleData = hasI18n ? "samplePdfData(template, t)" : "samplePdfData(template)";
  return `import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadPdfBase64, generatePdfDesktop } from "../../lib/pdf";
${i18n.importLine}
${localeImport}

${sampleDataFunction}

export const Route = createFileRoute("/pdf")({ component: PdfPage });

function PdfPage(): React.JSX.Element {
${i18n.hookLine}
${localeState}
  const [template, setTemplate] = React.useState<PdfTemplate>("invoice");
  const downloadInFlight = React.useRef(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
${labels}

  async function download(): Promise<void> {
    if (downloadInFlight.current) return;
    downloadInFlight.current = true;
    setLoading(true); setError(null);
    try {
      const fileName = \`\${template}.pdf\`;
      const pdfBase64 = await generatePdfDesktop({ template, data: ${sampleData}, locale, fileName });
      downloadPdfBase64(pdfBase64, fileName);
    } catch {
      setError(${i18n.value("generationError", "PDF generation failed")});
    } finally { downloadInFlight.current = false; setLoading(false); }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div className="flex flex-col gap-2"><p className="text-sm font-medium text-primary">${i18n.child("documentWorkspace", "Document workspace")}</p><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("secureTitle", "Generate a secure PDF")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">${i18n.child("desktopDescription", "Uses the same authenticated, bounded renderer as the web and mobile apps.")}</p></div><Button variant="outline" render={<Link to="/dashboard" />} nativeButton={false}>${i18n.child("dashboard", "Dashboard")}</Button></div><Card><CardHeader><CardTitle>${i18n.child("template", "Template")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel id="pdf-template-label">${i18n.child("template", "Template")}</FieldLabel><Select items={templateOptions} value={template} onValueChange={(value) => { if (value === "invoice" || value === "certificate" || value === "agreement") setTemplate(value); }}><SelectTrigger aria-labelledby="pdf-template-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{templateOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="button" disabled={loading} aria-busy={loading} onClick={() => void download()}>{loading ? ${i18n.value("generating", "Generating…")} : ${i18n.value("generateDownload", "Generate and download")}}</Button></CardContent></Card></main>
  );
}
`;
}
