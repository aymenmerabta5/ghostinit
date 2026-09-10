import {
  sharedNotFoundInner,
  sharedErrorInner,
  sharedLoadingSkeletons,
  type RouterType,
} from "./shared.js";

export function errorViewContent(router: RouterType): string {
  if (router === "tanstack") {
    // TanStack embeds errorComponent in __root.tsx; but provide standalone for completeness.
    throw new Error("TanStack root owns its error document adapter");
  }
  return `"use client";

import * as React from "react";
import { useReportError } from "./use-report-error";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  useReportError(error);

  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedErrorInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("unexpected.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unexpected.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button onClick={() => reset()}>{t("unexpected.retry")}</Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;
}
export function globalErrorViewContent(): string {
  return `"use client";

import * as React from "react";
import { useReportError } from "./use-report-error";
import { Button } from "@/components/ui/button";
import {
  standaloneSurfaceDirection,
  useStandaloneSurfaceLocale,
  useStandaloneSurfaceTranslations,
} from "@/lib/translations.standalone";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale();
  const t = useStandaloneSurfaceTranslations("errors");
  useReportError(error);

  return (
    <html lang={locale} dir={standaloneSurfaceDirection(locale)} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 sm:px-8">
          <div className="w-full max-w-[440px] space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{t("global.title")}</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{t("global.description")}</p>
            <Button onClick={() => reset()} className="mt-6">
              {t("global.retry")}
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
`;
}

export function loadingViewContent(): string {
  return `import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading(): React.JSX.Element {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background" aria-busy="true">
      ${sharedLoadingSkeletons}
    </main>
  );
}
`;
}
