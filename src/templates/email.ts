import {
  codeScripts,
  file,
  packageJson,
  tsconfig,
  normalizeTemplateArgs,
  type TemplateFile,
} from "./shared.js";
import * as v from "./versions.js";
import type { AddonInstallerMap, ProjectMode } from "../lib/addons.js";

type Runtime = "node" | "bun";

/* ------------------------------------------------------------------ */
/* Shared fragments — DRY across modes                                 */
/* ------------------------------------------------------------------ */

function constantsContent(mode: ProjectMode): string {
  if (mode === "monorepo") {
    return `import { env } from "@repo/config";

export const EMAIL_FROM = env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = \`\${EMAIL_FROM_NAME} <\${EMAIL_FROM}>\`;
export const RESEND_API_KEY = env.RESEND_API_KEY;
`;
  }
  return `export const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME ?? process.env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = \`\${EMAIL_FROM_NAME} <\${EMAIL_FROM}>\`;
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
`;
}

function indexContent(mode: ProjectMode): string {
  const envRef = mode === "monorepo" ? "env.RESEND_API_KEY" : "process.env.RESEND_API_KEY";
  const importEnv = mode === "monorepo" ? 'import { env } from "@repo/config";\n\n' : "";
  const resendArg = mode === "monorepo" ? "env.RESEND_API_KEY" : 'process.env.RESEND_API_KEY ?? ""';
  return `import { Resend } from "resend";
${importEnv}if (!${envRef} || ${envRef}.includes("REPLACE_WITH")) {
  console.warn("[ghostinit] RESEND_API_KEY is not set. Emails will fail until configured.");
}

export const resend = new Resend(${resendArg});

export { sendEmail, type SendEmailInput, type SendEmailResult } from "./send.js";
export { forgotPasswordTemplate, type ForgotPasswordEmailProps } from "./templates/forgot-password.js";
export {
  resetPasswordConfirmationTemplate,
  type ResetPasswordConfirmationProps,
} from "./templates/reset-password.js";
export {
  EMAIL_FROM,
  EMAIL_FROM_NAME,
  EMAIL_FROM_FORMATTED,
  RESEND_API_KEY,
} from "./constants.js";
`;
}

const sharedSend = `import { resend } from "./index.js";
import { EMAIL_FROM_FORMATTED } from "./constants.js";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  text?: string;
}

export interface SendEmailResult {
  id: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  const from = input.from ?? EMAIL_FROM_FORMATTED;
  const to = Array.isArray(input.to) ? input.to : [input.to];

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
  });

  if (error) {
    throw new Error(error.message ?? "Failed to send email");
  }

  return data as SendEmailResult | null;
}
`;

const forgotPasswordTemplateContent = `export interface ForgotPasswordEmailProps {
  url: string;
  token?: string;
  appName?: string;
  email?: string;
}

export function forgotPasswordTemplate(props: ForgotPasswordEmailProps): string;
export function forgotPasswordTemplate(url: string, appName?: string): string;
export function forgotPasswordTemplate(
  arg1: ForgotPasswordEmailProps | string,
  arg2?: string,
): string {
  const props: ForgotPasswordEmailProps =
    typeof arg1 === "string" ? { url: arg1, appName: arg2 } : arg1;
  const { url, appName = "GhostInit" } = props;

  return \`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#0f172a;line-height:28px;">Reset your password</h1>
                <p style="margin:0;font-size:14px;color:#475569;line-height:20px;">You requested a password reset for \${appName}. Click the button below to choose a new password. This link expires in 1 hour and can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <a href="\${url}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">Reset password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;line-height:18px;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0;word-break:break-all;font-size:13px;line-height:18px;"><a href="\${url}" style="color:#0f172a;text-decoration:underline;">\${url}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:16px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">\${appName}</p>
        </td>
      </tr>
    </table>
  </body>
</html>\`;
}

export const forgotPasswordHtml = forgotPasswordTemplate;
`;

const resetPasswordTemplateContent = `export interface ResetPasswordConfirmationProps {
  appName?: string;
  email?: string;
}

export function resetPasswordConfirmationTemplate(
  props: ResetPasswordConfirmationProps = {},
): string {
  const { appName = "GhostInit" } = props;
  return \`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password reset successful</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#0f172a;">Password reset successful</h1>
                <p style="margin:0;font-size:14px;color:#475569;line-height:20px;">Your password for \${appName} has been changed successfully. You can now sign in with your new password.</p>
                <p style="margin:16px 0 0 0;font-size:13px;color:#64748b;">If you did not perform this action, please contact support immediately and secure your account.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated message from \${appName}, please do not reply.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>\`;
}
`;

export function emailFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, runtime } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const testCmd = runtime === "bun" ? "bun test" : "npm run test:unit";

  const files: TemplateFile[] = [];

  if (mode === "monorepo") {
    files.push(
      file(
        "packages/email/package.json",
        packageJson({
          name: "@repo/email",
          type: "module",
          scripts: codeScripts({ test: testCmd }),
          exports: {
            ".": "./src/index.ts",
          },
          dependencies: {
            resend: `^${v.email.resend}`,
            "@repo/config": "workspace:*",
          },
          devDependencies: {
            "@types/node": `^${v.runtime["@types/node"]}`,
            typescript: `^${v.typescript.typescript}`,
            oxlint: `^${v.tooling.oxlint}`,
            oxfmt: `^${v.tooling.oxfmt}`,
          },
        }),
      ),
      file("packages/email/tsconfig.json", tsconfig({ include: ["src/**/*"] })),
      file("packages/email/src/constants.ts", constantsContent("monorepo")),
      file("packages/email/src/index.ts", indexContent("monorepo")),
      file("packages/email/src/send.ts", sharedSend),
      file("packages/email/src/templates/forgot-password.tsx", forgotPasswordTemplateContent),
      file("packages/email/src/templates/reset-password.tsx", resetPasswordTemplateContent),
    );
  } else {
    // Single mode — src/server/email/
    files.push(
      file("src/server/email/constants.ts", constantsContent("single")),
      file("src/server/email/index.ts", indexContent("single")),
      file("src/server/email/send.ts", sharedSend),
      file("src/server/email/templates/forgot-password.tsx", forgotPasswordTemplateContent),
      file("src/server/email/templates/reset-password.tsx", resetPasswordTemplateContent),
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
