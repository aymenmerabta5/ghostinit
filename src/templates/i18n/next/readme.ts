import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";

export function nextIntlPluginReadme(filePath: string): TemplateFile {
  return file(
    filePath,
    `# i18n: next-intl 4.x

Version: next-intl ${v.i18n["next-intl"]}

Files:
- routing.ts defineRouting locales ['en','fr','ar']
- request.ts getRequestConfig + hasLocale
- navigation.ts createNavigation
- config.ts locales direction names
- proxy.ts Next 16 entry delegates locale routing to createMiddleware and excludes api paths
- messages/{en,fr,ar}.json
- locale-switcher.tsx client switcher

Wiring: import createNextIntlPlugin from "next-intl/plugin"; const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts"); export default withNextIntl(nextConfig);

No extra .env keys. Bun add next-intl@${v.i18n["next-intl"]}.
`,
  );
}
