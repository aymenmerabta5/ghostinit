import { file, type TemplateFile } from "../../shared.js";
import { sharedNotFoundInner, type RouterType } from "./system/shared.js";
import {
  notFoundViewContent,
  unauthorizedViewContent,
  forbiddenViewContent,
  singleNotFoundViewContent,
} from "./system/access-pages.js";
import {
  errorViewContent,
  globalErrorViewContent,
  loadingViewContent,
} from "./system/recovery-pages.js";

function routeContent(router: RouterType, name: string, route: string): string {
  if (router === "next")
    return `export { ${name} as default } from "@/features/system/${route}";\n`;
  const routePath = route === "not-found" ? "/$notFound" : `/${route}`;
  return `import { createFileRoute } from "@tanstack/react-router";
import { ${name} } from "@/features/system/${route}";
export const Route = createFileRoute("${routePath}")({ component: ${name} });
`;
}
export function notFoundFileContent(router: RouterType): string {
  return routeContent(router, "NotFoundScreen", "not-found");
}
export function unauthorizedFileContent(router: RouterType): string {
  return routeContent(router, "UnauthorizedScreen", "unauthorized");
}
export function forbiddenFileContent(router: RouterType): string {
  return routeContent(router, "ForbiddenScreen", "forbidden");
}
export function errorFileContent(_router: RouterType): string {
  return `"use client";
export { UnexpectedErrorScreen as default } from "@/features/system/unexpected-error";
`;
}
export function globalErrorFileContent(): string {
  return `"use client";
import "./globals.css";
export { GlobalErrorScreen as default } from "@/features/system/global-error";
`;
}
export function loadingFileContent(): string {
  return 'export { LoadingScreen as default } from "@/features/system/loading";\n';
}

function asScreen(source: string, name: string): string {
  return source
    .replace(/export const Route = createFileRoute\([^]*?\}\)\s*;?/, "")
    .replace("createFileRoute, Link", "Link")
    .replace(
      /(?:export default )?function (?:NotFoundPage|NotFound|UnauthorizedPage|Unauthorized|ForbiddenPage|Forbidden|GlobalError|Error|Loading)\(/,
      `export function ${name}(`,
    );
}

export function systemFeatureFiles(
  router: RouterType,
  sourceRoot: string,
  hasAuth: boolean,
  single = false,
): TemplateFile[] {
  const root = `${sourceRoot}/features/system`;
  return [
    file(
      `${root}/use-report-error.ts`,
      `"use client";
import { useEffect } from "react";
export function useReportError(error: unknown): void {
  useEffect(() => { console.error(error); }, [error]);
}
`,
    ),
    file(
      `${root}/not-found.tsx`,
      asScreen(
        single && router === "tanstack" ? singleNotFoundViewContent() : notFoundViewContent(router),
        "NotFoundScreen",
      ),
    ),
    ...(hasAuth && !single
      ? [
          file(
            `${root}/unauthorized.tsx`,
            asScreen(unauthorizedViewContent(router), "UnauthorizedScreen"),
          ),
          file(`${root}/forbidden.tsx`, asScreen(forbiddenViewContent(router), "ForbiddenScreen")),
        ]
      : []),
    ...(router === "next"
      ? [
          file(
            `${root}/unexpected-error.tsx`,
            asScreen(errorViewContent(router), "UnexpectedErrorScreen"),
          ),
          file(`${root}/global-error.tsx`, asScreen(globalErrorViewContent(), "GlobalErrorScreen")),
          file(`${root}/loading.tsx`, asScreen(loadingViewContent(), "LoadingScreen")),
        ]
      : [file(`${root}/route-fallbacks.tsx`, routeFallbacksContent(single))]),
  ];
}

function routeFallbacksContent(single: boolean): string {
  const main = single
    ? "min-h-screen bg-background flex items-center justify-center p-6"
    : sharedNotFoundInner.mainClass;
  const errorCard = single
    ? "rounded-xl border bg-card p-6 shadow-sm max-w-[480px] w-full"
    : "w-full max-w-[440px] space-y-3";
  const notFoundCard = single
    ? "rounded-xl border bg-card p-6 shadow-sm max-w-[420px] w-full"
    : "w-full max-w-[440px] space-y-3";
  return `import type * as React from "react";
import { Button } from "@/components/ui/button";
import { useStandaloneSurfaceTranslations } from "@/lib/translations.standalone";
import { useReportError } from "./use-report-error";

export function RouteErrorScreen({ error, retry }: { error: unknown; retry: () => void }): React.JSX.Element {
  const t = useStandaloneSurfaceTranslations("errors");
  useReportError(error);
  return <main className="${main}"><div className="${errorCard}">
    <h1 className="${single ? "text-lg" : "text-3xl"} font-semibold tracking-tight">{t("unexpected.title")}</h1>
    <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{t("unexpected.description")}</p>
    <Button type="button" onClick={retry} className="mt-6">{t("unexpected.retry")}</Button>
  </div></main>;
}

export function RouteNotFoundScreen(): React.JSX.Element {
  const t = useStandaloneSurfaceTranslations("errors");
  return <main className="${main}"><div className="${notFoundCard}">
    <h1 className="${single ? "text-2xl" : "text-3xl"} font-semibold tracking-tight">{t("notFound.title")}</h1>
    <p className="text-sm text-muted-foreground max-w-[60ch] mt-2">{t("notFound.shortDescription")}</p>
  </div></main>;
}
`;
}
