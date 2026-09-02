import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { pdfFilesWithApps } from "../../src/templates/pdf/index.js";
import { requestApplicationServerContent } from "../../src/templates/services/application-server.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function loadPdfDataNormalizer(): (
  template: "invoice" | "certificate" | "agreement",
  data: unknown,
) => Record<string, unknown> {
  const route =
    pdfFilesWithApps("monorepo", false, false, "nextjs", true).find(({ path }) =>
      path.endsWith("app/api/pdf/route.ts"),
    )?.content ?? "";
  const start = route.indexOf("const MAX_PDF_REQUEST_BYTES");
  const end = route.indexOf("async function readPdfRequest");
  if (start < 0 || end <= start) throw new Error("PDF normalization helpers were not generated");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(route.slice(start, end));
  const loaded: unknown = new Function(`${javascript}; return normalizePdfData;`)();
  if (typeof loaded !== "function") throw new Error("PDF data normalizer did not compile");
  return (template, data) => {
    const result: unknown = Reflect.apply(loaded, undefined, [template, data]);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("PDF data normalizer returned a non-object");
    }
    return Object.fromEntries(Object.entries(result));
  };
}

type CreatePdfContext = (headers: Headers) => Promise<{
  user?: { id: string; banned?: boolean | null };
}>;

function loadPdfActorResolver(
  createContext: CreatePdfContext,
): (headers: Headers) => Promise<string> {
  const route =
    pdfFilesWithApps("single", false, false, "nextjs", true).find(({ path }) =>
      path.endsWith("app/api/pdf/route.ts"),
    )?.content ?? "";
  const start = route.indexOf("class PdfRequestError");
  const end = route.indexOf("function validateJsonBudget");
  if (start < 0 || end <= start) throw new Error("PDF authorization helpers were not generated");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(route.slice(start, end));
  const loaded: unknown = new Function("createContext", `${javascript}; return resolvePdfActor;`)(
    createContext,
  );
  if (typeof loaded !== "function") throw new Error("PDF actor resolver did not compile");
  return loaded as (headers: Headers) => Promise<string>;
}

function loadRequestApplicationForRequest(
  isConvex: boolean,
  auth: unknown,
  getRequestUser: () => Promise<unknown>,
  resolveIdentityActorForRequest: (input: unknown) => Promise<unknown>,
) {
  const source = requestApplicationServerContent("single", isConvex ? "convex" : "postgres", {
    admin: true,
    billing: false,
    identity: true,
    notifications: false,
  })
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, "")
    .replace(/\bexport /g, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const loaded: unknown = new Function(
    "auth",
    "getRequestUser",
    "createRequestApplication",
    "rateLimit",
    "createAdminServiceForRequest",
    "createIdentityServiceForRequest",
    "resolveIdentityActorForRequest",
    `${javascript}; return createRequestApplicationForRequest;`,
  )(
    auth,
    getRequestUser,
    (dependencies: unknown) => dependencies,
    async () => {},
    () => ({}),
    () => ({}),
    resolveIdentityActorForRequest,
  );
  if (typeof loaded !== "function")
    throw new Error("Generated request application did not compile");
  return loaded as (headers: Headers) => Promise<{
    principal: { userId: string } | null;
  }>;
}

async function pdfFailure(promise: Promise<string>): Promise<{ status: number; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
    ) {
      return { status: (error as { status: number }).status, message: error.message };
    }
    throw error;
  }
  throw new Error("Expected PDF authorization to fail");
}

