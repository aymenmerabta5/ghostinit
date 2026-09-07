import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

function nextContent(): string {
  return `"use client";
import type * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

function ResetPasswordContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  return <ResetPasswordForm token={searchParams.get("token") ?? ""} queryError={searchParams.get("error")} />;
}

export default function ResetPasswordPage(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Suspense fallback={<div className="w-full max-w-[420px]"><Card><CardHeader><CardTitle as="h1">{t("resetPassword.title")}</CardTitle><CardDescription>{t("resetPassword.loading")}</CardDescription></CardHeader></Card></div>}>
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
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
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
