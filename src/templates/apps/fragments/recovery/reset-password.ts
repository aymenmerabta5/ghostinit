import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

function nextContent(): string {
  return `"use client";
import type * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";

function ResetPasswordContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  return <ResetPasswordForm token={searchParams.get("token") ?? ""} queryError={searchParams.get("error")} />;
}

export default function ResetPasswordPage(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <Suspense fallback={<div className="w-full max-w-[440px]" role="status" aria-busy={true}><Card className="border-0 bg-transparent p-0 shadow-none"><CardHeader className="p-0 pb-6 sm:p-0 sm:pb-6"><CardTitle as="h1" className="text-3xl tracking-tight">{t("resetPassword.title")}</CardTitle><CardDescription>{t("resetPassword.loading")}</CardDescription></CardHeader><CardContent className="space-y-6 p-0 sm:p-0" aria-hidden={true}><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card></div>}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
`;
}

function tanstackContent(): string {
  return `"use client";
import type * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage(): React.JSX.Element {
  const search = Route.useSearch();
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <ResetPasswordForm token={search.token ?? ""} queryError={search.error ?? null} />
    </main>
  );
}
`;
}

export function resetPasswordPageContent(router: RouterType = "next"): string {
  return router === "tanstack" ? tanstackContent() : nextContent();
}

export function resetPasswordPage(router: RouterType = "next"): TemplateFile {
  const path =
    router === "tanstack"
      ? "apps/web/src/routes/reset-password.tsx"
      : "apps/web/src/app/reset-password/page.tsx";
  return file(path, resetPasswordPageContent(router));
}
