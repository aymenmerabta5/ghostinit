import { file, type TemplateFile } from "../shared.js";
import { nativeI18nTemplate, webSurfaceI18nTemplate } from "../apps/fragments/native-i18n.js";

type Mode = "single" | "monorepo";
type Target = "web" | "mobile" | "desktop";

function i18nFor(mode: Mode, target: Target, hasI18n: boolean) {
  const path = target === "desktop" && mode === "single" ? "@/renderer/lib/i18n" : "@/lib/i18n";
  return target === "web"
    ? webSurfaceI18nTemplate("pdf")
    : nativeI18nTemplate(hasI18n, "pdf", path);
}

export function pdfFeatureScreenContent(): string {
  return `"use client";
import type * as React from "react";
import { PdfWorkspaceView } from "./components/pdf-workspace-view";
import { usePdfWorkspace } from "./use-pdf-workspace";
export function PdfWorkspace(): React.JSX.Element { return <PdfWorkspaceView {...usePdfWorkspace()} />; }
`;
}

export function pdfWebRouteContent(framework: "nextjs" | "tanstack-start"): string {
  if (framework === "nextjs")
    return 'export { PdfWorkspace as default } from "@/features/pdf/pdf-workspace";\n';
  return `import { createFileRoute } from "@tanstack/react-router";
import { PdfWorkspace } from "@/features/pdf/pdf-workspace";
import { loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";
export const Route = createFileRoute("/pdf")({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  // PDF bytes are produced only after an explicit action, never dehydrated into HTML.
  loader: ({ context }) => loadProtectedRoute(context),
  component: PdfWorkspace,
});
`;
}

export function pdfMobileRouteContent(): string {
  return 'export { PdfWorkspace as default } from "@/features/pdf/page";\n';
}

export function pdfDesktopRouteContent(): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { PdfWorkspace } from "../features/pdf/page";
export const Route = createFileRoute("/pdf")({ component: PdfWorkspace });
`;
}

function mutationsContent(mode: Mode, target: Target): string {
  if (target === "web") {
    const hook = mode === "monorepo" ? "@repo/pdf/client/usePdf" : "@/hooks/usePdf";
    return `import { usePdf } from "${hook}";
export function usePdfGenerator(captureOwner: () => () => boolean) { return usePdf({ captureOwner }); }
`;
  }
  if (target === "mobile") {
    const hook = mode === "monorepo" ? "@/hooks/usePdf" : "@/hooks/usePdfMobile";
    return `import { usePdfMobile } from "${hook}";
export function usePdfGenerator() { return usePdfMobile(); }
`;
  }
  return `import { generatePdfDesktop, downloadPdfBase64 } from "../../../lib/pdf";
export async function generateAndDownloadPdf(input: Parameters<typeof generatePdfDesktop>[0] & { fileName: string }, isCurrent: () => boolean): Promise<void> {
  const bytes = await generatePdfDesktop(input);
  if (isCurrent()) downloadPdfBase64(bytes, input.fileName);
}
`;
}

function workflowContent(mode: Mode, target: Target, hasI18n: boolean): string {
  const i18n = i18nFor(mode, target, hasI18n);
  const web = target === "web";
  const desktop = target === "desktop";
  const localePath =
    target === "desktop" && mode === "single" ? "@/renderer/lib/i18n" : "@/lib/i18n";
  const localeImport = web
    ? 'import { useSurfaceLocale } from "@/lib/translations";'
    : hasI18n
      ? `import { usePlatformI18n } from "${localePath}";`
      : "";
  const locale = web
    ? "const locale = useSurfaceLocale();"
    : hasI18n
      ? "const { locale } = usePlatformI18n();"
      : 'const locale = "en" as const;';
  return `"use client";
${desktop ? "" : 'import { useRef } from "react";'}
${target === "mobile" ? 'import { useForm, useStore } from "@tanstack/react-form";' : 'import { useAppForm, useStore } from "@/components/ui/form";'}
${desktop ? 'import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";\nimport { generateAndDownloadPdf } from "./mutations";' : 'import { usePdfGenerator } from "./mutations";'}
${web ? 'import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";' : ""}
import { samplePdfData, type PdfTemplate } from "./sample-data";
${i18n.importLine}
${localeImport}

export function usePdfWorkspace() {
${i18n.hookLine}
  ${locale}
  const form = ${target === "mobile" ? "useForm" : "useAppForm"}({ defaultValues: { template: "invoice" as PdfTemplate }, onSubmit: async ({ value }): Promise<void> => { await download(value.template); } });
  const template = useStore(form.store, state => state.values.template);
  const setTemplate = (value: PdfTemplate): void => { form.setFieldValue("template", value); };
  const templateOptions = [
    { label: ${i18n.value("invoice", "Invoice")}, value: "invoice" },
    { label: ${i18n.value("certificate", "Certificate")}, value: "certificate" },
    { label: ${i18n.value("agreement", "Agreement")}, value: "agreement" },
  ] as const;
${
  desktop
    ? `  const mutation = useAuthOwnedMutation(generateAndDownloadPdf);
  const loading = mutation.isPending;
  const error = mutation.error?.message ?? null;
  function download(template: PdfTemplate): void { void mutation.run({ template, data: ${web || hasI18n ? "samplePdfData(template, t)" : "samplePdfData(template)"}, locale, fileName: \`\${template}.pdf\` }); }`
    : `  const inFlight = useRef(false);
  ${web ? "const captureOwner = useAuthOwnedEffect();" : ""}
  const { ${web ? "generate" : "generateAndShare"}, loading, error } = usePdfGenerator(${web ? "captureOwner" : ""});
  async function download(template: PdfTemplate): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await ${web ? "generate" : "generateAndShare"}({ template, data: ${web || hasI18n ? "samplePdfData(template, t)" : "samplePdfData(template)"}, locale, fileName: \`\${template}.pdf\` }); }
    catch { /* The mutation adapter exposes errors; UI event promises must settle. */ }
    finally { inFlight.current = false; }
  }`
}
  return { template, setTemplate, templateOptions, loading, error, download: () => { void form.handleSubmit(); } };
}
`;
}

function presentationContent(mode: Mode, target: Target, hasI18n: boolean): string {
  const i18n = i18nFor(mode, target, hasI18n);
  const mobile = target === "mobile";
  const web = target === "web";
  return `"use client";
