import { file, type TemplateFile } from "../shared.js";

export function apiFiles(): TemplateFile[] {
  return [authApiRoute(), orpcApiRoute(), healthApiRoute(), openapiApiRoute()];
}

function authApiRoute(): TemplateFile {
  return file(
    "apps/web/src/app/api/auth/[...all]/route.ts",
    `import { auth } from "@repo/auth";

async function handle(request: Request): Promise<Response> {
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
`,
  );
}

function orpcApiRoute(): TemplateFile {
  return file(
    "apps/web/src/app/api/[...path]/route.ts",
    `import { type NextRequest } from "next/server";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { appRouter, createContext } from "@repo/api";

const rpcHandler = new RPCHandler(appRouter);
const openapiHandler = new OpenAPIHandler(appRouter);

async function handle(request: NextRequest): Promise<Response> {
  const context = await createContext(request.headers);
  const matchOptions = { context };

  const rpcResult = await rpcHandler.handle(request, matchOptions);
  if (rpcResult.matched && rpcResult.response) {
    return rpcResult.response;
  }

  const openApiResult = await openapiHandler.handle(request, matchOptions);
  if (openApiResult.matched && openApiResult.response) {
    return openApiResult.response;
  }

  return new Response("Not found", { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
`,
  );
}

function healthApiRoute(): TemplateFile {
  return file(
    "apps/web/src/app/api/health/route.ts",
    `import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
`,
  );
}

function openapiApiRoute(): TemplateFile {
  return file(
    "apps/web/src/app/api/openapi/route.ts",
    `import { NextResponse } from "next/server";
import { generateOpenAPISpec } from "@repo/api/openapi";

export async function GET(): Promise<NextResponse> {
  const spec = await generateOpenAPISpec();
  return NextResponse.json(spec);
}
`,
  );
}
