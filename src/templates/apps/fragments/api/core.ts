import { authRouteBoundaryCode } from "./auth-boundary.js";
import { standardApiRequestCode } from "./http-request.js";
import { MAX_ORPC_BODY_BYTES } from "../../../api/body-limits.js";

export type RouterType = "next" | "tanstack";
export type ResponseLib = "NextResponse" | "Response";

export const billingHelperCode = `function selectedBillingFromAddons(map?: AddonInstallerMap | Record<string, { inUse: boolean }> | BillingProviderName[]): BillingProviderName[] {
  if (!map) return [];
  if (Array.isArray(map)) return map as BillingProviderName[];
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) { if ((map as Record<string, { inUse?: boolean }>)[p]?.inUse) sel.push(p as BillingProviderName); }
  if ((map as Record<string, { inUse?: boolean }>).billing?.inUse && sel.length === 0) return [...billingProviders] as BillingProviderName[];
  return sel;
}
function shouldEmitProvider(provider: BillingProviderName, selected: BillingProviderName[], addonsPresent: boolean, map?: AddonInstallerMap | Record<string, { inUse: boolean }>): boolean {
  if (!addonsPresent) return false;
  if (selected.length === 0) { const legacy = (map as Record<string, { inUse?: boolean }>)?.billing?.inUse; return Boolean(legacy); }
  return selected.includes(provider);
}`;

export const sharedAuthHandlerLogic = `${authRouteBoundaryCode(false)}

const ALLOWED_AUTH_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
async function handle(request: Request): Promise<Response> {
  if (!ALLOWED_AUTH_METHODS.has(request.method)) return new Response("Method not allowed", { status: 405 });
  const directPrivilegedRejection = rejectDirectPrivilegedAuthRequest(request);
  if (directPrivilegedRejection) return directPrivilegedRejection;
  const preparedAuthRequest = prepareAuthRequestForRuntime(request);
  if (preparedAuthRequest.rejection) return preparedAuthRequest.rejection;
  return auth.handler(preparedAuthRequest.request);
}`;

export function tanstackAuthServerHandlerContent(
  authImport = "@repo/auth",
  trustedCloudflareRuntime = false,
): string {
  return `import "server-only";
import { auth } from "${authImport}";

${authRouteBoundaryCode(trustedCloudflareRuntime)}
const ALLOWED_AUTH_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function handleAuthRequest(request: Request): Promise<Response> {
  if (!ALLOWED_AUTH_METHODS.has(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }
  const directPrivilegedRejection = rejectDirectPrivilegedAuthRequest(request);
  if (directPrivilegedRejection) return directPrivilegedRejection;
  const preparedAuthRequest = prepareAuthRequestForRuntime(request);
  if (preparedAuthRequest.rejection) return preparedAuthRequest.rejection;
  return auth.handler(preparedAuthRequest.request);
}
`;
}

export function tanstackAuthRouteContent(): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchAuthRequest = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handleAuthRequest } = await import("@/server/http/auth.server");
  return await handleAuthRequest(request);
});

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatchAuthRequest(request),
      POST: ({ request }: { request: Request }) => dispatchAuthRequest(request),
      PUT: ({ request }: { request: Request }) => dispatchAuthRequest(request),
      PATCH: ({ request }: { request: Request }) => dispatchAuthRequest(request),
      DELETE: ({ request }: { request: Request }) => dispatchAuthRequest(request),
    },
  },
});
`;
}

export const storageUploadPreflight = `// 15 MiB admits the 14 MiB base64 storage contract plus its JSON/oRPC envelope.
const MAX_ORPC_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};
const MAX_CONCURRENT_STORAGE_UPLOADS = 2;
const STORAGE_UPLOAD_PATHS = new Set([
  "/api/storage/upload",
  "/api/rpc/storage/upload",
  "/api/storage/objects",
  "/api/storage/objects/base64",
  "/api/rpc/storage/uploadBase64",
]);
const activeStorageUploadActors = new Set<string>();
let activeStorageUploadCount = 0;

function normalizedStorageUploadPath(request: Request): string | null {
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    return pathname.replace(/[/]+$/, "") || "/";
  } catch {
    return null;
  }
}

function isStorageUploadRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  const pathname = normalizedStorageUploadPath(request);
  return pathname !== null && STORAGE_UPLOAD_PATHS.has(pathname);
}

function storageUploadActorId(context: object): string | null {
  if (
    !("storageActor" in context) ||
    typeof context.storageActor !== "object" ||
    context.storageActor === null ||
    !("id" in context.storageActor) ||
    typeof context.storageActor.id !== "string" ||
    context.storageActor.id.length === 0
  ) {
    return null;
  }
  return context.storageActor.id;
}

function isUnauthenticatedStorageUpload(request: Request, context: object): boolean {
  return isStorageUploadRequest(request) && storageUploadActorId(context) === null;
}

function acquireStorageUploadAdmission(actorId: string): (() => void) | null {
  if (
    activeStorageUploadCount >= MAX_CONCURRENT_STORAGE_UPLOADS ||
    activeStorageUploadActors.has(actorId)
  ) {
    return null;
  }
  activeStorageUploadCount += 1;
  activeStorageUploadActors.add(actorId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeStorageUploadCount -= 1;
    activeStorageUploadActors.delete(actorId);
  };
}`;

export function authFileContent(router: RouterType, trustedCloudflareRuntime = false): string {
  if (router === "tanstack") {
    return tanstackAuthRouteContent();
  }
  return `import { auth } from "@repo/auth";
${authRouteBoundaryCode(trustedCloudflareRuntime)}
const ALLOWED_AUTH_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
async function handle(request: Request): Promise<Response> {
  if (!ALLOWED_AUTH_METHODS.has(request.method)) return new Response("Method not allowed", { status: 405 });
  const directPrivilegedRejection = rejectDirectPrivilegedAuthRequest(request);
  if (directPrivilegedRejection) return directPrivilegedRejection;
  const preparedAuthRequest = prepareAuthRequestForRuntime(request);
  if (preparedAuthRequest.rejection) return preparedAuthRequest.rejection;
  return auth.handler(preparedAuthRequest.request);
}
export const GET = handle; export const POST = handle; export const PUT = handle; export const PATCH = handle; export const DELETE = handle;
`;
}

export function tanstackRpcServerHandlerContent(apiImport = "@repo/api"): string {
  return `import "server-only";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  appRouter,
  applyApiContextResponseHeaders,
  createContext,
  rejectUnsafeOrpcRequest,
} from "${apiImport}";

export const runtime = "nodejs" as const;
${storageUploadPreflight}
${standardApiRequestCode}
const rpcHandler = new RPCHandler(appRouter, {
  plugins: [new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES })],
});

export async function handleRpcRequest(request: Request): Promise<Response> {
  const requestBoundaryRejection = rejectUnsafeOrpcRequest(request);
  if (requestBoundaryRejection) return requestBoundaryRejection;
  const context = await createContext(request.headers);
  if (isUnauthenticatedStorageUpload(request, context)) {
    return Response.json({ error: "Authentication is required" }, { status: 401 });
  }
  const storageUploadActor = isStorageUploadRequest(request) ? storageUploadActorId(context) : null;
  const releaseStorageUploadAdmission = storageUploadActor
    ? acquireStorageUploadAdmission(storageUploadActor)
    : undefined;
  if (storageUploadActor && !releaseStorageUploadAdmission) {
    return Response.json({ error: "Upload capacity is temporarily exhausted" }, { status: 429 });
  }
  try {
    const result = await rpcHandler.handle(toStandardApiRequest(request), { prefix: "/api/rpc", context });
    if (!result.matched) return new Response("Not found", { status: 404 });
    const response = applyApiContextResponseHeaders(result.response, context);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  } finally {
    releaseStorageUploadAdmission?.();
  }
}
`;
}

export function tanstackRpcRouteContent(): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchRpcRequest = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handleRpcRequest } = await import("@/server/http/rpc.server");
  return await handleRpcRequest(request);
});

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatchRpcRequest(request),
      POST: ({ request }: { request: Request }) => dispatchRpcRequest(request),
      PUT: ({ request }: { request: Request }) => dispatchRpcRequest(request),
      PATCH: ({ request }: { request: Request }) => dispatchRpcRequest(request),
      DELETE: ({ request }: { request: Request }) => dispatchRpcRequest(request),
    },
  },
});
`;
}

