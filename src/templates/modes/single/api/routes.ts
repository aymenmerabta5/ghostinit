export function singleAuthRouteContent(): string {
  return [
    'import { auth } from "@/server/auth";',
    "",
    'const allowedAuthMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);',
    "",
    "async function handle(request: Request): Promise<Response> {",
    "  if (!allowedAuthMethods.has(request.method)) {",
    '    return new Response("Method not allowed", { status: 405 });',
    "  }",
    "  return auth.handler(request);",
    "}",
    "",
    "export const GET = handle;",
    "export const POST = handle;",
    "export const PUT = handle;",
    "export const PATCH = handle;",
    "export const DELETE = handle;",
    "",
  ].join("\n");
}

export function singleOrpcRouteContent(): string {
  return [
    'import { type NextRequest } from "next/server";',
    'import { RPCHandler } from "@orpc/server/fetch";',
    'import { OpenAPIHandler } from "@orpc/openapi/fetch";',
    'import { appRouter, createContext } from "@/server/api";',
    "",
    "const rpcHandler = new RPCHandler(appRouter);",
    "const openapiHandler = new OpenAPIHandler(appRouter);",
    "",
    "async function handle(request: NextRequest): Promise<Response> {",
    "  const context = await createContext(request.headers);",
    "  const matchOptions = { context };",
    "",
    "  const rpcResult = await rpcHandler.handle(request, matchOptions as unknown as { context: typeof context });",
    "  if ((rpcResult as unknown as { matched: boolean; response?: Response }).matched && (rpcResult as unknown as { response?: Response }).response) {",
    "    const response = (rpcResult as unknown as { response: Response }).response;",
    '    response.headers.set("X-Content-Type-Options", "nosniff");',
    '    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    "    return response;",
    "  }",
    "",
    "  const openApiResult = await openapiHandler.handle(request, matchOptions as unknown as { context: typeof context });",
    "  if ((openApiResult as unknown as { matched: boolean; response?: Response }).matched && (openApiResult as unknown as { response?: Response }).response) {",
    "    const response = (openApiResult as unknown as { response: Response }).response;",
    '    response.headers.set("X-Content-Type-Options", "nosniff");',
    '    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    "    return response;",
    "  }",
    "",
    '  return new Response("Not found", { status: 404 });',
    "}",
    "",
    "export const GET = handle;",
    "export const POST = handle;",
    "export const PUT = handle;",
    "export const PATCH = handle;",
    "export const DELETE = handle;",
    "",
  ].join("\n");
}

export function singleHealthRouteContent(): string {
  return [
    'import { NextResponse } from "next/server";',
    "",
    "export async function GET(): Promise<NextResponse> {",
    "  const response = NextResponse.json({",
    '    status: "ok",',
    "    ok: true,",
    "    time: new Date().toISOString(),",
    "  });",
    '  response.headers.set("X-Content-Type-Options", "nosniff");',
    '  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");',
    "  return response;",
    "}",
    "",
  ].join("\n");
}

export function singleOpenapiRouteContent(): string {
  return [
    'import { NextResponse } from "next/server";',
    'import { generateOpenAPISpec } from "@/server/api/openapi";',
    "",
    "export async function GET(): Promise<NextResponse> {",
    '  if (process.env.NODE_ENV === "production") {',
    '    return new NextResponse("Not found", { status: 404 });',
    "  }",
    "  const spec = await generateOpenAPISpec();",
    "  return NextResponse.json(spec);",
    "}",
    "",
  ].join("\n");
}

export function singleApiContextContent(): string {
  return [
    'import { auth } from "@/server/auth";',
    "",
    "export interface ApiContext {",
    "  user?: {",
    "    id: string;",
    "    email: string;",
    "    name?: string | null;",
    "  };",
    "}",
    "",
    "export async function createContext(headers: Headers): Promise<ApiContext> {",
    "  const session = await auth.api.getSession({ headers });",
    "  if (!session?.user) {",
    "    return {};",
    "  }",
    "  return {",
    "    user: {",
    "      id: session.user.id,",
    "      email: session.user.email,",
    "      name: session.user.name,",
    "    },",
    "  };",
    "}",
    "",
  ].join("\n");
}

