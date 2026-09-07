import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Mode = ProjectConfig["mode"];
type Framework = ProjectConfig["framework"];
type Database = ProjectConfig["database"];

function config(
  mode: Mode,
  framework: Framework,
  database: Database,
  email: boolean,
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "auth-ownership-boundary",
    runtime: "bun",
    mode,
    framework,
    database,
    preset: "saas",
    auth: true,
    api: true,
    email,
    billing: [],
    features: [],
    apps: ["web"],
  });
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

function authPolicySource(
  files: ReturnType<typeof generateProjectFiles>,
  mode: Mode,
  database: Database,
): string {
  if (database === "convex") return content(files, "convex/auth.ts");
  return content(
    files,
    mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts",
  );
}

function expectAccountLinkingPolicy(
  source: string,
  label: string,
  expected: "trusted-verified" | "disabled",
): void {
  const match = source.match(/accountLinking:\s*\{([\s\S]*?)\n\s*\},/);
  expect(match, `${label}: accountLinking block`).not.toBeNull();
  const policy = match?.[1] ?? "";

  expect(policy, label).toContain("requireLocalEmailVerified: true");
  if (expected === "trusted-verified") {
    expect(policy, label).toMatch(/\benabled:\s*true,/);
    expect(policy, label).toContain('trustedProviders: ["google", "github"]');
    expect(policy, label).not.toContain("disableImplicitLinking: true");
    return;
  }

  expect(policy, label).toMatch(/\benabled:\s*false,/);
  expect(policy, label).toContain("disableImplicitLinking: true");
  expect(policy, label).not.toContain("trustedProviders:");
}

describe("generated account pre-hijack boundary", () => {
  test("requires verified password ownership before trusted OAuth linking in every Postgres layout", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const email of [true, false] as const) {
          const label = `${mode}/${framework}/postgres/email-${email ? "on" : "off"}`;
          const files = generateProjectFiles(config(mode, framework, "postgres", email));
          const source = authPolicySource(files, mode, "postgres");

          if (email) {
            expect(source, label).toContain("requireEmailVerification: true");
            expect(source, label).toContain("emailVerification: {");
            expect(source, label).toContain("sendVerificationEmail:");
            expectAccountLinkingPolicy(source, label, "trusted-verified");
          } else {
            expect(source, label).toContain("enabled: false");
            expect(source, label).not.toContain("requireEmailVerification: false");
            expect(source, label).not.toContain("emailVerification: {");
            expect(source, label).not.toContain("sendVerificationEmail:");
            expectAccountLinkingPolicy(source, label, "disabled");
          }
        }
      }
    }
  });

  test("keeps Convex linking disabled while making password ownership capability-aware", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const email of [true, false] as const) {
          const label = `${mode}/${framework}/convex/email-${email ? "on" : "off"}`;
          const files = generateProjectFiles(config(mode, framework, "convex", email));
          const source = authPolicySource(files, mode, "convex");

          if (email) {
            expect(source, label).toContain("requireEmailVerification: true");
            expect(source, label).toContain("sendVerificationEmail:");
            expect(
              files.some(({ path }) => path === "convex/authEmail.ts"),
              label,
            ).toBe(true);
          } else {
            expect(source, label).toContain("emailAndPassword: { enabled: false }");
            expect(source, label).not.toContain("requireEmailVerification: false");
            expect(source, label).not.toContain("sendVerificationEmail:");
            expect(
              files.some(({ path }) => path === "convex/authEmail.ts"),
              label,
            ).toBe(false);
          }
          expectAccountLinkingPolicy(source, label, "disabled");
        }
      }
    }
  });

  test("disables stock organization writes in every Postgres auth configuration", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const email of [true, false] as const) {
          const label = `${mode}/${framework}/email-${email ? "on" : "off"}`;
          const files = generateProjectFiles(config(mode, framework, "postgres", email));
          const source = authPolicySource(files, mode, "postgres");

          expect(source, label).toContain("organization({");
          expect(source, label).toMatch(/allowUserToCreateOrganization:\s*false/);
          expect(source, label).toMatch(/disableOrganizationDeletion:\s*true/);
          expect(source, label).not.toMatch(/allowUserToCreateOrganization:\s*true/);
          expect(source, label).not.toMatch(/disableOrganizationDeletion:\s*false/);
        }
      }
    }
  });
});
