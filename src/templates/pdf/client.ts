export function usePdfHookContent(_basePath: string): string {
  return `"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

export interface UsePdfOptions {
  endpoint?: string;
  captureOwner?: () => () => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePdfOwner(isCurrent: () => boolean): void {
  if (isCurrent()) return;
  const error = new Error("PDF operation is no longer active");
  error.name = "AbortError";
  throw error;
}

function safePdfFileName(value: string): string {
  const leaf = value.replaceAll("\\\\", "/").split("/").at(-1) ?? "document.pdf";
  const normalized = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "");
  const base = normalized || "document.pdf";
  return (base.toLowerCase().endsWith(".pdf") ? base : \`\${base}.pdf\`).slice(0, 128);
}

function resolvePdfEndpoint(value: string): string {
  if (typeof window === "undefined") throw new Error("PDF generation requires a browser session");
  const candidate = new URL(value, window.location.origin);
  if (candidate.origin !== window.location.origin || candidate.username || candidate.password) {
    throw new Error("PDF endpoint must use the current application origin");
  }
  return candidate.toString();
}

export function usePdf(options: UsePdfOptions = {}) {
  const endpoint = options.endpoint ?? "/api/pdf";
  const captureOwner = options.captureOwner;
  const lifetime = useRef({ mounted: false, generation: 0 });
  useLayoutEffect(() => {
    lifetime.current.mounted = true;
    lifetime.current.generation += 1;
    return () => { lifetime.current.mounted = false; lifetime.current.generation += 1; };
  }, []);
  const ownOperation = useCallback(() => {
    const generation = lifetime.current.generation;
    const ownsAuth = captureOwner?.();
    return () => lifetime.current.mounted && lifetime.current.generation === generation && (ownsAuth?.() ?? true);
  }, [captureOwner]);

  type PdfInput = { template: "invoice" | "certificate" | "agreement"; data: unknown; locale?: string; fileName?: string };
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async ({ input, preview, isCurrent }: { input: PdfInput; preview: boolean; isCurrent: () => boolean }) => {
      requirePdfOwner(isCurrent);
      const res = await fetch(resolvePdfEndpoint(endpoint), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(\`PDF generation failed: \${res.status}\`);
      const json: unknown = await res.json();
      requirePdfOwner(isCurrent);
      if (!isRecord(json) || typeof json.pdfBase64 !== "string") throw new Error("Invalid PDF response");
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (!preview) {
        const a = document.createElement("a");
        a.href = url; a.download = safePdfFileName(typeof json.fileName === "string" ? json.fileName : input.fileName ?? \`\${input.template}.pdf\`);
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
      return { response: json, url };
    },
  });

  const generate = useCallback(async (input: PdfInput) => {
    const isCurrent = ownOperation();
    requirePdfOwner(isCurrent);
    const { response: json } = await mutation.mutateAsync({ input, preview: false, isCurrent });
    requirePdfOwner(isCurrent);
    return json;
  }, [mutation.mutateAsync, ownOperation]);

  const preview = useCallback(async (input: Parameters<typeof generate>[0]) => {
    const isCurrent = ownOperation();
    requirePdfOwner(isCurrent);
    const { url } = await mutation.mutateAsync({ input, preview: true, isCurrent });
    requirePdfOwner(isCurrent);
    return url;
  }, [mutation.mutateAsync, ownOperation]);

  const ownsState = mutation.variables?.isCurrent() ?? true;
  return { generate, preview, loading: ownsState && mutation.isPending, error: ownsState ? mutation.error?.message ?? null : null };
}
`;
}

