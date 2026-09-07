import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseSync } from "oxc-parser";
import {
  IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS,
  IDENTITY_PASSKEY_OPERATION_IDS,
  identityPasskeyClientCapabilityFor,
} from "../../src/domain/data-model/index.js";
import {
  getCapabilityDefinition,
  getEffectiveCapabilityClientBinding,
} from "../../src/domain/capabilities/support-catalog.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan, generateProjectFiles } from "../../src/templates/default.js";
import { identityClientAdapterContent } from "../../src/templates/apps/fragments/auth/client-adapter.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return projectConfigSchema.parse({
    name: "auth-passkey-parity",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    apps: ["web", "mobile", "desktop"],
    preset: "custom",
    auth: true,
    api: true,
    email: true,
    analytics: false,
    billing: [],
    features: [],
    ...overrides,
  });
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file: ${path}`);
  return found.content;
}

describe("passkey capability truth", () => {
  test("normalizes the five blueprint operations into versioned acceptance evidence", () => {
    expect(IDENTITY_PASSKEY_OPERATION_IDS).toEqual([
      "identity.passkey.authenticate",
      "identity.passkey.delete",
      "identity.passkey.list",
      "identity.passkey.register",
      "identity.passkey.rename",
    ]);
    expect(IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS).toEqual(
      IDENTITY_PASSKEY_OPERATION_IDS.map((operation) => `${operation}.v1`),
    );
    const auth = getCapabilityDefinition("auth");
    expect(auth.acceptanceOperationIds).toEqual(
      expect.arrayContaining([...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS]),
    );
  });

  test("supports only Postgres browser web origins and rejects every unproved binding", () => {
    for (const target of ["nextjs", "tanstack-start"] as const) {
      expect(identityPasskeyClientCapabilityFor("postgres", target)).toMatchObject({
        status: "supported",
        database: "postgres",
        target,
        operationIds: IDENTITY_PASSKEY_OPERATION_IDS,
      });
    }
    for (const [database, target] of [
      ["convex", "nextjs"],
      ["convex", "tanstack-start"],
      ["postgres", "expo"],
      ["postgres", "electron"],
      ["none", "nextjs"],
    ] as const) {
      const capability = identityPasskeyClientCapabilityFor(database, target);
      expect(capability.status, `${database}/${target}`).toBe("unsupported");
      if (capability.status === "unsupported") expect(capability.reason.length).toBeGreaterThan(20);
      expect(capability.operationIds).toEqual([]);
    }
    expect(
      getEffectiveCapabilityClientBinding({
        capability: "auth",
        database: "convex",
        target: "nextjs",
      }).requiredOperationIds,
    ).not.toEqual(expect.arrayContaining([...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS]));
  });
});

describe("generated passkey and native OAuth parity", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} Postgres web emits real passkey actions while native clients reject them`, () => {
      const files = generateProjectFiles(config({ framework }), { dryRun: true });
      const packageClient = read(files, "packages/auth/src/client.ts");
      const webClient = read(files, "apps/web/src/lib/auth-client.ts");
      const mobileClient = read(files, "apps/mobile/src/lib/auth-client.ts");
      const desktopClient = read(files, "apps/desktop/src/renderer/lib/auth.ts");
      const signIn = read(files, "apps/web/src/components/auth/sign-in-methods.tsx");
      const passkeyCard =
        framework === "nextjs"
          ? read(files, "apps/web/src/app/settings/components/passkey-card.tsx")
          : read(files, "apps/web/src/features/settings/passkey-card.tsx");
      const passkeyList =
        framework === "nextjs"
          ? read(files, "apps/web/src/app/settings/components/passkey-list.tsx")
          : read(files, "apps/web/src/features/settings/passkey-list.tsx");
      const passkeyDataAccess =
        framework === "nextjs"
          ? passkeyCard
          : `${read(files, "apps/web/src/features/settings/queries.ts")}\n${read(files, "apps/web/src/features/settings/mutations.ts")}`;

      expect(packageClient).toContain("passkeyClient()");
      for (const call of [
        "authClient.signIn.passkey()",
        "authClient.passkey.addPasskey(input)",
        "authClient.passkey.listUserPasskeys()",
        "authClient.passkey.updatePasskey(input)",
        "authClient.passkey.deletePasskey(input)",
      ]) {
        expect(webClient, call).toContain(call);
      }
      expect(signIn).toContain("identityPasskeyClient.authenticate()");
      expect(passkeyCard).toContain('<FieldLabel htmlFor="passkey-registration-name">');
      expect(passkeyCard).toContain('<Input id="passkey-registration-name"');
      expect(passkeyCard).toContain('{t("passkeys.namePlaceholder")}</FieldLabel>');
      for (const operation of ["register", "useList", "rename", "delete"])
        expect(passkeyDataAccess, operation).toContain(`identityPasskeyClient.${operation}`);
      if (framework === "tanstack-start") {
        expect(passkeyCard).not.toContain('from "@/lib/auth-client"');
        expect(passkeyCard).toContain('from "./queries"');
        expect(passkeyCard).toContain('from "./mutations"');
      }
      for (const source of [signIn, passkeyCard, passkeyList]) {
        expect(source).toContain("<Button");
        expect(source).not.toMatch(/<(?:button|input|select)\b/);
      }
      for (const [path, client] of [
        ["mobile", mobileClient],
        ["desktop", desktopClient],
      ] as const) {
        expect(client, path).toContain('"status":"unsupported"');
        expect(client, path).not.toContain("passkeyClient()");
        expect(client, path).not.toContain("authClient.passkey.");
      }
    });
  }

  test("Convex web emits an explicit passkey rejection and no passkey UI", () => {
    const files = generateProjectFiles(config({ database: "convex" }), { dryRun: true });
    const client = read(files, "apps/web/src/lib/auth-client.ts");
    expect(client).toContain('"status":"unsupported"');
    expect(client).toContain("no verified passkey schema");
    expect(client).not.toContain("authClient.passkey.");
    expect(files.some(({ path }) => path.includes("passkey-card"))).toBe(false);
    expect(read(files, "packages/auth/src/client.ts")).not.toContain("passkeyClient");
  });

  test("OAuth-only Expo and Electron expose Google and GitHub and remove password surfaces", () => {
    const files = generateProjectFiles(config({ email: false }), { dryRun: true });
    const interactivePaths = [
      "apps/mobile/app/(auth)/sign-in.tsx",
      "apps/mobile/app/(auth)/sign-up.tsx",
      "apps/desktop/src/renderer/routes/sign-in.tsx",
      "apps/desktop/src/renderer/routes/sign-up.tsx",
    ];
    for (const path of interactivePaths) {
      const source = read(files, path);
      expect(parseSync(path, source).errors, path).toEqual([]);
      expect(source, path).toContain("identityClient.signInWithOAuth");
      expect(source, path).toContain('"google"');
      expect(source, path).toContain('"github"');
      expect(source, path).toContain("<Button");
      expect(source, path).not.toMatch(/<(?:button|input|select)\b/);
      expect(source, path).not.toMatch(/authClient\.(?:signIn|signUp)\.email/);
    }

    const mobileSettings = read(files, "apps/mobile/app/settings.tsx");
    const desktopSettings = read(files, "apps/desktop/src/renderer/routes/settings.tsx");
    for (const source of [mobileSettings, desktopSettings]) {
      expect(source).not.toContain("changePassword");
      expect(source).not.toContain("twoFactor.enable");
      expect(source).not.toContain("forgot-password");
      expect(source).toContain("deleteOAuthAccount");
    }
    for (const path of ["apps/mobile/app/2fa.tsx", "apps/desktop/src/renderer/routes/2fa.tsx"])
      expect(
        files.some((entry) => entry.path === path),
        path,
      ).toBe(false);
    expect(read(files, "apps/mobile/app/_layout.tsx")).not.toContain('<Stack.Screen name="2fa"');
    expect(read(files, "apps/desktop/src/renderer/routeTree.gen.ts")).not.toContain(
      "TwoFactorRoute",
    );

    const desktopClient = read(files, "apps/desktop/src/renderer/lib/auth.ts");
    const desktopMain = read(files, "apps/desktop/src/main.ts");
    const desktopPreload = read(files, "apps/desktop/src/preload.ts");
    expect(desktopClient).toContain("disableRedirect: true");
    expect(desktopClient).toContain("authStartOAuth");
    expect(desktopMain).toContain("startDesktopOAuth");
    expect(desktopMain).toContain("session: session.defaultSession");
    expect(desktopPreload).toContain("desktop:auth-start-oauth");
  });
});

