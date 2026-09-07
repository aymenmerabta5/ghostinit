import { storageUploadPreflight } from "./core.js";
import { standardApiRequestCode } from "./http-request.js";

function openApiOperationsHandlerContent(apiImport: string): string {
  return `import "server-only";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { BodyLimitPlugin } from "@orpc/server/fetch";
import {
  appRouter,
  applyApiContextResponseHeaders,
  createContext,
  rejectUnsafeOrpcRequest,
} from "${apiImport}";

${storageUploadPreflight}
${standardApiRequestCode}
const openApiHandler = new OpenAPIHandler(appRouter, {
  plugins: [new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES })],
});

export async function handleOpenApiOperation(request: Request): Promise<Response> {
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
    const result = await openApiHandler.handle(toStandardApiRequest(request), { context });
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

export function nextOpenApiOperationsRouteContent(apiImport = "@repo/api"): string {
  return `${openApiOperationsHandlerContent(apiImport)}
export const GET = handleOpenApiOperation;
export const POST = handleOpenApiOperation;
export const PUT = handleOpenApiOperation;
export const PATCH = handleOpenApiOperation;
export const DELETE = handleOpenApiOperation;
`;
}

export function tanstackOpenApiOperationsServerContent(apiImport = "@repo/api"): string {
  return openApiOperationsHandlerContent(apiImport);
}

export function tanstackOpenApiOperationsRouteContent(): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchOpenApiOperation = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handleOpenApiOperation } = await import("@/server/http/openapi-operations.server");
  return await handleOpenApiOperation(request);
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatchOpenApiOperation(request),
      POST: ({ request }: { request: Request }) => dispatchOpenApiOperation(request),
      PUT: ({ request }: { request: Request }) => dispatchOpenApiOperation(request),
      PATCH: ({ request }: { request: Request }) => dispatchOpenApiOperation(request),
      DELETE: ({ request }: { request: Request }) => dispatchOpenApiOperation(request),
    },
  },
});
`;
}