export function usePdfMobileContent(mode: "monorepo" | "single" = "monorepo"): string {
  return `import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";

function requirePdfOwner(isCurrent: () => boolean): void {
  if (isCurrent()) return;
  const error = new Error("PDF operation is no longer active");
  error.name = "AbortError";
  throw error;
}

function resolvePdfEndpoint(requested: string | undefined): string {
  let configuredOrigin: string | null = null;
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password) {
        configuredOrigin = parsed.origin;
        break;
      }
    } catch {}
  }
  if (!configuredOrigin) throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
  const candidate = new URL(requested ?? "/api/pdf", configuredOrigin);
  if (candidate.origin !== configuredOrigin || candidate.username || candidate.password) {
    throw new Error("PDF endpoint must use the configured API origin");
  }
  return candidate.toString();
}

function safePdfFileName(value: string): string {
  const leaf = value.replaceAll("\\\\", "/").split("/").at(-1) ?? "document.pdf";
  const normalized = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "");
  const base = normalized || "document.pdf";
  return (base.toLowerCase().endsWith(".pdf") ? base : \`\${base}.pdf\`).slice(0, 128);
}

export function usePdfMobile(options: { endpoint?: string } = {}) {
  const endpoint = resolvePdfEndpoint(options.endpoint);
  const ownOperation = useAuthOwnedEffect();
  type PdfInput = { template: "invoice" | "certificate" | "agreement"; data: unknown; locale?: string; fileName?: string };
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async ({ input, isCurrent }: { input: PdfInput; isCurrent: () => boolean }) => {
      requirePdfOwner(isCurrent);
      const cookie = Platform.OS === "web" ? null : await authClient.getCookie();
      requirePdfOwner(isCurrent);
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) };
      const res = await fetch(endpoint, { method: "POST", credentials: "include", headers, body: JSON.stringify(input) });
      if (!res.ok) throw new Error(\`PDF failed: \${res.status}\`);
      const json: unknown = await res.json();
      requirePdfOwner(isCurrent);
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("Invalid PDF response");
      const pdfBase64 = Reflect.get(json, "pdfBase64");
      const responseFileName = Reflect.get(json, "fileName");
      if (typeof pdfBase64 !== "string") throw new Error("Invalid PDF response");
      const fileName = safePdfFileName(typeof responseFileName === "string" ? responseFileName : input.fileName ?? \`\${input.template}.pdf\`);
      if (Platform.OS === "web") {
        const bytes = Uint8Array.from(atob(pdfBase64), (character) => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return url;
      }
      const sharingAvailable = await Sharing.isAvailableAsync();
      requirePdfOwner(isCurrent);
      const file = new File(Paths.cache, fileName);
      file.write(pdfBase64, { encoding: "base64" });
      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: fileName });
      }
      requirePdfOwner(isCurrent);
      return file.uri;
    },
  });
  const generateAndShare = useCallback(async (input: PdfInput) => {
    const isCurrent = ownOperation();
    requirePdfOwner(isCurrent);
    return mutation.mutateAsync({ input, isCurrent });
  }, [mutation.mutateAsync, ownOperation]);

  const ownsState = mutation.variables?.isCurrent() ?? true;
  return { generateAndShare, loading: ownsState && mutation.isPending, error: ownsState ? mutation.error?.message ?? null : null };
}
`;
}

export function desktopPdfHelperContent(mode: "monorepo" | "single" = "monorepo"): string {
  const fetchImport =
    mode === "monorepo"
      ? "../renderer/adapters/desktop-fetch"
      : "@/renderer/adapters/desktop-fetch";
  return `// Desktop renderer helper — calls the authenticated server endpoint.
// The authoritative main-process bridge owns cookies, Origin signaling, response
// bounds, and the production API origin. The file:// renderer never fetches it directly.
import { desktopBridgeFetch } from "${fetchImport}";

function safePdfFileName(value: string): string {
  const leaf = value.replaceAll("\\\\", "/").split("/").at(-1) ?? "document.pdf";
  const normalized = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "");
  const base = normalized || "document.pdf";
  return (base.toLowerCase().endsWith(".pdf") ? base : \`\${base}.pdf\`).slice(0, 128);
}

function configuredPdfOrigin(): string {
  const parsed = new URL(window.desktopBridge.apiUrl);
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    throw new Error("The desktop bridge must expose a trusted HTTP(S) API URL");
  }
  return parsed.origin;
}

export async function generatePdfDesktop(input: { template: "invoice" | "certificate" | "agreement"; data: unknown; locale?: string; fileName?: string }, endpoint?: string): Promise<string> {
  if (typeof window === "undefined") throw new Error("generatePdfDesktop requires the Electron renderer session");
  const configuredOrigin = configuredPdfOrigin();
  const requestedBase = new URL(endpoint ?? "/api/pdf", configuredOrigin);
  if (requestedBase.origin !== configuredOrigin || requestedBase.username || requestedBase.password) throw new Error("PDF endpoint must use the configured API origin");
  const url = new URL("/api/pdf", requestedBase.origin).toString();
  const res = await desktopBridgeFetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(\`PDF failed \${res.status}\`);
  const json: unknown = await res.json();
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("Invalid PDF response");
  const pdfBase64 = Reflect.get(json, "pdfBase64");
  if (typeof pdfBase64 !== "string") throw new Error("Invalid PDF response");
  return pdfBase64;
}

export function downloadPdfBase64(pdfBase64: string, fileName: string): void {
  if (typeof document === "undefined") return;
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = safePdfFileName(fileName); document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
`;
}