describe("passkey adapter behavior and GenerationPlan evidence", () => {
  const tempRoot = resolve(process.cwd(), `.identity-passkey-behavior-${process.pid}`);
  const modulePath = resolve(tempRoot, "adapter.ts");
  let module: Record<string, unknown>;

  beforeAll(async () => {
    await mkdir(tempRoot, { recursive: true });
    const calls = `const calls: unknown[] = [];
const ok = (data: unknown = null) => Promise.resolve({ data, error: null });
const authClient = {
  signIn: { passkey: () => { calls.push(["authenticate"]); return ok({ session: {}, user: {} }); }, email: ok, social: ok, magicLink: ok },
  signUp: { email: ok },
  passkey: {
    addPasskey: (input: unknown) => { calls.push(["register", input]); return ok({ id: "pk" }); },
    listUserPasskeys: () => { calls.push(["list"]); return ok([]); },
    updatePasskey: (input: unknown) => { calls.push(["rename", input]); return ok({ passkey: input }); },
    deletePasskey: (input: unknown) => { calls.push(["delete", input]); return ok({ status: true }); },
  },
  useListPasskeys: () => ({ data: [], error: null, refetch: async () => undefined }),
  useSession: () => ({ data: null }), requestPasswordReset: ok, resetPassword: ok,
  sendVerificationEmail: ok, updateUser: ok, changePassword: ok, deleteUser: ok,
  twoFactor: { enable: ok, verifyTotp: ok, disable: ok },
};`;
    await writeFile(
      modulePath,
      `import { z } from "zod";\n${calls}\n${identityClientAdapterContent({ database: "postgres", target: "nextjs" })}\nexport { calls };`,
      "utf8",
    );
    module = await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`);
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("forwards registration, authentication, listing, rename, and owner deletion", async () => {
    const client = Reflect.get(module, "identityPasskeyClient") as {
      authenticate(): Promise<unknown>;
      register(input: { name: string }): Promise<unknown>;
      list(): Promise<unknown>;
      rename(input: { id: string; name: string }): Promise<unknown>;
      delete(input: { id: string }): Promise<unknown>;
    };
    await client.authenticate();
    await client.register({ name: "Laptop" });
    await client.list();
    await client.rename({ id: "pk", name: "Security key" });
    await client.delete({ id: "pk" });
    expect(Reflect.get(module, "calls")).toEqual([
      ["authenticate"],
      ["register", { name: "Laptop" }],
      ["list"],
      ["rename", { id: "pk", name: "Security key" }],
      ["delete", { id: "pk" }],
    ]);
  });

  test("attributes passkey authentication to sign-in and management to settings only", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const resolved = resolveCreateConfig({
        name: "passkey-plan",
        runtime: "bun",
        mode: "monorepo",
        framework,
        billing: [],
        features: [],
        database: "postgres",
        databaseWasExplicit: true,
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withAuth: true,
        withApi: true,
      });
      if (!resolved.ok) throw new Error(resolved.message);
      const plan = buildProjectGenerationPlan(resolved.resolvedConfig, {
        desiredConfig: resolved.desiredConfig,
      });
      const signInPath =
        framework === "nextjs"
          ? "apps/web/src/app/sign-in/page.tsx"
          : "apps/web/src/routes/sign-in.tsx";
      const settingsPath =
        framework === "nextjs"
          ? "apps/web/src/app/settings/page.tsx"
          : "apps/web/src/routes/settings.tsx";
      const signIn = plan.files.find(({ physicalPath }) => physicalPath === signInPath);
      const settings = plan.files.find(({ physicalPath }) => physicalPath === settingsPath);
      expect(signIn?.provenance.acceptance).toContain("identity.passkey.authenticate.v1");
      expect(signIn?.provenance.acceptance).not.toContain("identity.passkey.delete.v1");
      expect(settings?.provenance.acceptance).toEqual(
        expect.arrayContaining([
          "identity.passkey.delete.v1",
          "identity.passkey.list.v1",
          "identity.passkey.register.v1",
          "identity.passkey.rename.v1",
        ]),
      );
      for (const target of ["expo", "electron"] as const) {
        expect(
          plan.files
            .filter(({ provenance }) => provenance.target === target)
            .flatMap(({ provenance }) => provenance.acceptance),
        ).not.toEqual(expect.arrayContaining([...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS]));
      }
    }
  });
});
