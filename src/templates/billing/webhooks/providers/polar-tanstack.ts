import { polarRouteBaseContent } from "./polar-next.js";
import type { DbImports, ConvexImports } from "./shared.js";

function asTanstack(source: string): string {
  const handler = source
    .replace(
      'import { createHash, randomUUID } from "node:crypto";',
      'import { createFileRoute } from "@tanstack/react-router";\nimport { createHash, randomUUID } from "node:crypto";',
    )
    .replace(
      'import { createHash } from "node:crypto";',
      'import { createFileRoute } from "@tanstack/react-router";\nimport { createHash } from "node:crypto";',
    )
    .replace(
      "export async function POST(req: Request): Promise<Response> {",
      "async function POST({ request }: { request: Request }): Promise<Response> {",
    )
    .replaceAll("req.headers", "request.headers")
    .replaceAll("rejectDeclaredBodySize(req)", "rejectDeclaredBodySize(request)");
  return `${handler}\nexport const Route = createFileRoute("/api/webhooks/polar")({ server: { handlers: { POST } } });\n`;
}

export function polarTanstackContent(imp: DbImports): string {
  return asTanstack(polarRouteBaseContent(imp));
}

export function polarTanstackConvexContent(imp: DbImports): string {
  return asTanstack(
    polarRouteBaseContent({ ...(imp as ConvexImports), isConvex: true } as ConvexImports),
  );
}
