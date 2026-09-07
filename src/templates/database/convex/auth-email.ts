/** Action-safe Better Auth email delivery for Convex deployments. */

import { transactionalEmailCatalogLiteral } from "../../i18n/transactional-email.js";

export function convexAuthEmailContent(i18nEnabled = false): string {
  const localeType = i18nEnabled ? '"en" | "fr" | "ar"' : '"en"';
  const localeValidator = i18nEnabled
    ? 'v.union(v.literal("en"), v.literal("fr"), v.literal("ar"))'
    : 'v.literal("en")';
  return `import { v } from "convex/values";
import { internalAction } from "./_generated/server";

type AuthEmailLocale = ${localeType};
type AuthEmailKind = "verification" | "password-reset" | "magic-link";

const AUTH_EMAIL_MESSAGES = ${transactionalEmailCatalogLiteral(i18nEnabled)} as const;

function requireSecret(name: "RESEND_API_KEY" | "EMAIL_FROM"): string {
  const value = process.env[name];
  if (!value || value.startsWith("REPLACE_WITH") || value.trim() === "") {
    throw new Error(\`[convex/auth-email] \${name} is not configured\`);
  }
  return value;
}

function interpolate(message: string, appName: string): string {
  return message.replaceAll("{appName}", appName);
}

function authEmailCopy(kind: AuthEmailKind, locale: AuthEmailLocale, appName: string) {
  const catalog = AUTH_EMAIL_MESSAGES[locale];
  const copy = kind === "verification"
    ? catalog.verification
    : kind === "password-reset"
      ? catalog.passwordReset
      : catalog.magicLink;
  return {
    subject: interpolate(copy.subject, appName),
    title: copy.title,
    body: interpolate(copy.body, appName),
    action: copy.action,
    detail: copy.detail,
    fallbackLink: catalog.fallbackLink,
  };
}

export const send = internalAction({
  args: {
    to: v.string(),
    kind: v.union(
      v.literal("verification"),
      v.literal("password-reset"),
      v.literal("magic-link"),
    ),
    locale: ${localeValidator},
    url: v.string(),
  },
  handler: async (_ctx, args) => {
    const parsedUrl = new URL(args.url);
    if (
      !["https:", "http:"].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error("[convex/auth-email] Refusing an unsafe callback URL");
    }
    const appName = process.env.APP_NAME?.trim() || "GhostInit";
    const copy = authEmailCopy(args.kind, args.locale, appName);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${requireSecret("RESEND_API_KEY")}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: requireSecret("EMAIL_FROM"),
        to: [args.to],
        subject: copy.subject,
        text: [
          copy.title,
          copy.body,
          copy.action + ":",
          parsedUrl.toString(),
          copy.detail,
          copy.fallbackLink,
        ].filter(Boolean).join("\\n\\n"),
      }),
    });
    if (!response.ok) {
      console.error("[convex/auth-email] Resend delivery failed", { status: response.status });
      throw new Error("[convex/auth-email] Email delivery failed");
    }
  },
});
`;
}