export function orpcFileContent(router: RouterType): string {
  const sharedLogicNext = `import { after } from "next/server";
${storageUploadPreflight}
${standardApiRequestCode}
const rpcHandler = new RPCHandler(appRouter, {
  plugins: [new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES })],
});
async function handle(request: Request): Promise<Response> {
  const requestBoundaryRejection = rejectUnsafeOrpcRequest(request);
  if (requestBoundaryRejection) return requestBoundaryRejection;
  const context = await createContext(request.headers);
  if (isUnauthenticatedStorageUpload(request, context)) {
    return Response.json({ error: "Authentication is required" }, { status: 401 });
  }
  const storageUploadActor = isStorageUploadRequest(request) ? storageUploadActorId(context) : null;
  const releaseStorageUploadAdmission = storageUploadActor
    ? acquireStorageUploadAdmission(storageUploadActor)
    : undefined;
  if (storageUploadActor && !releaseStorageUploadAdmission) {
    return Response.json({ error: "Upload capacity is temporarily exhausted" }, { status: 429 });
  }
  try {
    const rpcResult = await rpcHandler.handle(toStandardApiRequest(request), { prefix: "/api/rpc", context });
    if (rpcResult.matched) { const response = applyApiContextResponseHeaders(rpcResult.response, context); response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); after(() => { /* analytics after response */ }); return response; }
    return new Response("Not found", { status: 404 });
  } finally {
    releaseStorageUploadAdmission?.();
  }
}`;
  if (router === "tanstack") return tanstackRpcRouteContent();
  return `import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  appRouter,
  applyApiContextResponseHeaders,
  createContext,
  rejectUnsafeOrpcRequest,
} from "@repo/api";
${sharedLogicNext}
export const GET = handle; export const POST = handle; export const PUT = handle; export const PATCH = handle; export const DELETE = handle;
`;
}

export function healthFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import { createFileRoute } from '@tanstack/react-router'
export const runtime = "nodejs" as const;
export const Route = createFileRoute('/api/health')({ server: { handlers: { GET: async () => { const body = JSON.stringify({ status: 'ok', time: new Date().toISOString() }); return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', }, }); }, }, }, })
`;
  }
  return `import { after, connection, NextResponse } from "next/server";
export async function GET(): Promise<NextResponse> {
  // Health timestamps are request-scoped and must never be frozen at build time.
  await connection();
  const response = NextResponse.json({ status: "ok", time: new Date().toISOString() });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Non-blocking post-response work — vercel server-after-nonblocking
  after(() => {
    // e.g. analytics, audit log — runs after response is sent
  });
  return response;
}
`;
}

export function tanstackOpenApiServerHandlerContent(apiImport = "@repo/api/openapi"): string {
  return `import "server-only";
import { generateOpenAPISpec } from "${apiImport}";

export async function handleOpenApiRequest(): Promise<Response> {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_OPENAPI === "false") {
    return new Response("Not found", { status: 404 });
  }
  const spec = await generateOpenAPISpec();
  return new Response(JSON.stringify(spec), { headers: { "Content-Type": "application/json" } });
}
`;
}

export function tanstackOpenApiRouteContent(): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchOpenApiRequest = createServerOnlyFn(async (): Promise<Response> => {
  const { handleOpenApiRequest } = await import("@/server/http/openapi.server");
  return await handleOpenApiRequest();
});

export const Route = createFileRoute("/api/openapi")({
  server: {
    handlers: {
      GET: () => dispatchOpenApiRequest(),
    },
  },
});
`;
}

export function openapiFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return tanstackOpenApiRouteContent();
  }
  return `import { connection, NextResponse } from "next/server";
import { generateOpenAPISpec } from "@repo/api/openapi";
export async function GET(): Promise<NextResponse> {
  // Keep development-only schema generation out of build-time prerendering.
  await connection();
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  if (process.env.ENABLE_OPENAPI === "false") return new NextResponse("Not found", { status: 404 });
  const spec = await generateOpenAPISpec();
  return NextResponse.json(spec);
}
`;
}
