import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const filesConfig = projectConfigSchema.parse({
  name: "demo",
  runtime: "bun",
  version: "0.1.0",
  mode: "single",
  billing: ["stripe"],
  features: [],
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
});
const files = generateProjectFiles(filesConfig);
const read = (path: string): string => files.find((file) => file.path === path)?.content ?? "";

describe("single Next boundary contracts", () => {
  test("uses local typed env for flags", () => {
    const server = read("src/lib/feature-flags.ts");
    const client = read("src/lib/feature-flags-client.ts");
    expect(server).toContain('from "@/lib/env"');
    expect(server).toContain('env.ANALYTICS_DISABLED !== "true"');
    expect(client).toContain('from "@/lib/env"');
    expect(client).toContain('env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true"');
    expect(`${server}\n${client}`).not.toContain("as unknown as");
  });

  test("TanStack client flags use only the VITE public key", () => {
    const tanstackFiles = generateProjectFiles(
      projectConfigSchema.parse({
        ...filesConfig,
        framework: "tanstack-start",
      }),
    );
    const client =
      tanstackFiles.find(({ path }) => path === "src/lib/feature-flags-client.ts")?.content ?? "";
    expect(client).toContain('env.VITE_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain("NEXT_PUBLIC_ANALYTICS_DISABLED");

    const manifest = JSON.parse(
      tanstackFiles.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@t3-oss/env-core"]).toBeDefined();
    expect(manifest.dependencies?.["@t3-oss/env-nextjs"]).toBeUndefined();
  });

  test("auth sends the typed ResetPassword component", () => {
    const source = read("src/server/auth/index.ts");
    expect(source).toContain(
      'import ResetPasswordEmail from "@/server/email/templates/ResetPassword"',
    );
    expect(source).toContain("await sendEmail(user.email, subject, ResetPasswordEmail,");
    expect(source).not.toContain("forgotPasswordTemplate");
    expect(read("src/server/email/send.ts")).not.toContain("sendEmailHtml");
  });

  test("does not emit unused Motion output or workspace aliases", () => {
    expect(read("src/lib/animations.ts")).toBe("");
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.values(manifest.dependencies ?? {})).not.toContain("workspace:*");
    expect(Object.values(manifest.devDependencies ?? {})).not.toContain("workspace:*");
  });
});