import type * as React from "react";
${
  mobile
    ? 'import { ScrollView, View } from "react-native";\nimport { Link } from "expo-router";\nimport { Text } from "@/components/ui/text";'
    : `${web ? "" : 'import { Link } from "@tanstack/react-router";\n'}import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle${mobile ? ", CardDescription" : ""} } from "@/components/ui/card";
import type { usePdfWorkspace } from "../use-pdf-workspace";
${i18n.importLine}

export function PdfWorkspaceView({ template, setTemplate, templateOptions, loading, error, download }: ReturnType<typeof usePdfWorkspace>): React.JSX.Element {
${i18n.hookLine}
${
  mobile
    ? `  return <ScrollView className="flex-1 bg-background"><View className="w-full max-w-[760px] self-center gap-5 p-5">
    <View className="flex-row items-center justify-between"><View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("mobileTitle", "PDF workspace")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Generate on the authenticated server, then share natively.")}</Text></View><Link href="/dashboard" asChild><Button variant="outline"><Text>${i18n.child("dashboard", "Dashboard")}</Text></Button></Link></View>
    <Card><CardHeader><CardTitle>${i18n.child("template", "Template")}</CardTitle><CardDescription>${i18n.child("templateDescription", "Choose a bounded sample document.")}</CardDescription></CardHeader><CardContent className="gap-3">
      <View className="flex-row flex-wrap gap-2">{templateOptions.map((item) => <Button key={item.value} variant={item.value === template ? "default" : "outline"} onPress={() => setTemplate(item.value)}><Text>{item.label}</Text></Button>)}</View>
      {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">${hasI18n ? i18n.child("generationError", "PDF generation failed") : "{error}"}</Text> : null}
      <Button disabled={loading} isLoading={loading} onPress={download}><Text>{loading ? ${i18n.value("generating", "Generating…")} : ${i18n.value("generateShare", "Generate and share")}}</Text></Button>
    </CardContent></Card>
  </View></ScrollView>;`
    : `  return <main className="mx-auto flex w-full ${web ? "max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10" : "max-w-3xl flex-col gap-6"}">
    <div className="${web ? "flex flex-col gap-2" : "flex items-start justify-between gap-4"}"><div className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">${i18n.child("secureTitle", "Create a PDF")}</h1><p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">${web ? i18n.child("webDescription", "Create a document securely on the server.") : i18n.child("desktopDescription", "Uses the same authenticated, bounded renderer as the web and mobile apps.")}</p></div>${web ? "" : `<Button variant="outline" render={<Link to="/dashboard" />} nativeButton={false}>${i18n.child("dashboard", "Dashboard")}</Button>`}</div>
    <Card className="max-w-3xl"><CardHeader><CardTitle as="h2">${i18n.child("documentWorkspace", "Document workspace")}</CardTitle></CardHeader><CardContent className="flex flex-col gap-5">
      <Field><FieldLabel id="pdf-template-label">${i18n.child("template", "Template")}</FieldLabel><Select items={templateOptions} value={template} onValueChange={(value) => { if (value === "invoice" || value === "certificate" || value === "agreement") setTemplate(value); }}><SelectTrigger aria-labelledby="pdf-template-label"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{templateOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      {error ? <Alert variant="destructive"><AlertDescription>${i18n.child("generationError", "PDF generation failed")}</AlertDescription></Alert> : null}
      <Button className="w-auto self-start" type="button" disabled={loading} aria-busy={loading} onClick={download}>{loading ? ${i18n.value("generating", "Generating…")} : ${i18n.value("generateDownload", "Generate and download")}}</Button>
    </CardContent></Card>
  </main>;`
}
}
`;
}

export function pdfFeatureSupportFiles(
  mode: Mode,
  target: Target,
  hasI18n = false,
): TemplateFile[] {
  const root =
    mode === "single"
      ? target === "desktop"
        ? "src/renderer"
        : "src"
      : target === "desktop"
        ? "apps/desktop/src/renderer"
        : target === "mobile"
          ? "apps/mobile/src"
          : "apps/web/src";
  const base = `${root}/features/pdf`;
  return [
    file(`${base}/mutations.ts`, mutationsContent(mode, target)),
    file(`${base}/use-pdf-workspace.ts`, workflowContent(mode, target, hasI18n)),
    file(`${base}/components/pdf-workspace-view.tsx`, presentationContent(mode, target, hasI18n)),
    ...(target === "web" ? [] : [file(`${base}/page.tsx`, pdfFeatureScreenContent())]),
  ];
}
