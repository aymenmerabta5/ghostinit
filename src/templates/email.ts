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
import { transactionalEmailLocaleContent } from "./i18n/transactional-email.js";

type Runtime = "node" | "bun";

/* ------------------------------------------------------------------ */
/* Shared fragments — DRY across modes                                 */
/* ------------------------------------------------------------------ */

function constantsContent(mode: ProjectMode): string {
  if (mode === "monorepo") {
    return `import "server-only";
import { env } from "@repo/config/server";

export const EMAIL_FROM = env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = \`\${EMAIL_FROM_NAME} <\${EMAIL_FROM}>\`;
export const RESEND_API_KEY = env.RESEND_API_KEY;
`;
  }
  return `import { env } from "@/lib/env/server";

export const EMAIL_FROM = env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = \`\${EMAIL_FROM_NAME} <\${EMAIL_FROM}>\`;
export const RESEND_API_KEY = env.RESEND_API_KEY;
`;
}

function templatesIndexContent(): string {
  return `export { default as EmailLayout } from "./templates/EmailLayout.js";
export { default as VerifyEmail } from "./templates/VerifyEmail.js";
export { default as ResetPasswordEmail } from "./templates/ResetPassword.js";
export { default as WelcomeEmail } from "./templates/Welcome.js";
export { default as MagicLinkEmail } from "./templates/MagicLink.js";
export {
  EMAIL_LOCALES,
  emailDirection,
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  normalizeEmailLocale,
  resolveEmailLocale,
  transactionalEmailSubject,
} from "./locale.js";
export type { EmailLocale, TransactionalEmailKind } from "./locale.js";
`;
}

function serverIndexContent(): string {
  return `import "server-only";

export { sendEmail } from "./send.js";
export type { SendEmailOptions } from "./send.js";
export { default as EmailLayout } from "./templates/EmailLayout.js";
export { default as VerifyEmail } from "./templates/VerifyEmail.js";
export { default as ResetPasswordEmail } from "./templates/ResetPassword.js";
export { default as WelcomeEmail } from "./templates/Welcome.js";
export { default as MagicLinkEmail } from "./templates/MagicLink.js";
export {
  EMAIL_LOCALES,
  emailDirection,
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  normalizeEmailLocale,
  resolveEmailLocale,
  transactionalEmailSubject,
} from "./locale.js";
export type { EmailLocale, TransactionalEmailKind } from "./locale.js";
export {
  EMAIL_FROM,
  EMAIL_FROM_NAME,
  EMAIL_FROM_FORMATTED,
  RESEND_API_KEY,
} from "./constants.js";
`;
}

function singleIndexContent(): string {
  return `export { sendEmail } from "./send.js";
export type { SendEmailOptions } from "./send.js";
${templatesIndexContent()}export {
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
    ? `import { env } from "@repo/config/server";`
    : `import { env } from "@/lib/env/server";`;
  // Single mode stays plain node; monorepo can use server-only guard when available.
  const serverOnlyImport = isMonorepo ? `import "server-only";\n` : ``;
  return `${serverOnlyImport}import * as React from "react";
import { render } from "react-email";
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
    replyTo: options?.replyTo,
    cc: options?.cc,
    bcc: options?.bcc,
  });
  if (error) throw new Error(error.message ?? "Email delivery failed");
  if (!data?.id) throw new Error("Email provider returned no delivery ID");
  return { id: data.id };
}
`;
}

// EmailLayout — Tailwind + pixelBasedPreset, same for Next/TanStack/single (copied from licence-last EmailLayout)
const emailLayoutContent = `import {
  Body,
  Container,
  Head,
  Html,
  Tailwind,
  pixelBasedPreset,
  type TailwindConfig,
} from "react-email";
import type { ReactNode } from "react";
import { emailDirection, type EmailLocale } from "../locale.js";

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

