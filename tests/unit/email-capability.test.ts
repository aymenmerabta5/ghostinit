import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const EMAIL_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    ([false, true] as const).map((email) => ({
      key: `${mode}/${framework}/email-${email ? "on" : "off"}`,
      mode,
      framework,
      email,
      files: generateProjectFiles(
        projectConfigSchema.parse({
          name: "demo",
          mode,
          framework,
          preset: "custom",
          auth: true,
          api: true,
          email,
          analytics: false,
          database: "postgres",
          billing: [],
          apps: ["web"],
        }),
      ),
    })),
  ),
);

const EMAIL_DEPENDENCIES = [
  "resend",
  "@react-email/components",
  "@react-email/render",
  "@react-email/tailwind",
] as const;

describe("generated email capability", () => {
  for (const corner of EMAIL_MATRIX) {
    test(`${corner.key} follows the complete email boundary`, () => {
      const byPath = new Map(corner.files.map((file) => [file.path, file.content]));
      const read = (path: string): string => byPath.get(path) ?? "";
      const emailSendPath =
        corner.mode === "monorepo" ? "packages/email/src/send.ts" : "src/server/email/send.ts";
      const emailManifestPath =
        corner.mode === "monorepo" ? "packages/email/package.json" : "package.json";
      const authPath =
        corner.mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
      const forgotPath =
        corner.mode === "monorepo"
          ? corner.framework === "nextjs"
            ? "apps/web/src/app/forgot-password/page.tsx"
            : "apps/web/src/routes/forgot-password.tsx"
          : corner.framework === "nextjs"
            ? "src/app/forgot-password/page.tsx"
            : "src/routes/forgot-password.tsx";
      const resetPath = forgotPath.replace("forgot-password", "reset-password");
      const signInPath =
        corner.mode === "monorepo"
          ? corner.framework === "nextjs"
            ? "apps/web/src/app/sign-in/page.tsx"
            : "apps/web/src/routes/sign-in.tsx"
          : corner.framework === "nextjs"
            ? "src/app/sign-in/page.tsx"
            : "src/routes/sign-in.tsx";
      const auth = read(authPath);
      const envExample = read(".env.example");
      const envLocal = read(".env.local");
      const typedEnv = read(
        corner.mode === "monorepo" ? "packages/config/src/env.ts" : "src/lib/env.ts",
      );
      const agents = read("AGENTS.md");
      const allAgentDocs = [
        read("AGENTS.md"),
        read("CLAUDE.md"),
        read(".cursor/rules/ghostinit.mdc"),
        read(".windsurf/rules/ghostinit.md"),
      ].join("\n");

      if (corner.email) {
        const manifest = JSON.parse(read(emailManifestPath)) as {
          dependencies?: Record<string, string>;
        };
        for (const dependency of EMAIL_DEPENDENCIES) {
          expect(manifest.dependencies?.[dependency], `${corner.key}: ${dependency}`).toBeDefined();
        }
        expect(read(emailSendPath), `${corner.key}: send implementation`).not.toBe("");
        expect(auth).toContain("sendResetPassword");
        expect(auth).toContain("sendVerificationEmail");
        expect(read(forgotPath)).not.toBe("");
        expect(read(resetPath)).not.toBe("");
        expect(read(signInPath)).toContain("/forgot-password");
        expect(envExample).toContain("RESEND_API_KEY=");
        expect(envLocal).toContain("RESEND_API_KEY=");
        expect(typedEnv).toContain("RESEND_API_KEY");
        expect(typedEnv).toContain("EMAIL_FROM");
        expect(agents).toContain(corner.mode === "monorepo" ? "@repo/email" : "src/server/email");

        const send = read(emailSendPath);
        expect(send).toContain('throw new Error("RESEND_API_KEY is not configured")');
        expect(send).toContain('throw new Error(error.message ?? "Email delivery failed")');
        expect(send).toContain('throw new Error("Email provider returned no delivery ID")');
        expect(send).not.toContain("return { success: false");
        expect(send).not.toContain("sendEmailHtml");
        expect(send).toContain("replyTo: options?.replyTo");
        expect(send).toContain("cc: options?.cc");
        expect(send).toContain("bcc: options?.bcc");
        expect(
          corner.files.some(({ path }) =>
            /templates\/(?:forgot-password|verification)\.ts$/.test(path),
          ),
        ).toBe(false);
      } else {
        for (const dependency of EMAIL_DEPENDENCIES) {
          for (const path of [
            "package.json",
            "apps/web/package.json",
            "packages/auth/package.json",
          ]) {
            const source = read(path);
            if (!source) continue;
            const manifest = JSON.parse(source) as { dependencies?: Record<string, string> };
            expect(
              manifest.dependencies?.[dependency],
              `${corner.key}: ${path} -> ${dependency}`,
            ).toBeUndefined();
          }
        }
        expect(read(emailSendPath)).toBe("");
        expect(auth).not.toContain("@repo/email");
        expect(auth).not.toContain("@/server/email");
        expect(auth).not.toContain("sendResetPassword");
        expect(auth).not.toContain("sendVerificationEmail");
        expect(auth).not.toContain("magicLink(");
        expect(read(forgotPath)).toBe("");
        expect(read(resetPath)).toBe("");
        expect(read(signInPath)).not.toContain("/forgot-password");
        expect(envExample).not.toContain("RESEND_API_KEY");
        expect(envLocal).not.toContain("RESEND_API_KEY");
        expect(typedEnv).not.toContain("RESEND_API_KEY");
        expect(typedEnv).not.toContain("EMAIL_FROM");
        expect(typedEnv).not.toContain("EMAIL_FROM_NAME");
        expect(agents).not.toContain("packages/email");
        expect(agents).not.toContain("src/server/email");
        expect(agents).not.toContain("forgot-password");
        expect(agents).not.toContain("reset-password");
        expect(agents).not.toContain("send-reset-password");
        expect(agents).not.toContain("Resend");
        if (corner.mode === "monorepo") {
          for (const claim of [
            "packages/services + billing + email",
            "modules+billing+email+database",
            "packages/email",
            "@repo/email",
            "emailFiles",
            "recovery routes",
            "auth callbacks",
            "Email disabled",
          ]) {
            expect(allAgentDocs, `${corner.key}: ${claim}`).not.toContain(claim);
          }
        }
      }
    });
  }
});
