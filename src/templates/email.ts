// @allow-long 416: email package + React Email templates + Resend wiring
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

function indexContent(_mode: ProjectMode): string {
  return `export { sendEmail } from "./send.js";
export type { SendEmailOptions } from "./send.js";
export { default as EmailLayout } from "./templates/EmailLayout.js";
export { default as VerifyEmail } from "./templates/VerifyEmail.js";
export { default as ResetPasswordEmail } from "./templates/ResetPassword.js";
export { default as WelcomeEmail } from "./templates/Welcome.js";
export { default as MagicLinkEmail } from "./templates/MagicLink.js";
export {
  EMAIL_FROM,
  EMAIL_FROM_NAME,
  EMAIL_FROM_FORMATTED,
  RESEND_API_KEY,
} from "./constants.js";
`;
}

// React Email + Resend sending mechanism — copied/adapted from licence-last/src/server/email
// Same for monorepo/single and for Next/TanStack — server-only email is framework-agnostic.
function sendContent(mode: ProjectMode): string {
  const isMonorepo = mode === "monorepo";
  const envImport = isMonorepo
    ? `import { env } from "@repo/config";`
    : `const env = {
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "noreply@example.com",
} as const;`;
  const fromRef = isMonorepo ? `env.EMAIL_FROM` : `env.EMAIL_FROM`;
  const apiKeyRef = isMonorepo ? `env.RESEND_API_KEY` : `env.RESEND_API_KEY`;
  // Single mode stays plain node; monorepo can use server-only guard when available.
  const serverOnlyImport = isMonorepo ? `import "server-only";\n` : ``;
  return `${serverOnlyImport}import * as React from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
${envImport}

export interface SendEmailOptions {
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export async function sendEmail<T>(
  to: string | string[],
  subject: string,
  EmailComponent: React.ComponentType<T>,
  componentProps: T,
  options?: SendEmailOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!${apiKeyRef} || ${apiKeyRef}.includes("REPLACE_WITH")) {
      console.warn("[ghostinit] RESEND_API_KEY not configured — skipping email delivery");
      return { success: false, error: "Email not configured" };
    }
    const resend = new Resend(${apiKeyRef});
    const html = await render(React.createElement(EmailComponent as React.ElementType, componentProps));
    const from = options?.from ?? ${fromRef};
    if (!from) throw new Error("EMAIL_FROM is not configured");
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      replyTo: options?.replyTo,
      cc: options?.cc,
      bcc: options?.bcc,
    });
    if (error) {
      console.error("[ghostinit] Resend API error", error);
      throw new Error(\`Email sending failed: \${(error as { message?: string }).message ?? "unknown"}\`);
    }
    if (!data) throw new Error("Email sending failed: No response data");
    console.info("[ghostinit] Email sent", { to, subject, id: (data as { id?: string }).id });
    return { success: true };
  } catch (error) {
    console.error("[ghostinit] Error sending email", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Legacy html-string helper for callers that already have html (kept for back-compat with auth.ts string templates)
export async function sendEmailHtml(
  to: string | string[],
  subject: string,
  html: string,
  options?: SendEmailOptions,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!${apiKeyRef} || ${apiKeyRef}.includes("REPLACE_WITH")) {
      console.warn("[ghostinit] RESEND_API_KEY not configured — skipping email delivery");
      return { success: false, error: "Email not configured" };
    }
    const resend = new Resend(${apiKeyRef});
    const from = options?.from ?? ${fromRef};
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      replyTo: options?.replyTo,
      cc: options?.cc,
      bcc: options?.bcc,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Resend error");
    if (!data) throw new Error("No response data");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
`;
}

