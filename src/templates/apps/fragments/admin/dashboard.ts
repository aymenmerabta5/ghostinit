import { file, type TemplateFile } from "../../../shared.js";
import type { AdminTemplateOptions } from "./model.js";

export function adminDashboardFile(options: AdminTemplateOptions): TemplateFile {
  const root = options.sourceRoot === "src" ? "src/app" : "apps/web/src/app";
  return file(
    `${root}/admin/page.tsx`,
    `import { redirect } from "next/navigation";
export default function AdminDashboardPage(): never { redirect("/admin/users"); }
`,
  );
}

export function adminDashboardPage(): TemplateFile {
  return adminDashboardFile({
    database: "postgres",
    framework: "next",
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  });
}
