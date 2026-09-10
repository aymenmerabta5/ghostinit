import { file, type TemplateFile } from "../../../shared.js";
export type RouterType = "next" | "tanstack";

function nextContent(): string {
  return `import { Suspense } from "react";
import { ResetPasswordScreen, ResetPasswordLoading } from "@/features/auth/reset-password-screen";
type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
async function ResetPasswordContent({ searchParams }: SearchProps) {
  const query = await searchParams;
  return <ResetPasswordScreen token={first(query.token) ?? ""} queryError={first(query.error) ?? null} />;
}
export default function ResetPasswordPage(props: SearchProps) {
  return <Suspense fallback={<ResetPasswordLoading />}><ResetPasswordContent {...props} /></Suspense>;
}
`;
}

function tanstackContent(): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "@/features/auth/reset-password-screen";
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});
function ResetPasswordPage() {
  const search = Route.useSearch();
  return <ResetPasswordScreen token={search.token ?? ""} queryError={search.error ?? null} />;
}
`;
}

export function resetPasswordPageContent(router: RouterType = "next"): string {
  return router === "tanstack" ? tanstackContent() : nextContent();
}
export function resetPasswordPage(router: RouterType = "next"): TemplateFile {
  return file(
    router === "tanstack"
      ? "apps/web/src/routes/reset-password.tsx"
      : "apps/web/src/app/reset-password/page.tsx",
    resetPasswordPageContent(router),
  );
}
