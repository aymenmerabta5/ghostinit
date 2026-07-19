import { file, type TemplateFile } from "../../../shared.js";
export function adminDashboardPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/page.tsx",
    `import { redirect } from "next/navigation";
export default async function AdminDashboardPage(): Promise<never> { redirect("/admin/users"); }
`,
  );
}
