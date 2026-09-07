import { randomBytes } from "node:crypto";
import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SecretMaterializationReceipt,
  SecretMaterializerPort,
} from "../application/ports/secret-materializer.js";
import type { SelfIssuedSecretOperation } from "../domain/generation/types.js";
import { FsTransaction } from "../lib/fs.js";

export type SecretEntropy = (bytes: number, encoding: "base64url" | "hex") => string;

function defaultEntropy(bytes: number, encoding: "base64url" | "hex"): string {
  return randomBytes(bytes).toString(encoding);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDotenv(content: string, field: string, value: string, path: string): string {
  const pattern = new RegExp(`^${escapeRegExp(field)}=.*$`, "m");
  if (!pattern.test(content)) {
    throw new Error(`Secret destination ${path} is missing ${field}`);
  }
  return content.replace(pattern, `${field}=${value}`);
}

function replaceJsonField(content: string, field: string, value: string, path: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Secret destination ${path} is not valid JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Secret destination ${path} must contain a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, field)) {
    throw new Error(`Secret destination ${path} is missing JSON field ${field}`);
  }
  record[field] = value;
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Filesystem adapter invoked only after candidate installation and verification. */
export class FileSecretMaterializer implements SecretMaterializerPort {
  readonly #root: string;
  readonly #entropy: SecretEntropy;

  constructor(root: string, entropy: SecretEntropy = defaultEntropy) {
    this.#root = root;
    this.#entropy = entropy;
  }

  async materialize(
    operations: readonly SelfIssuedSecretOperation[],
  ): Promise<SecretMaterializationReceipt> {
    const contentByPath = new Map<string, string>();
    const touched = new Set<string>();
    const tx = new FsTransaction(this.#root);
    try {
      for (const operation of operations) {
        const value = this.#entropy(operation.bytes, operation.encoding);
        for (const destination of operation.destinations) {
          let content = contentByPath.get(destination.physicalPath);
          if (content === undefined) {
            content = await readFile(
              join(this.#root, ...destination.physicalPath.split("/")),
              "utf8",
            );
          }
          content =
            destination.format === "dotenv"
              ? replaceDotenv(content, destination.field, value, destination.physicalPath)
              : replaceJsonField(content, destination.field, value, destination.physicalPath);
          contentByPath.set(destination.physicalPath, content);
          touched.add(destination.physicalPath);
        }
      }
      for (const [path, content] of contentByPath) await tx.write(path, content);
      await tx.commit();
      // Secret-bearing local files are owner-only where the platform supports
      // POSIX permission bits. Failure is surfaced rather than silently leaving
      // a broader mode behind.
      await Promise.all(
        [...touched].map((path) => chmod(join(this.#root, ...path.split("/")), 0o600)),
      );
      return { references: operations.map(({ reference }) => reference).sort() };
    } catch (error) {
      // Never hide partial compensation: FsRollbackError contains the paths an
      // operator must recover and therefore supersedes the materialization
      // error when rollback itself cannot complete.
      await tx.rollback();
      throw error;
    }
  }
}