// EmailLayout — Tailwind + pixelBasedPreset, same for Next/TanStack/single (copied from licence-last EmailLayout)
const emailLayoutContent = `import { Body, Container, Head, Html } from "@react-email/components";
import type { TailwindConfig } from "@react-email/tailwind";
import { Tailwind, pixelBasedPreset } from "@react-email/tailwind";
import type { ReactNode } from "react";

const tailwindConfig: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        background: "#f9f6f1",
        foreground: "#0a0a0a",
        card: "#f9f6f1",
        cardForeground: "#0a0a0a",
        primary: "#d33d00",
        primaryForeground: "#f9f6f1",
        secondary: "#0a0a0a",
        secondaryForeground: "#f9f6f1",
        muted: "#efebe2",
        mutedForeground: "#6a6560",
        accent: "#efebe2",
        accentForeground: "#0a0a0a",
        destructive: "#e7000f",
        border: "#e1deda",
      },
    },
  },
};

export default function EmailLayout({ children, title = "GhostInit" }: { children: ReactNode; title?: string }) {
  return (
    <Html>
      <Head>
        <title>{title}</title>
      </Head>
      <Tailwind config={tailwindConfig}>
        <Body className="bg-background text-foreground">
          <Container className="mx-auto max-w-2xl px-6 py-10">{children}</Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export { tailwindConfig };
`;

const verifyEmailContent = `import { Button, Heading, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout.js";

export default function VerifyEmail({ link, appName = "GhostInit" }: { link: string; appName?: string }) {
  return (
    <EmailLayout title={\`Verify your email — \${appName}\`}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          Verify your email
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          Thanks for signing up! Please verify your email address by clicking the button below.
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>
          Verify Email
        </Button>
        <Text className="text-mutedForeground mt-6 text-sm">If you didn&apos;t create an account, you can safely ignore this email.</Text>
        <Text className="text-mutedForeground mt-2 text-xs break-all">
          <a href={link} className="text-foreground underline">
            {link}
          </a>
        </Text>
      </Section>
    </EmailLayout>
  );
}
`;

const resetPasswordContent = `import { Button, Heading, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout.js";

export default function ResetPasswordEmail({ link, appName = "GhostInit" }: { link: string; appName?: string }) {
  return (
    <EmailLayout title={\`Reset your password — \${appName}\`}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          Reset your password
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          We received a request to reset your password. If you didn&apos;t make this request, you can safely ignore this email.
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>
          Reset Password
        </Button>
        <Text className="text-mutedForeground mt-6 text-sm">This link will expire in 1 hour for security reasons.</Text>
        <Text className="text-mutedForeground mt-2 text-xs break-all">
          <a href={link} className="text-foreground underline">
            {link}
          </a>
        </Text>
      </Section>
    </EmailLayout>
  );
}
`;

const welcomeContent = `import { Button, Heading, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout.js";

export default function WelcomeEmail({ appName = "GhostInit", name, dashboardUrl = "/dashboard" }: { appName?: string; name?: string; dashboardUrl?: string }) {
  return (
    <EmailLayout title={\`Welcome to \${appName}\`}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          Welcome{name ? \`, \${name}\` : ""}!
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          Your account for {appName} is ready. You can now sign in, enable 2FA, and manage your workspace.
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={dashboardUrl}>
          Go to Dashboard
        </Button>
      </Section>
    </EmailLayout>
  );
}
`;

// Backwards-compat string templates kept as wrappers around React Email render — ensures auth.ts still works if it passes html
const magicLinkContent = `import { Button, Heading, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout.js";

export default function MagicLinkEmail({ link, appName = "GhostInit" }: { link: string; appName?: string }) {
  return (
    <EmailLayout title={\`Sign in — \${appName}\`}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">Sign in with magic link</Heading>
        <Text className="text-mutedForeground mb-6 text-base">Click below to sign in to {appName}. This link expires in 15 minutes and can only be used once.</Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>Sign in</Button>
        <Text className="text-mutedForeground mt-2 text-xs break-all"><a href={link} className="text-foreground underline">{link}</a></Text>
      </Section>
    </EmailLayout>
  );
}
`;

