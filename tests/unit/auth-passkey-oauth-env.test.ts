import { describe, expect, it } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import { auth as authVersions } from "../../packages/versions/src/index.js";

const MODES = ["monorepo", "single"] as const;
const FRAMEWORKS = ["nextjs", "tanstack-start"] as const;

const OAUTH_PLACEHOLDERS = {
  GOOGLE_CLIENT_ID: "REPLACE_WITH_GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "REPLACE_WITH_GOOGLE_CLIENT_SECRET",
  GITHUB_CLIENT_ID: "REPLACE_WITH_GITHUB_CLIENT_ID",
  GITHUB_CLIENT_SECRET: "REPLACE_WITH_GITHUB_CLIENT_SECRET",
} as const;

function config(
  mode: (typeof MODES)[number],
  framework: (typeof FRAMEWORKS)[number],
  database: ProjectConfig["database"] = "postgres",
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "auth-contract",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database,
    apps: ["web"],
    billing: [],
    features: [],
  });
}

function content(files: TemplateFile[], path: string): string {
  const match = files.find((candidate) => candidate.path === path);
  if (!match) throw new Error(`Expected generated file: ${path}`);
  return match.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dependencies(manifest: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(manifest);
  if (!isRecord(parsed) || !isRecord(parsed.dependencies)) {
    throw new Error("Expected a package manifest with dependencies");
  }
  return parsed.dependencies;
}

describe("generated Better Auth passkey and OAuth env contracts", () => {
  for (const mode of MODES) {
    for (const framework of FRAMEWORKS) {
      it(`${mode}/${framework} keeps passkey imports, dependencies, and OAuth env aligned`, () => {
        const files = generateProjectFiles(config(mode, framework));
        const manifestPath = mode === "monorepo" ? "packages/auth/package.json" : "package.json";
        const serverPath =
          mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
        const clientPath =
          mode === "monorepo" ? "packages/auth/src/client.ts" : "src/lib/auth-client.ts";
        const manifestDependencies = dependencies(content(files, manifestPath));
        const server = content(files, serverPath);
        const client = content(files, clientPath);

        expect(manifestDependencies["@better-auth/passkey"]).toBe(
          authVersions["@better-auth/passkey"],
        );
        expect(server).toMatch(/import \{ passkey \} from ["']@better-auth\/passkey["'];/);
        expect(client).toMatch(
          /import \{ passkeyClient \} from ["']@better-auth\/passkey\/client["'];/,
        );
        expect(server).not.toMatch(
          /import \{[^}]*\bpasskey\b[^}]*\} from ["']better-auth\/plugins["'];/s,
        );
        expect(client).not.toMatch(
          /import \{[^}]*\bpasskeyClient\b[^}]*\} from ["']better-auth\/client\/plugins["'];/s,
        );
        expect(server).toMatch(
          /import type \{ Auth as BetterAuthServer \} from ["']better-auth["'];/,
        );
        expect(server).toContain("type BetterAuthOptions");
        expect(server).toContain("type PortableAuthOptions = BetterAuthOptions");
        expect(server).toContain("interface AdminCreationAuthContext");
        expect(server).toContain(
          'export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api">',
        );
        expect(server).toContain("const configuredAuth = betterAuth({");
        expect(server).toContain("export const auth: Auth = configuredAuth;");
        expect(server).not.toContain("export const auth = betterAuth({");
        expect(server).toMatch(
          /type PortableAuthOptions\s*=\s*BetterAuthOptions\s*&\s*\{\s*plugins:\s*\[AdminPlugin\]\s*;?\s*\}/,
        );
        expect(server).not.toMatch(
          /(?:\bas\s+|:\s*)(?:(?:readonly\s+)?BetterAuthPlugin\s*\[\]|(?:Readonly)?Array\s*<\s*BetterAuthPlugin\s*>)/,
        );
        if (mode === "monorepo") {
          expect(server).toContain("type AppAdminOptions = {");
          expect(server).toContain("type AdminPlugin = ReturnType<typeof admin<AppAdminOptions>>");
        } else {
          expect(server).toContain("type AdminPlugin = ReturnType<typeof admin<AdminOptions>>");
        }

        if (mode === "monorepo") {
          const serverSchema = content(files, "packages/config/src/server-schema.ts");
          const runtimeEnv = content(files, "packages/config/src/server.ts");
          const clientSchema = content(
            files,
            framework === "nextjs" ? "packages/config/src/next.ts" : "packages/config/src/vite.ts",
          );

          for (const [key, placeholder] of Object.entries(OAUTH_PLACEHOLDERS)) {
            expect(serverSchema).toContain(`${key}: z.string().min(1).default("${placeholder}")`);
            expect(clientSchema).not.toContain(key);
            expect(runtimeEnv).toContain(`${key}: process.env.${key}`);
            expect(clientSchema).not.toContain(key);
          }

          const expectedPublicAppUrl =
            framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "VITE_APP_URL";
          const otherPublicAppUrl = framework === "nextjs" ? "VITE_APP_URL" : "NEXT_PUBLIC_APP_URL";
          expect(clientSchema).toContain(expectedPublicAppUrl);
          expect(clientSchema).not.toContain(otherPublicAppUrl);
        }

        for (const [key, placeholder] of Object.entries(OAUTH_PLACEHOLDERS)) {
          expect(content(files, ".env.example")).toContain(`${key}=${placeholder}`);
          expect(content(files, ".env.local")).toContain(`${key}=${placeholder}`);
        }
      });
    }
  }

  for (const framework of FRAMEWORKS) {
    it(`monorepo/${framework}/convex does not install an unused passkey package`, () => {
      const files = generateProjectFiles(config("monorepo", framework, "convex"));
      const authManifest = dependencies(content(files, "packages/auth/package.json"));
      const server = content(files, "packages/auth/src/server.ts");
      const client = content(files, "packages/auth/src/client.ts");

      expect(authManifest["@better-auth/passkey"]).toBeUndefined();
      expect(server).not.toContain("@better-auth/passkey");
      expect(client).not.toContain("@better-auth/passkey");
      expect(client).not.toContain("passkeyClient");
    });
  }
});
