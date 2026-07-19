import { file, type TemplateFile } from "../../../shared.js";
export function adminLayout(): TemplateFile {
  return file(
    "apps/web/src/app/admin/layout.tsx",
    `import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as React from "react";
import { auth } from "@repo/auth";
import { AdminGuard } from "../../components/admin-guard";
export default async function AdminLayout({ children }: { children: React.ReactNode; }): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.role !== "admin") redirect("/");
  return <AdminGuard>{children}</AdminGuard>;
}
`,
  );
}
