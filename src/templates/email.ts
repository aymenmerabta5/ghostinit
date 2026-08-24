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
  return `import { env } from "@/lib/env";

export const EMAIL_FROM = env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = \`\${EMAIL_FROM_NAME} <\${EMAIL_FROM}>\`;
export const RESEND_API_KEY = env.RESEND_API_KEY;
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
    : `import { env } from "@/lib/env";`;
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

export async function sendEmail<T extends object>(
  to: string | string[],
  subject: string,
  EmailComponent: React.ComponentType<T>,
  componentProps: T & React.Attributes,
  options?: SendEmailOptions,
): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.includes("REPLACE_WITH")) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const html = await render(React.createElement(EmailComponent, componentProps));
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: options?.from ?? env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });
  if (error) throw new Error(error.message ?? "Email delivery failed");
  if (!data?.id) throw new Error("Email provider returned no delivery ID");
  return { id: data.id };
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
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
