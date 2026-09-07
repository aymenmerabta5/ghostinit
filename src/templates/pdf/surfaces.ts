import { nativeI18nTemplate } from "../apps/fragments/native-i18n.js";

type PdfMode = "monorepo" | "single";
type PdfFramework = "nextjs" | "tanstack-start";

export function pdfWebWorkspaceContent(mode: PdfMode): string {
  const hookImport = mode === "monorepo" ? "@repo/pdf/client/usePdf" : "@/hooks/usePdf";
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePdf } from "${hookImport}";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";

import { samplePdfData, type PdfTemplate } from "@/features/pdf/sample-data";

export function PdfWorkspace(): React.JSX.Element {
  const locale = useSurfaceLocale();
  const t = useSurfaceTranslations("pdf");
  const [template, setTemplate] = React.useState<PdfTemplate>("invoice");
  const downloadInFlight = React.useRef(false);
  const captureOwner = useAuthOwnedEffect();
  const { generate, loading, error } = usePdf({ captureOwner });
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

export function pdfWebPageContent(_mode: PdfMode, framework: PdfFramework): string {
  const workspaceImport = 'import { PdfWorkspace } from "@/features/pdf/pdf-workspace";';
  if (framework === "nextjs")
    return `"use client";\n${workspaceImport}\nexport default PdfWorkspace;\n`;
  return `${workspaceImport}
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

import { samplePdfData, type PdfTemplate } from "@/features/pdf/sample-data";

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
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
${i18n.importLine}
${localeImport}

import { samplePdfData, type PdfTemplate } from "../features/pdf/sample-data";

export const Route = createFileRoute("/pdf")({ component: PdfPage });

function PdfPage(): React.JSX.Element {
${i18n.hookLine}
${localeState}
  const ownOperation = useAuthOwnedEffect();
  const [template, setTemplate] = React.useState<PdfTemplate>("invoice");
  const downloadInFlight = React.useRef(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
${labels}

  async function download(): Promise<void> {
    if (downloadInFlight.current) return;
    const isCurrent = ownOperation();
    if (!isCurrent()) return;
    downloadInFlight.current = true;
    setLoading(true); setError(null);
    try {
      const fileName = \`\${template}.pdf\`;
      const pdfBase64 = await generatePdfDesktop({ template, data: ${sampleData}, locale, fileName });
      if (!isCurrent()) return;
      downloadPdfBase64(pdfBase64, fileName);
    } catch {
      if (isCurrent()) setError(${i18n.value("generationError", "PDF generation failed")});
    } finally { if (isCurrent()) { downloadInFlight.current = false; setLoading(false); } }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6"><div className="flex items-start justify-between gap-4"><div className="flex flex-col gap-2"><p className="text-sm font-medium text-primary">${i18n.child("documentWorkspace", "Document workspace")}</p><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("secureTitle", "Generate a secure PDF")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">${i18n.child("desktopDescription", "Uses the same authenticated, bounded renderer as the web and mobile apps.")}</p></div><Button variant="outline" render={<Link to="/dashboard" />} nativeButton={false}>${i18n.child("dashboard", "Dashboard")}</Button></div><Card><CardHeader><CardTitle>${i18n.child("template", "Template")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-4"><Field><FieldLabel id="pdf-template-label">${i18n.child("template", "Template")}</FieldLabel><Select items={templateOptions} value={template} onValueChange={(value) => { if (value === "invoice" || value === "certificate" || value === "agreement") setTemplate(value); }}><SelectTrigger aria-labelledby="pdf-template-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{templateOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="button" disabled={loading} aria-busy={loading} onClick={() => void download()}>{loading ? ${i18n.value("generating", "Generating…")} : ${i18n.value("generateDownload", "Generate and download")}}</Button></CardContent></Card></main>
  );
}
`;
}