const legacyForgotWrapper = `import { render } from "@react-email/render";
import * as React from "react";
import ResetPasswordEmail from "./ResetPassword.js";
export async function forgotPasswordTemplate(props: { url: string; appName?: string }): Promise<string> {
  return render(React.createElement(ResetPasswordEmail, { link: props.url, appName: props.appName }));
}
export type ForgotPasswordEmailProps = { url: string; token?: string; appName?: string; email?: string };
`;
const legacyVerificationWrapper = `import { render } from "@react-email/render";
import * as React from "react";
import VerifyEmail from "./VerifyEmail.js";
export async function verificationTemplate(props: { url: string; appName?: string }): Promise<string> {
  return render(React.createElement(VerifyEmail, { link: props.url, appName: props.appName }));
}
export type VerificationEmailProps = { url: string; token?: string; appName?: string; email?: string };
`;

export function emailFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, runtime } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const testCmd = runtime === "bun" ? "bun test" : "npm run test:unit";

  const emailDependencies: Record<string, string> = {
    resend: `^${v.email.resend}`,
    react: `^${v.nextStack.react}`,
    "react-dom": `^${v.nextStack["react-dom"]}`,
    "@react-email/components": `^${v.email["@react-email/components"]}`,
    "@react-email/render": `^${v.email["@react-email/render"]}`,
    "@react-email/tailwind": `^${v.email["@react-email/tailwind"]}`,
    "server-only": `^${v.runtime["server-only"]}`,
  };
  if (mode === "monorepo") {
    (emailDependencies as Record<string, string>)["@repo/config"] = "workspace:*";
  }

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
          dependencies: emailDependencies,
          devDependencies: {
            "@types/node": `^${v.runtime["@types/node"]}`,
            "@types/react": `^${v.nextStack["@types/react"]}`,
            typescript: `^${v.typescript.typescript}`,
            oxlint: `^${v.tooling.oxlint}`,
            oxfmt: `^${v.tooling.oxfmt}`,
          },
        }),
      ),
      file(
        "packages/email/tsconfig.json",
        tsconfig({
          compilerOptions: {
            jsx: "react-jsx",
            types: ["node"],
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
          include: ["src/**/*"],
        }),
      ),
      file(
        "packages/email/tests/barrel.test.ts",
        `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";

describe("@repo/email barrel", () => {
  it("loads and exposes React Email API", () => {
    expect(typeof mod.sendEmail).toBe("function");
    expect(typeof mod.EmailLayout).toBe("function");
  });
});
`,
      ),
      file("packages/email/src/constants.ts", constantsContent("monorepo")),
      file("packages/email/src/index.ts", indexContent("monorepo")),
      file("packages/email/src/send.ts", sendContent("monorepo")),
      file("packages/email/src/templates/EmailLayout.tsx", emailLayoutContent),
      file("packages/email/src/templates/VerifyEmail.tsx", verifyEmailContent),
      file("packages/email/src/templates/ResetPassword.tsx", resetPasswordContent),
      file("packages/email/src/templates/Welcome.tsx", welcomeContent),
      file("packages/email/src/templates/MagicLink.tsx", magicLinkContent),
      // Legacy string-API compat — keeps existing auth.ts imports working during migration
      file("packages/email/src/templates/forgot-password.ts", legacyForgotWrapper),
      file("packages/email/src/templates/verification.ts", legacyVerificationWrapper),
    );
  } else {
    files.push(
      file("src/server/email/constants.ts", constantsContent("single")),
      file("src/server/email/index.ts", indexContent("single")),
      file("src/server/email/send.ts", sendContent("single")),
      file("src/server/email/templates/EmailLayout.tsx", emailLayoutContent),
      file("src/server/email/templates/VerifyEmail.tsx", verifyEmailContent),
      file("src/server/email/templates/ResetPassword.tsx", resetPasswordContent),
      file("src/server/email/templates/Welcome.tsx", welcomeContent),
      file("src/server/email/templates/MagicLink.tsx", magicLinkContent),
      file("src/server/email/templates/forgot-password.ts", legacyForgotWrapper),
      file("src/server/email/templates/verification.ts", legacyVerificationWrapper),
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
