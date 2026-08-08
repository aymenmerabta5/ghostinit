import { file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function storagePackage(): TemplateFile[] {
  return [
    file(
      "packages/storage/package.json",
      packageJson({
        name: "@repo/storage",
        exports: { ".": "./src/index.ts" },
        scripts: { typecheck: "tsc --noEmit", lint: "oxlint .", "format:check": "oxfmt --check ." },
        dependencies: { "@repo/config": "workspace:*" },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/storage/tsconfig.json",
      tsconfig({
        compilerOptions: { types: ["node"], outDir: "./dist", rootDir: "./src", declaration: true },
        include: ["src/**/*"],
      }),
    ),
    file(
      "packages/storage/src/index.ts",
      `// @allow-long 250: local FS + optional S3 wrapper for messaging attachments (Docker volume)
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { env } from "@repo/config";

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "text/plain", "text/csv", "text/markdown",
]);

export interface StoredFile {
  storageKey: string;
  url: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
}

function getUploadsDir(): string {
  const dir = (env as unknown as { UPLOADS_DIR?: string }).UPLOADS_DIR ?? "./data/uploads";
  return dir;
}

function getStorageDriver(): string {
  return (env as unknown as { STORAGE_DRIVER?: string }).STORAGE_DRIVER ?? "local";
}

export function isAllowedMime(mime: string): boolean {
  if (ALLOWED_MIME.has(mime)) return true;
  if (mime.startsWith("image/")) return true;
  return false;
}

export function validateFile(mime: string, size: number): { valid: boolean; reason?: string } {
  if (!isAllowedMime(mime)) return { valid: false, reason: \`Unsupported mime type: \${mime}\` };
  if (size > 10 * 1024 * 1024) return { valid: false, reason: "File too large (max 10MB)" };
  if (size === 0) return { valid: false, reason: "Empty file" };
  return { valid: true };
}

export async function putFile(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
  const v = validateFile(mimeType, buffer.length);
  if (!v.valid) throw new Error(v.reason);
  const driver = getStorageDriver();
  const uploadsDir = getUploadsDir();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file";
  const key = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}-\${safeName}\`;
  const storageKey = \`\${uploadsDir}/\${key}\`;
  if (driver === "s3") {
    // S3 path: lazy import to keep local dev without aws-sdk
    const bucket = (env as unknown as { S3_BUCKET?: string; STORAGE_BUCKET?: string }).S3_BUCKET ?? (env as unknown as { STORAGE_BUCKET?: string }).STORAGE_BUCKET;
    if (!bucket || bucket.startsWith("REPLACE_WITH")) throw new Error("S3_BUCKET not configured");
    // Dynamic import keeps bundle lean for local driver
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const region = (env as unknown as { S3_REGION?: string }).S3_REGION ?? "us-east-1";
    const client = new S3Client({ region });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
    const endpoint = (env as unknown as { S3_ENDPOINT?: string }).S3_ENDPOINT;
    const url = endpoint ? \`\${endpoint.replace(/\\/$/, "")}/\${bucket}/\${key}\` : \`https://\${bucket}.s3.\${region}.amazonaws.com/\${key}\`;
    return { storageKey: key, url, mimeType, byteSize: buffer.length, originalName };
  }
  await mkdir(dirname(storageKey), { recursive: true });
  await writeFile(storageKey, buffer);
  const url = \`/api/messaging/attachments/\${encodeURIComponent(key)}\`;
  return { storageKey, url, mimeType, byteSize: buffer.length, originalName };
}

export async function getFile(storageKey: string): Promise<Buffer | null> {
  const driver = getStorageDriver();
  if (driver === "s3") {
    const bucket = (env as unknown as { S3_BUCKET?: string; STORAGE_BUCKET?: string }).S3_BUCKET ?? (env as unknown as { STORAGE_BUCKET?: string }).STORAGE_BUCKET;
    if (!bucket) return null;
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const region = (env as unknown as { S3_REGION?: string }).S3_REGION ?? "us-east-1";
    const client = new S3Client({ region });
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    const body = out.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (body?.transformToByteArray) {
      const arr = await body.transformToByteArray();
      return Buffer.from(arr);
    }
    return null;
  }
  const uploadsDir = getUploadsDir();
  const full = storageKey.includes("/") ? storageKey : join(uploadsDir, storageKey);
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(full);
  } catch { return null; }
}

export async function deleteFile(storageKey: string): Promise<void> {
  const driver = getStorageDriver();
  if (driver === "s3") {
    const bucket = (env as unknown as { S3_BUCKET?: string; STORAGE_BUCKET?: string }).S3_BUCKET ?? (env as unknown as { STORAGE_BUCKET?: string }).STORAGE_BUCKET;
    if (!bucket) return;
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const region = (env as unknown as { S3_REGION?: string }).S3_REGION ?? "us-east-1";
    const client = new S3Client({ region });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    return;
  }
  try { await unlink(storageKey.includes("/") ? storageKey : join(getUploadsDir(), storageKey)); } catch {}
}

export async function fileExists(storageKey: string): Promise<boolean> {
  try {
    const dir = getUploadsDir();
    const full = storageKey.includes("/") ? storageKey : join(dir, storageKey);
    await stat(full);
    return true;
  } catch { return false; }
}
`,
    ),
  ];
}
