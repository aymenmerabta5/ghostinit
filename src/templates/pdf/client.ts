export function usePdfHookContent(_basePath: string): string {
  return `"use client";
import { useCallback, useState } from "react";

export interface UsePdfOptions {
  endpoint?: string;
}

export function usePdf(options: UsePdfOptions = {}) {
  const endpoint = options.endpoint ?? "/api/pdf";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (input: { template: "invoice" | "certificate" | "agreement"; data: unknown; locale?: string; fileName?: string }) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(\`PDF generation failed: \${res.status}\`);
      const json = await res.json() as { pdfBase64?: string; fileName?: string };
      if (!json.pdfBase64) throw new Error("No pdfBase64 in response");
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = json.fileName ?? input.fileName ?? \`\${input.template}.pdf\`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      return json;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg); throw e;
    } finally { setLoading(false); }
  }, [endpoint]);

  const preview = useCallback(async (input: Parameters<typeof generate>[0]) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(\`Preview failed: \${res.status}\`);
      const json = await res.json() as { pdfBase64?: string };
      if (!json.pdfBase64) throw new Error("No pdfBase64");
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg); throw e;
    } finally { setLoading(false); }
  }, [endpoint]);

  return { generate, preview, loading, error };
}
`;
}

export function usePdfMobileContent(): string {
  return `import { useCallback, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

export function usePdfMobile(options: { endpoint?: string } = {}) {
  const endpoint = options.endpoint ?? "/api/pdf";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAndShare = useCallback(async (input: { template: "invoice" | "certificate" | "agreement"; data: unknown; fileName?: string }) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(\`PDF failed: \${res.status}\`);
      const json = await res.json() as { pdfBase64?: string; fileName?: string };
      if (!json.pdfBase64) throw new Error("No pdfBase64");
      const fileName = json.fileName ?? input.fileName ?? \`\${input.template}.pdf\`;
      const fileUri = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") + fileName;
      await FileSystem.writeAsStringAsync(fileUri, json.pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: fileName });
      }
      return fileUri;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg); throw e;
    } finally { setLoading(false); }
  }, [endpoint]);

  return { generateAndShare, loading, error };
}
`;
}

export function desktopPdfHelperContent(): string {
  return `// Desktop (Electron) helper — runs in main or renderer via HTTP to local server.
// Recommended: keep @react-pdf/renderer server-side (Next.js route). Desktop calls the same endpoint.
// For offline direct generation (Electron main), you can import { renderInvoicePdf } from "@repo/pdf" directly
// since Electron main is Node. This helper prefers the HTTP path for parity with web/mobile.

export async function generatePdfDesktop(input: { template: "invoice" | "certificate" | "agreement"; data: unknown; fileName?: string }, endpoint?: string): Promise<string> {
  const base = endpoint ?? (typeof process !== "undefined" && (process.env.DESKTOP_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? process.env.VITE_API_URL)) ?? "http://localhost:3000";
  const url = (base.endsWith("/") ? base.slice(0, -1) : base) + "/api/pdf";
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } as unknown as Record<string, string>, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(\`PDF failed \${res.status}\`);
  const json = await res.json() as { pdfBase64?: string; fileName?: string };
  if (!json.pdfBase64) throw new Error("No pdfBase64");
  return json.pdfBase64;
}

export function downloadPdfBase64(pdfBase64: string, fileName: string): void {
  if (typeof document === "undefined") return;
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
`;
}
