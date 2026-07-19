import { file, type TemplateFile } from "../../shared.js";

export function nextNavigationFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing.js";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
`,
  );
}
