import { file, type TemplateFile } from "../../shared.js";

export function nextMiddlewareFile(filePath: string, routingImport: string): TemplateFile {
  return file(
    filePath,
    `import createMiddleware from "next-intl/middleware";
import { routing } from "${routingImport}";

export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|eve|.*\\\\..*).*)",
};
`,
  );
}