export default function EmailLayout({ children, title = "GhostInit", locale = "en" }: { children: ReactNode; title?: string; locale?: EmailLocale }) {
  return (
    <Html lang={locale} dir={emailDirection(locale)}>
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

const verifyEmailContent = `import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout.js";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale.js";

export default function VerifyEmail({ link, appName = "GhostInit", locale = "en" }: { link: string; appName?: string; locale?: EmailLocale }) {
  const copy = getTransactionalEmailCopy(locale, "verification");
  const values = { appName };
  return (
    <EmailLayout title={transactionalEmailSubject("verification", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          {copy.title}
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          {formatTransactionalEmailMessage(copy.body, values)}
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>
          {copy.action}
        </Button>
        <Text className="text-mutedForeground mt-6 text-sm">{copy.detail}</Text>
        <Text className="text-mutedForeground mt-2 text-xs">{getTransactionalEmailFallbackLink(locale)}</Text>
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

const resetPasswordContent = `import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout.js";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale.js";

export default function ResetPasswordEmail({ link, appName = "GhostInit", locale = "en" }: { link: string; appName?: string; locale?: EmailLocale }) {
  const copy = getTransactionalEmailCopy(locale, "password-reset");
  return (
    <EmailLayout title={transactionalEmailSubject("password-reset", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          {copy.title}
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          {formatTransactionalEmailMessage(copy.body, { appName })}
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>
          {copy.action}
        </Button>
        <Text className="text-mutedForeground mt-6 text-sm">{copy.detail}</Text>
        <Text className="text-mutedForeground mt-2 text-xs">{getTransactionalEmailFallbackLink(locale)}</Text>
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

const welcomeContent = `import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout.js";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale.js";

export default function WelcomeEmail({ appName = "GhostInit", name, dashboardUrl = "/dashboard", locale = "en" }: { appName?: string; name?: string; dashboardUrl?: string; locale?: EmailLocale }) {
  const copy = getTransactionalEmailCopy(locale, "welcome");
  const title = name && copy.titleWithName
    ? formatTransactionalEmailMessage(copy.titleWithName, { name })
    : copy.title;
  return (
    <EmailLayout title={transactionalEmailSubject("welcome", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          {title}
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          {formatTransactionalEmailMessage(copy.body, { appName })}
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={dashboardUrl}>
          {copy.action}
        </Button>
      </Section>
    </EmailLayout>
  );
}
`;

const magicLinkContent = `import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout.js";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale.js";

export default function MagicLinkEmail({ link, appName = "GhostInit", locale = "en" }: { link: string; appName?: string; locale?: EmailLocale }) {
  const copy = getTransactionalEmailCopy(locale, "magic-link");
  return (
    <EmailLayout title={transactionalEmailSubject("magic-link", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">{copy.title}</Heading>
        <Text className="text-mutedForeground mb-6 text-base">{formatTransactionalEmailMessage(copy.body, { appName })}</Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>{copy.action}</Button>
        <Text className="text-mutedForeground mt-6 text-sm">{copy.detail}</Text>
        <Text className="text-mutedForeground mt-2 text-xs">{getTransactionalEmailFallbackLink(locale)}</Text>
        <Text className="text-mutedForeground mt-2 text-xs break-all"><a href={link} className="text-foreground underline">{link}</a></Text>
      </Section>
    </EmailLayout>
  );
}
`;

function renderTestContent(templateImport: string, hasI18n: boolean): string {
  const locale = hasI18n ? "ar" : "en";
  const expectedTitle = hasI18n ? "تحقق من بريدك الإلكتروني" : "Verify your email";
  const rtlExpectation = hasI18n ? `    expect(html).toContain('dir="rtl"');\n` : "";
  return `import { describe, expect, it } from "bun:test";
import * as React from "react";
import { render, type TailwindConfig } from "react-email";
import VerifyEmail from "${templateImport}";

const configTypeContract = {
  presets: [],
  theme: { extend: { colors: { primary: "#d33d00" } } },
} satisfies TailwindConfig;

describe("React Email integration", () => {
  it("renders a typed template with the supported unified package", async () => {
    expect(configTypeContract.theme.extend.colors.primary).toBe("#d33d00");
    const html = await render(
      React.createElement(VerifyEmail, {
        link: "https://example.test/verify",
        appName: "GhostInit",
        locale: "${locale}",
      }),
    );

    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain(${JSON.stringify(expectedTitle)});
    expect(html).toContain("https://example.test/verify");
${rtlExpectation}
  });
});
`;
}

export function emailFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const hasI18n = typeof modeOrOpts === "object" && modeOrOpts !== null && modeOrOpts.i18n === true;
  const testCmd =
    "bun test tests/barrel.test.ts tests/render.test.ts && bun --conditions=react-server test --preload ../../scripts/test-env.ts tests/server-barrel.test.ts";

  const emailDependencies: Record<string, string> = {
    resend: `^${v.email.resend}`,
    react: `^${v.nextStack.react}`,
    "react-dom": `^${v.nextStack["react-dom"]}`,
    "react-email": `^${v.email["react-email"]}`,
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
            "./templates": "./src/index.ts",
            "./server": "./src/server.ts",
          },
          dependencies: emailDependencies,
          devDependencies: {
            "bun-types": `^${v.runtime.bun}`,
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
            types: ["bun-types", "node"],
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
          },
          include: ["src/**/*", "tests/**/*"],
        }),
      ),
      file(
        "packages/email/tests/barrel.test.ts",
        `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";

describe("@repo/email barrel", () => {
  it("loads the environment-neutral React Email template API", () => {
    expect(typeof mod.EmailLayout).toBe("function");
    expect(typeof mod.VerifyEmail).toBe("function");
    expect("sendEmail" in mod).toBe(false);
  });
});
`,
      ),
      file(
        "packages/email/tests/server-barrel.test.ts",
        `import { describe, expect, it } from "bun:test";
import * as mod from "../src/server.js";

describe("@repo/email/server barrel", () => {
  it("loads with a test-only validated server environment", () => {
    expect(typeof mod.sendEmail).toBe("function");
    expect(mod.EMAIL_FROM).toBe("noreply@example.test");
  });
});
`,
      ),
      file(
        "packages/email/tests/render.test.ts",
        renderTestContent("../src/templates/VerifyEmail.js", hasI18n),
      ),
      file("packages/email/src/constants.ts", constantsContent("monorepo")),
      file("packages/email/src/locale.ts", transactionalEmailLocaleContent(hasI18n)),
      file("packages/email/src/index.ts", templatesIndexContent()),
      file("packages/email/src/server.ts", serverIndexContent()),
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
      file("src/server/email/locale.ts", transactionalEmailLocaleContent(hasI18n)),
      file("src/server/email/index.ts", singleIndexContent()),
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
