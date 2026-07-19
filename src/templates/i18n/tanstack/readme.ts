import { file, type TemplateFile } from "../../shared.js";

export function tanstackReadmeFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `# i18n — TanStack Start custom minimal i18n
Optional features ["i18n"], no next-intl.
- config.ts locales direction
- messages/{en,fr,ar}.json
- lib/i18n.ts t() translate getMessages context provider localStorage NEXT_LOCALE cookie
- locale-switcher.tsx using custom lib
`,
  );
}
