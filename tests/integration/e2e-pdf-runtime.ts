import { expect } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import { runCommand } from "./e2e-build-process.js";

export async function verifyPdfNextPreload(projectRoot: string): Promise<void> {
  const appRoot = existsSync(join(projectRoot, "next.config.ts"))
    ? projectRoot
    : join(projectRoot, "apps/web");
  const source = `
await import("next");
const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { Document, Page, Text, renderToBuffer } = await import("@react-pdf/renderer");
const document = createElement(Document, null, createElement(Page, null, createElement(Text, null, "PDF runtime proof")));
const bytes = await renderToBuffer(document);
console.log(JSON.stringify({ header: bytes.subarray(0, 5).toString(), bytes: bytes.length, reactSsr: renderToString(createElement("p", null, "React runtime proof")) }));
`;
  const result = await runCommand(
    process.execPath,
    ["--preload", "@react-pdf/renderer", "-e", source],
    appRoot,
    30_000,
    { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  );
  expect(result.timedOut, "PDF preload terminates within its runtime budget").toBe(false);
  expect(result.exitCode, result.stderr).toBe(0);
  const proof = JSON.parse(result.stdout.trim()) as {
    header: string;
    bytes: number;
    reactSsr: string;
  };
  expect(proof.header).toBe("%PDF-");
  expect(proof.bytes).toBeGreaterThan(1_000);
  expect(proof.reactSsr).toBe("<p>React runtime proof</p>");
}

export async function verifyAuthenticatedPdfTemplates(
  origin: string,
  environment: NodeJS.ProcessEnv,
  onAuthenticated?: (cookie: string) => Promise<void>,
): Promise<void> {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).hostname !== "127.0.0.1") {
    throw new Error("PDF acceptance requires the isolated loopback PostgreSQL fixture");
  }
  if (new URL(origin).hostname !== "127.0.0.1") {
    throw new Error("PDF acceptance requires a loopback application origin");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const id = randomUUID();
  const email = `pdf-${id}@ghostinit.example`;
  const password = randomBytes(32).toString("base64url");
  try {
    await pool.query(
      "insert into users (id,name,email,email_verified,role,banned) values ($1,'PDF Fixture',$2,true,'user',false)",
      [id, email],
    );
    await pool.query(
      "insert into accounts (id,account_id,provider_id,user_id,password) values ($1,$2,'credential',$2,$3)",
      [randomUUID(), id, await hashPassword(password)],
    );
    const login = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(30_000),
    });
    expect(login.status, "PDF fixture authenticates through the generated API").toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    await login.body?.cancel();
    expect(cookie.length > 0, "PDF fixture receives a session cookie").toBe(true);
    await onAuthenticated?.(cookie);
    const issuedAt = new Date().toISOString();
    const templates = [
      {
        template: "invoice",
        locale: "en",
        data: {
          invoiceNumber: "INV-E2E-001",
          issuedAt,
          from: { name: "GhostInit QA" },
          to: { name: "Local Fixture" },
          items: [{ description: "Runtime proof", quantity: 1, unitPrice: 49 }],
          currency: "USD",
        },
      },
      {
        template: "certificate",
        locale: "fr",
        data: {
          recipientName: "Destinataire local",
          issuerName: "GhostInit QA",
          reason: "Vérification du rendu français",
          issuedAt,
        },
      },
      {
        template: "agreement",
        locale: "ar",
        data: {
          title: "اتفاقية اختبار",
          parties: [
            { name: "GhostInit QA", roleLabel: "Provider" },
            { name: "Local Fixture", roleLabel: "Customer" },
          ],
          effectiveDate: issuedAt,
          terms: ["اختبار توليد ملف باللغة العربية"],
        },
      },
    ];
    for (const input of templates) {
      const response = await fetch(`${origin}/api/pdf`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, cookie },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000),
      });
      expect(response.status, `Generated ${input.template}/${input.locale} PDF API`).toBe(200);
      const body = (await response.json()) as { pdfBase64?: unknown };
      expect(typeof body.pdfBase64).toBe("string");
      const bytes = Buffer.from(body.pdfBase64 as string, "base64");
      expect(bytes.length).toBeGreaterThan(1_000);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(bytes.subarray(-150).toString()).toContain("%%EOF");
    }
  } finally {
    try {
      await pool.query("delete from users where id=$1", [id]);
    } finally {
      await pool.end();
    }
  }
}
