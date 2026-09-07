import { file, type TemplateFile } from "../../shared.js";

export function tanstackReadmeFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `# i18n — TanStack Start custom runtime

- i18n/config.ts defines locale metadata, validation, direction, and persistence keys.
- i18n/messages/{en,fr,ar}.json contains matching translated catalogs.
- lib/i18n.server.ts resolves NEXT_LOCALE first, then Accept-Language, for route loaders.
- lib/i18n.ts provides typed translation keys, interpolation, and the React provider.
- components/locale-switcher.tsx composes the shared Select and translated labels.

Resolve the request locale in the root loader, pass it to I18nProvider as initialLocale, and
use the same value for the root html lang and dir attributes. The provider restores browser
preferences after hydration and keeps the document, cookie, and local storage synchronized.
`,
  );
}
