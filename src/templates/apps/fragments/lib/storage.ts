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
  return path;
}

export function getPublicUrl(path: string | null | undefined): string | null {
  return resolvePublicUrl(path);
}
`;

  const serverContent = `import "server-only";
import { env } from "@repo/config/server";

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
}

export function getS3Config(): S3Config | null {
  const bucket = env.STORAGE_BUCKET;
  if (env.STORAGE_DRIVER !== "s3" || bucket.startsWith("REPLACE_WITH")) return null;
  return {
    bucket,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicUrl: env.S3_PUBLIC_URL,
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
