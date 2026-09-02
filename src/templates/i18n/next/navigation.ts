import { file, type TemplateFile } from "../../shared.js";

export function nextNavigationFile(filePath: string): TemplateFile {
  return file(
    filePath,
    `export { default as Link } from "next/link";
export { redirect, usePathname, useRouter } from "next/navigation";
`,
  );
}