describe("generated PDF admission boundary", () => {
  test("denies revoked and suspended actors before accepting a PDF body", async () => {
    let context: Awaited<ReturnType<CreatePdfContext>> = {};
    let unavailable = false;
    const resolveActor = loadPdfActorResolver(async () => {
      if (unavailable) throw new Error("identity store unavailable");
      return context;
    });

    expect(await pdfFailure(resolveActor(new Headers()))).toEqual({
      status: 401,
      message: "Unauthorized",
    });

    context = { user: { id: "suspended-user", banned: true } };
    expect(await pdfFailure(resolveActor(new Headers()))).toEqual({
      status: 403,
      message: "Suspended accounts cannot generate PDFs",
    });

    context = { user: { id: "active-user", banned: false } };
    expect(await resolveActor(new Headers())).toBe("active-user");

    unavailable = true;
    expect(await pdfFailure(resolveActor(new Headers()))).toEqual({
      status: 503,
      message: "Authentication service unavailable",
    });
  });

  test("the shared API context bypasses cookie cache and fails closed on revoked identity", async () => {
    let postgresQuery: unknown;
    let postgresRevoked = false;
    const postgresApplication = loadRequestApplicationForRequest(
      false,
      {
        api: {
          getSession: async (input: { query?: unknown }) => {
            postgresQuery = input.query;
            return {
              session: { id: "postgres-session" },
              user: {
                id: "postgres-user",
                email: "actor@example.com",
                emailVerified: true,
                banned: false,
              },
            };
          },
        },
      },
      async () => null,
      async () =>
        postgresRevoked
          ? null
          : {
              user: {
                id: "postgres-user",
                email: "actor@example.com",
                emailVerified: true,
                banned: false,
              },
              actor: { authenticatedAt: new Date() },
            },
    );
    expect((await postgresApplication(new Headers())).principal?.userId).toBe("postgres-user");
    expect(postgresQuery).toEqual({ disableCookieCache: true, disableRefresh: true });
    postgresRevoked = true;
    expect((await postgresApplication(new Headers())).principal).toBeNull();

    let convexUrl: URL | undefined;
    let convexRevoked = false;
    const convexActor = {
      _id: "convex-user",
      authId: "better-auth-user",
      email: "actor@example.com",
      emailVerified: true,
      banned: false,
    };
    const convexApplication = loadRequestApplicationForRequest(
      true,
      {
        handler: async (request: Request) => {
          convexUrl = new URL(request.url);
          return Response.json({
            session: { id: "convex-session", createdAt: new Date().toISOString() },
            user: {
              id: "better-auth-user",
              email: "actor@example.com",
              emailVerified: true,
            },
          });
        },
      },
      async () => convexActor,
      async () => (convexRevoked ? null : { authenticatedAt: new Date() }),
    );
    expect((await convexApplication(new Headers())).principal?.userId).toBe("convex-user");
    expect(convexUrl?.searchParams.get("disableCookieCache")).toBe("true");
    expect(convexUrl?.searchParams.get("disableRefresh")).toBe("true");
    convexRevoked = true;
    expect((await convexApplication(new Headers())).principal).toBeNull();
  });

  test("uses the authoritative shared session boundary across the generated database matrix", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const files = generateProjectFiles(
            projectConfigSchema.parse({
              name: `pdf-auth-${mode}-${framework}-${database}`,
              mode,
              framework,
              database,
              preset: "custom",
              auth: true,
              api: true,
              pdf: true,
              billing: [],
              apps: ["web"],
              features: [],
            }),
            { dryRun: true },
          );
          const contextPath =
            mode === "monorepo" ? "packages/api/src/context.ts" : "src/server/api/context.ts";
          const implementationPath =
            framework === "nextjs"
              ? mode === "monorepo"
                ? "apps/web/src/app/api/pdf/route.ts"
                : "src/app/api/pdf/route.ts"
              : mode === "monorepo"
                ? "apps/web/src/server/http/pdf.server.ts"
                : "src/server/http/pdf.server.ts";
          const applicationServerPath =
            mode === "monorepo"
              ? "packages/services/src/application/server.ts"
              : "src/server/services/application/server.ts";
          const context = files.find(({ path }) => path === contextPath)?.content ?? "";
          const applicationServer =
            files.find(({ path }) => path === applicationServerPath)?.content ?? "";
          const implementation =
            files.find(({ path }) => path === implementationPath)?.content ?? "";
          const key = `${mode}/${framework}/${database}`;

          expect(context, key).toContain("createRequestApplicationForRequest(headers)");
          expect(context, key).not.toContain("resolveIdentityActorForRequest");
          expect(applicationServer, key).toContain("resolveIdentityActorForRequest");
          expect(applicationServer, key).toContain("disableCookieCache");
          expect(applicationServer, key).toContain("disableRefresh");
          expect(applicationServer, key).toContain("if (!identity) return null");
          expect(implementation, key).toContain("createContext");
          expect(implementation, key).not.toContain("auth.api");
          expect(parseSync(contextPath, context).errors, key).toEqual([]);
          expect(parseSync(applicationServerPath, applicationServer).errors, key).toEqual([]);
          expect(parseSync(implementationPath, implementation).errors, key).toEqual([]);
        }
      }
    }
  });

  test("revives only template date fields and rejects invalid dates before rendering", () => {
    const normalize = loadPdfDataNormalizer();
    const invoice = normalize("invoice", {
      invoiceNumber: "INV-1",
      issuedAt: "2026-08-30T00:00:00.000Z",
      dueDate: "2026-09-13T00:00:00.000Z",
    });
    expect(invoice.issuedAt).toBeInstanceOf(Date);
    expect(invoice.dueDate).toBeInstanceOf(Date);

    const certificate = normalize("certificate", {
      issuedAt: "2026-08-30T00:00:00.000Z",
    });
    expect(certificate.issuedAt).toBeInstanceOf(Date);

    expect(() => normalize("agreement", { effectiveDate: "not-a-date" })).toThrow(
      "PDF effectiveDate is invalid",
    );
  });

  test("the JSX-free render helper imports only the React element type it consumes", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = pdfFilesWithApps(mode, false, false, "nextjs", true);
      const path =
        mode === "monorepo" ? "packages/pdf/src/lib/render.ts" : "src/server/pdf/src/lib/render.ts";
      const render = files.find((file) => file.path === path)?.content ?? "";
      expect(render, path).toContain('import type { ReactElement } from "react"');
      expect(render, path).toContain("renderPdfToBuffer(element: ReactElement)");
      expect(render, path).not.toContain('import { createElement } from "react"');
      expect(render, path).not.toContain("React.createElement");
      expect(parseSync(path, render).errors).toEqual([]);
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} authenticates before bounded parsing and rendering`, () => {
        const files = pdfFilesWithApps(mode, false, false, framework, true);
        const expectedPath =
          framework === "nextjs"
            ? mode === "monorepo"
              ? "apps/web/src/app/api/pdf/route.ts"
              : "src/app/api/pdf/route.ts"
            : mode === "monorepo"
              ? "apps/web/src/routes/api/pdf.ts"
              : "src/routes/api/pdf.ts";
        const route = files.find(({ path }) => path === expectedPath)?.content;
        expect(route, expectedPath).toBeDefined();
        if (!route) throw new Error(`Missing ${expectedPath}`);

        expect(parseSync(expectedPath, route).errors).toEqual([]);
        const implementationPath =
          framework === "tanstack-start"
            ? mode === "monorepo"
              ? "apps/web/src/server/http/pdf.server.ts"
              : "src/server/http/pdf.server.ts"
            : expectedPath;
        const implementation =
          framework === "tanstack-start"
            ? files.find(({ path }) => path === implementationPath)?.content
            : route;
        expect(implementation, implementationPath).toBeDefined();
        if (!implementation) throw new Error(`Missing ${implementationPath}`);

        if (framework === "tanstack-start") {
          expect(route).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');
          expect(route).toMatch(
            /const dispatchPdfRequest = createServerOnlyFn\(async \(request: Request\): Promise<Response> => \{\s*const \{ handlePdfRequest \} = await import\("@\/server\/http\/pdf\.server"\);\s*return await handlePdfRequest\(request\);\s*\}\);/,
          );
          expect(route).toContain(
            "POST: ({ request }: { request: Request }) => dispatchPdfRequest(request)",
          );
          expect(route).not.toContain(
            '(await import("@/server/http/pdf.server")).handlePdfRequest(request)',
          );
          expect(route).not.toContain("auth.api.getSession");
          expect(route).not.toContain("readPdfRequest");
          expect(route).not.toContain("admitPdfRender");
          expect(route).not.toContain("renderToBuffer");
          expect(implementation).toContain('import "server-only"');
        }

        expect(parseSync(implementationPath, implementation).errors).toEqual([]);
        const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
        expect(implementation).toContain(`import { createContext } from "${apiImport}"`);
        expect(implementation).not.toContain("auth.api.getSession");
        expect(implementation).not.toContain(
          `from "${mode === "monorepo" ? "@repo/auth" : "@/server/auth"}"`,
        );
        expect(implementation.indexOf("const actorId = await resolvePdfActor")).toBeLessThan(
          implementation.indexOf("const body = await readPdfRequest"),
        );
        expect(implementation).toContain("request.body?.getReader()");
        expect(implementation).toContain('reader.cancel("PDF request limit exceeded")');
        expect(implementation).toContain("MAX_PDF_REQUEST_BYTES");
        expect(implementation).toContain("MAX_PDF_OUTPUT_BYTES");
        expect(implementation).toContain("MAX_ACTIVE_PDF_RENDERS");
        expect(implementation).toContain("MAX_PDF_RENDERS_PER_WINDOW");
        expect(implementation).toContain("PDF_BODY_TIMEOUT_MS");
        expect(implementation).toContain("PDF_RENDER_TIMEOUT_MS");
        expect(implementation).toContain("renderWithDeadline(render)");
        expect(implementation).toContain("render.finally(() => lateRelease?.())");
        expect(implementation).toContain('key === "logoUrl"');
        expect(implementation).toContain("Client-supplied PDF images are not supported");
        expect(implementation).not.toContain("data:image");
        expect(implementation).toContain("release = admitPdfRender(actorId)");
        expect(implementation.indexOf("release = admitPdfRender(actorId)")).toBeLessThan(
          implementation.indexOf("const body = await readPdfRequest"),
        );
        expect(implementation).toContain('"Cache-Control": "private, no-store"');
        expect(implementation).toContain('message: "PDF generation failed"');
        expect(implementation).toContain('throw new PdfRequestError(401, "Unauthorized")');
        expect(implementation).toContain(
          'throw new PdfRequestError(403, "Suspended accounts cannot generate PDFs")',
        );
        if (framework === "tanstack-start") {
          expect(implementation.match(/\.ttf\?inline/g)).toHaveLength(4);
          expect(implementation).toContain("registerPdfFonts(embeddedPdfFontSources)");
        } else {
          expect(implementation).toContain("registerPdfFonts();");
        }
        expect(implementation).not.toContain("request.json()");
        expect(implementation).not.toContain("req.json()");
        expect(implementation).not.toContain("e instanceof Error ? e.message");
      });
    }
  }

  test("mobile and desktop clients propagate authenticated session state", () => {
    const files = pdfFilesWithApps("monorepo", true, true, "nextjs", true);
    const mobile =
      files.find(({ path }) => path === "apps/mobile/src/hooks/usePdf.ts")?.content ?? "";
    const desktop = files.find(({ path }) => path === "apps/desktop/src/lib/pdf.ts")?.content ?? "";

    expect(mobile).toContain('import { authClient } from "@/lib/auth-client"');
    expect(mobile).toContain("await authClient.getCookie()");
    expect(mobile).toContain('Platform.OS === "web" ? null : await authClient.getCookie()');
    expect(mobile).toContain('credentials: "include"');
    expect(mobile).toContain("EXPO_PUBLIC_API_URL");
    expect(mobile).toContain("candidate.origin !== configuredOrigin");
    expect(mobile).toContain('import { File, Paths } from "expo-file-system"');
    expect(mobile).toContain("new File(Paths.cache, fileName)");
    expect(mobile).toContain('file.write(pdfBase64, { encoding: "base64" })');
    expect(mobile).toContain('typeof pdfBase64 !== "string"');
    expect(mobile).toContain("safePdfFileName");
    expect(mobile).toContain('if (Platform.OS === "web")');
    expect(mobile).toContain("URL.createObjectURL");
    expect(mobile).not.toContain("writeAsStringAsync");
    expect(mobile).not.toContain("cacheDirectory");
    expect(desktop).toContain('credentials: "include"');
    expect(desktop).toContain('typeof window === "undefined"');
    expect(desktop).toContain("configuredPdfOrigin");
    expect(desktop).toContain("safePdfFileName");
  });

  test("single web emits its client hook outside the server capability tree", () => {
    const files = pdfFilesWithApps("single", false, false, "nextjs", true);
    const client = files.find(({ path }) => path === "src/hooks/usePdf.ts")?.content ?? "";

    expect(client).toStartWith('"use client";');
    expect(client).toContain("export function usePdf(");
    expect(files.some(({ path }) => path === "src/server/pdf/src/client/usePdf.ts")).toBe(false);
    expect(
      files.some(
        ({ path, content }) =>
          path.startsWith("src/server/pdf/") && content.includes('"use client"'),
      ),
    ).toBe(false);
    expect(parseSync("src/hooks/usePdf.ts", client).errors).toEqual([]);
  });
});
