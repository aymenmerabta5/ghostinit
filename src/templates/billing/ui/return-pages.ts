import type { FrameworkName, ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";

/** A provider redirect is navigation only; the authenticated snapshot owns payment state. */
export function billingReturnPageFiles(
  mode: ProjectMode,
  framework: FrameworkName,
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const files: TemplateFile[] = [
    file(
      `${root}src/features/billing/return-page.tsx`,
      `"use client";
import type * as React from "react";
import ${framework === "nextjs" ? 'Link from "next/link"' : '{ Link } from "@tanstack/react-router"'};
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function BillingReturnPage({ outcome }: { outcome: "success" | "cancel" }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-start px-5 py-10 sm:px-8 sm:py-14"><Card className="w-full"><CardHeader><CardTitle as="h1" className="text-3xl tracking-tight">{t(outcome === "success" ? "checkoutReturnTitle" : "checkoutCancelledTitle")}</CardTitle><CardDescription>{t(outcome === "success" ? "checkoutReturnDescription" : "checkoutCancelledDescription")}</CardDescription></CardHeader><CardContent><Button render={<Link ${framework === "nextjs" ? "href" : "to"}="/billing" />} nativeButton={false}>{t("backToBilling")}</Button></CardContent></Card></main>;
}
`,
    ),
  ];
  for (const outcome of ["success", "cancel"] as const) {
    if (framework === "nextjs") {
      files.push(
        file(
          `${root}src/app/billing/${outcome}/page.tsx`,
          `import { BillingReturnPage } from "@/features/billing/return-page";
export default function Page() { return <BillingReturnPage outcome="${outcome}" />; }
`,
        ),
      );
    } else {
      // Trailing underscore excludes the /billing page's component tree.
      files.push(
        file(
          `${root}src/routes/billing_.${outcome}.tsx`,
          `import { createFileRoute } from "@tanstack/react-router";
import { BillingReturnPage } from "@/features/billing/return-page";
export const Route = createFileRoute("/billing_/${outcome}")({ component: Page });
function Page() { return <BillingReturnPage outcome="${outcome}" />; }
`,
        ),
      );
    }
  }
  return files;
}
