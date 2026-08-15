import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";
import { resultImportForMode } from "./shared.js";

const sharedEmailIndex = `export { sendResetPasswordEmailService } from "./send-reset-password.service.js";
export type { SendResetPasswordInput, EmailProviderPort, SendResetPasswordDeps, SendResetPasswordOutput } from "./send-reset-password.service.js";
`;

export function emailSendResetContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `import "server-only";\n${resultImport}
export interface SendResetPasswordInput { email: string; resetUrl: string; }
export interface EmailProviderPort { sendEmail(to: string, subject: string, html: string): Promise<{ id: string }>; }
export interface SendResetPasswordDeps { emailProvider: EmailProviderPort; }
export type SendResetPasswordOutput = Result<{ emailId: string }, Error>;
export async function sendResetPasswordEmailService(input: SendResetPasswordInput, deps: SendResetPasswordDeps): Promise<SendResetPasswordOutput> {
  try { const result = await deps.emailProvider.sendEmail(input.email, "Reset password", \`<a href="\${input.resetUrl}">Reset</a>\`); return ok({ emailId: result.id }); } catch (e) { return err(e instanceof Error ? e : new Error(String(e))); }
}
`;
}

export function emailServiceFiles(mode: ProjectMode): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/services/src" : "src/server/services";
  return [
    file(`${base}/email/index.ts`, sharedEmailIndex),
    file(`${base}/email/send-reset-password.service.ts`, emailSendResetContent(mode)),
  ];
}