export function singleApiHealthProcedureContent(): string {
  return [
    'import { oc } from "@orpc/contract";',
    'import { implement } from "@orpc/server";',
    'import { z } from "zod";',
    'import type { ApiContext } from "../context";',
    "",
    "const contract = {",
    "  health: oc",
    '    .route({ method: "GET", path: "/health" })',
    '    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),',
    "};",
    "",
    "export const healthContract = contract.health;",
    "",
    "const implementer = implement<typeof contract, ApiContext>(contract);",
    "",
    "export const health = implementer.health.handler(async () => ({",
    '  status: "ok" as const,',
    "  time: new Date().toISOString(),",
    "}));",
    "",
  ].join("\n");
}

export function singleApiMeProcedureContent(): string {
  return [
    'import { oc } from "@orpc/contract";',
    'import { implement } from "@orpc/server";',
    'import { z } from "zod";',
    'import type { ApiContext } from "../context";',
    "",
    "const contract = {",
    "  me: oc",
    '    .route({ method: "GET", path: "/me" })',
    "    .output(",
    "      z.object({",
    "        user: z",
    "          .object({",
    "            id: z.string(),",
    "            email: z.string(),",
    "            name: z.string().nullable(),",
    "          })",
    "          .nullable(),",
    "      }),",
    "    ),",
    "};",
    "",
    "export const meContract = contract.me;",
    "",
    "const implementer = implement<typeof contract, ApiContext>(contract);",
    "",
    "export const me = implementer.me.handler(async ({ context }) => {",
    "  const user = context.user;",
    "  return {",
    "    user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null,",
    "  };",
    "});",
    "",
  ].join("\n");
}

export function singleApiContractContent(): string {
  return [
    'import { healthContract } from "./procedures/health";',
    'import { meContract } from "./procedures/me";',
    "",
    "export const appContract = {",
    "  health: healthContract,",
    "  me: meContract,",
    "};",
    "",
  ].join("\n");
}

export function singleApiRouterContent(): string {
  return [
    'import { implement, os } from "@orpc/server";',
    'import { appContract } from "./contract";',
    'import { health } from "./procedures/health";',
    'import { me } from "./procedures/me";',
    'import type { ApiContext } from "./context";',
    "",
    "const implementer = implement<typeof appContract, ApiContext>(appContract);",
    "",
    'export const appRouter = os.prefix("/api").router(',
    "  implementer.router({",
    "    health,",
    "    me,",
    "  }),",
    ");",
    "",
  ].join("\n");
}

export function singleApiIndexContent(): string {
  return [
    'export { appRouter } from "./router";',
    'export { appContract } from "./contract";',
    'export { createContext, type ApiContext } from "./context";',
    "",
  ].join("\n");
}

export function singleApiOpenapiContent(): string {
  return [
    'import { OpenAPIGenerator } from "@orpc/openapi";',
    'import { ZodToJsonSchemaConverter } from "@orpc/zod";',
    'import { appRouter } from "./router";',
    "",
    "export async function generateOpenAPISpec(): Promise<unknown> {",
    "  const generator = new OpenAPIGenerator({",
    "    converters: [new ZodToJsonSchemaConverter()],",
    "  });",
    "  return generator.generate(appRouter, {",
    '    info: { title: "GhostInit API", version: "0.1.0" },',
    '    servers: [{ url: "http://localhost:3000/api" }],',
    "  });",
    "}",
    "",
  ].join("\n");
}

export function singleOrpcClientContent(): string {
  return [
    '"use client";',
    'import { createORPCClient } from "@orpc/client";',
    'import { RPCLink } from "@orpc/client/fetch";',
    'import type { RouterClient } from "@orpc/server";',
    'import type { appRouter } from "@/server/api";',
    "",
    "const link = new RPCLink({",
    '  url: typeof window !== "undefined" ? `${window.location.origin}/api` : "http://localhost:3000/api",',
    "});",
    "",
    "export const orpc: RouterClient<typeof appRouter> = createORPCClient(link);",
    "export function createApiClient() { return orpc; }",
    "export type ApiClient = typeof orpc;",
    "",
  ].join("\n");
}

export function singleOrpcClientTanstackContent(): string {
  return [
    '"use client"',
    'import { createORPCClient } from "@orpc/client"',
    'import { RPCLink } from "@orpc/client/fetch"',
    'import type { RouterClient } from "@orpc/server"',
    'import type { appRouter } from "@/server/api"',
    "const link = new RPCLink({",
    '  url: typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "http://localhost:3000/api/rpc",',
    "})",
    "export const orpc: RouterClient<typeof appRouter> = createORPCClient(link)",
    "export function createApiClient() { return orpc }",
    "export type ApiClient = typeof orpc",
    "",
  ].join("\n");
}
