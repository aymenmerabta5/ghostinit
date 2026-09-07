import { file, type TemplateFile } from "../../../shared.js";

// Stagio: src/lib/storage.ts resolvePublicUrl + src/server/storage/s3.ts
export function storageLibFiles(
  base = "apps/web/src",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): TemplateFile[] {
  const isMonorepo = base.startsWith("apps");
  const envImport = isMonorepo ? "@repo/config" : "@/lib/env";
  const serverOnlyImport = framework === "nextjs" ? `import "server-only";\n` : "";
  const libContent = `export function resolvePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:") || path.startsWith("blob:")) return path;
  const baseUrl = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_S3_URL as string | undefined) ?? (process.env.VITE_S3_URL as string | undefined) : undefined;
  if (!baseUrl) return path;
  const cleanBase = baseUrl.replace(/\\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : \`/\${path}\`;
  return \`\${cleanBase}\${cleanPath}\`;
}

export function getPublicUrl(path: string | null | undefined): string | null {
  return resolvePublicUrl(path);
}
`;

  const serverContent = `${serverOnlyImport}import { env } from "${envImport}";

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
}

export function getS3Config(): S3Config | null {
  const bucket = (env as unknown as { S3_BUCKET?: string }).S3_BUCKET ?? process.env.S3_BUCKET;
  if (!bucket) return null;
  return {
    bucket,
    endpoint: (env as unknown as { S3_ENDPOINT?: string }).S3_ENDPOINT ?? process.env.S3_ENDPOINT,
    region: (env as unknown as { S3_REGION?: string }).S3_REGION ?? "auto",
    accessKeyId: (env as unknown as { S3_ACCESS_KEY_ID?: string }).S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: (env as unknown as { S3_SECRET_ACCESS_KEY?: string }).S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY,
    publicUrl: (env as unknown as { S3_PUBLIC_URL?: string }).S3_PUBLIC_URL ?? process.env.S3_PUBLIC_URL,
  };
}

export function isS3Configured(): boolean {
  return getS3Config() !== null;
}
`;

  const serverPath = isMonorepo
    ? "packages/storage/src/index.ts"
    : `${base}/server/storage/index.ts`;
  // Keep also lib/storage for client usage
  const files: TemplateFile[] = [file(`${base}/lib/storage.ts`, libContent)];
  // Only emit server storage if not already handled by @repo/storage package (monorepo already has packages/storage)
  if (!isMonorepo) {
    files.push(file(serverPath, serverContent));
  } else {
    // For monorepo, enhance @repo/storage with these helpers if not present — emit via apps/web lib only, packages/storage is separate
    // Still emit a re-export for convenience
    files.push(file(`${base}/lib/storage-server.ts`, serverContent));
  }
  return files;
}
