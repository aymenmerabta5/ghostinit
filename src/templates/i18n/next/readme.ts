import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";

export function nextIntlPluginReadme(filePath: string): TemplateFile {
  return file(
    filePath,
    `# i18n — Next.js cookie and header locale selection

Version: next-intl ${v.i18n["next-intl"]}

Files:
- routing.ts defines en, fr, and ar with normal, non-prefixed application paths
- request.ts resolves a valid NEXT_LOCALE cookie first, then Accept-Language, then English
- navigation.ts exposes the standard Next.js Link and navigation helpers
- config.ts exposes locale metadata, validation, direction, and cookie settings
- messages/{en,fr,ar}.json
- locale-switcher.tsx uses the shared Select, writes NEXT_LOCALE, and refreshes server content

Locale routing middleware is not required. Routes remain /dashboard, /admin, and so on in every language.

Wiring: import createNextIntlPlugin from "next-intl/plugin"; const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts"); export default withNextIntl(nextConfig).

Set the root html lang and dir from the resolved locale. No extra environment keys are required.
`,
  );
}
