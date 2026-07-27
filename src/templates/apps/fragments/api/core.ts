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

export const sharedAuthHandlerLogic = `const allowedAuthMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
async function handle(request: Request): Promise<Response> {
  if (!allowedAuthMethods.has(request.method)) return new Response("Method not allowed", { status: 405 });
  return auth.handler(request);
}`;

export function authFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@repo/auth'
const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
async function handle(request: Request): Promise<Response> {
  if (!allowed.has(request.method)) return new Response('Method not allowed', { status: 405 })
  return (auth as unknown as { handler: (req: Request) => Promise<Response> }).handler(request)
}
export const Route = createFileRoute('/api/auth/$splat')({ server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, }, }, })
`;
  }
  return `import { auth } from "@repo/auth";
const allowedAuthMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
async function handle(request: Request): Promise<Response> {
  if (!allowedAuthMethods.has(request.method)) return new Response("Method not allowed", { status: 405 });
  return auth.handler(request);
}
export const GET = handle; export const POST = handle; export const PUT = handle; export const PATCH = handle; export const DELETE = handle;
`;
}

export function orpcFileContent(router: RouterType): string {
  const sharedLogic = `const rpcHandler = new RPCHandler(appRouter);
const openapiHandler = new OpenAPIHandler(appRouter);
async function handle(request: Request): Promise<Response> {
  const context = await createContext(request.headers);
  const matchOptions = { context };
  const rpcResult = await rpcHandler.handle(request, matchOptions);
  if (rpcResult.matched && rpcResult.response) { const response = rpcResult.response; response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); return response; }
  const openApiResult = await openapiHandler.handle(request, matchOptions);
  if (openApiResult.matched && openApiResult.response) { const response = openApiResult.response; response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); return response; }
  return new Response("Not found", { status: 404 });
}`;
  if (router === "tanstack") {
    return `import { createFileRoute } from '@tanstack/react-router'
import { RPCHandler } from '@orpc/server/fetch'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { appRouter, createContext } from '@repo/api'
${sharedLogic}
export const Route = createFileRoute('/api/rpc/$splat')({ server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, }, }, })
`;
  }
  return `import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { appRouter, createContext } from "@repo/api";
${sharedLogic}
export const GET = handle; export const POST = handle; export const PUT = handle; export const PATCH = handle; export const DELETE = handle;
`;
}

export function healthFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api/health')({ server: { handlers: { GET: async () => { const body = JSON.stringify({ status: 'ok', time: new Date().toISOString() }); return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', }, }); }, }, }, })
`;
  }
  return `import { NextResponse } from "next/server";
export async function GET(): Promise<NextResponse> {
  const response = NextResponse.json({ status: "ok", time: new Date().toISOString() });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
`;
}

export function openapiFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import { createFileRoute } from '@tanstack/react-router'
import { generateOpenAPISpec } from '@repo/api/openapi'
export const Route = createFileRoute('/api/openapi')({ server: { handlers: { GET: async () => { if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 }); const spec = await generateOpenAPISpec(); return new Response(JSON.stringify(spec), { headers: { 'Content-Type': 'application/json', }, }); }, }, }, })
`;
  }
  return `import { NextResponse } from "next/server";
import { generateOpenAPISpec } from "@repo/api/openapi";
export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const spec = await generateOpenAPISpec();
  return NextResponse.json(spec);
}
`;
}
