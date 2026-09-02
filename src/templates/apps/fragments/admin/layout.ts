import { file, type TemplateFile } from "../../../shared.js";
import type { AdminTemplateOptions } from "./model.js";

function layoutContent(options: AdminTemplateOptions): string {
  if (options.database === "convex") {
    const authImport = options.mode === "monorepo" ? "@repo/auth" : "@/server/auth";
    return `import { redirect } from "next/navigation";
import type * as React from "react";
import { Suspense } from "react";
import { getRequestUser } from "${authImport}";

async function AuthorizedAdminLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {
  const user = await getRequestUser();
  if (!user || user.role !== "admin") redirect("/");
  return <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">{children}</div>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <AuthorizedAdminLayout>{children}</AuthorizedAdminLayout>
    </Suspense>
  );
}
`;
  }
  const authImport = options.mode === "monorepo" ? "@repo/auth" : "@/server/auth";
  const accessImport =
    options.mode === "monorepo"
      ? `import { isAdminRole } from "@repo/auth/access";`
      : `import { isSingleAdminRole as isAdminRole } from "@/lib/access";`;
  return `import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type * as React from "react";
import { Suspense } from "react";
import { auth } from "${authImport}";
${accessImport}

async function AuthorizedAdminLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isAdminRole(session.user.role) || session.user.banned === true) redirect("/");
  return <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">{children}</div>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <AuthorizedAdminLayout>{children}</AuthorizedAdminLayout>
    </Suspense>
  );
}
`;
}

export function adminLayoutFile(options: AdminTemplateOptions): TemplateFile {
  const root = options.sourceRoot === "src" ? "src/app" : "apps/web/src/app";
  return file(`${root}/admin/layout.tsx`, layoutContent(options));
}

export function adminLayout(isConvex = false): TemplateFile {
  return adminLayoutFile({
    database: isConvex ? "convex" : "postgres",
    framework: "next",
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  });
}
