import type { MarketingLayout, MarketingOptions, RouterType } from "./shared.js";

export function projectPreviewFragment(
  router: RouterType,
  options: MarketingOptions,
  layout: MarketingLayout,
): string {
  const app = router === "next" ? "app" : "routes";
  const rows = [
    { path: layout === "single" ? `src/${app}/` : `apps/web/src/${app}/`, key: "routes" },
    {
      path: layout === "single" ? "src/components/" : "apps/web/src/components/",
      key: "components",
    },
    { path: layout === "single" ? "src/platform/ui/" : "packages/ui/", key: "design" },
    ...(options.hasAuth || options.hasApi || options.database === "postgres"
      ? [{ path: layout === "single" ? "src/server/" : "packages/modules/", key: "server" }]
      : []),
    ...(options.database === "convex" ? [{ path: "convex/", key: "database" }] : []),
    ...(options.hasEve
      ? [{ path: layout === "single" ? "agent/" : "apps/eve/", key: "agent" }]
      : []),
  ];
  const renderedRows = rows
    .map(({ path, key }) => `{ path: "${path}", label: t("preview.${key}") },`)
    .join("\n");

  return `<figure className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-surface">
          <figcaption className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <FolderTree className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-medium">{t("preview.title")}</span>
          </figcaption>
          <div className="px-5 pb-2 pt-5 sm:px-6">
            <p className="mb-2 truncate font-mono text-xs font-medium text-muted-foreground" dir="ltr">__PROJECT_NAME__/</p>
            <dl className="divide-y divide-border/70">
              {[
${renderedRows}
              ].map(({ path, label }) => (
                <div key={path} className="flex items-start gap-3 py-3.5">
                  <dt className="flex min-w-0 flex-1 items-start gap-3"><Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><code dir="ltr" className="block min-w-0 break-all text-sm text-foreground">{path}</code></dt>
                  <dd className="max-w-28 text-end text-xs leading-5 text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="border-t border-border bg-muted/40 px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">{t("preview.source")}</p>
        </figure>`;
}

export function designPreviewFragment(): string {
  return `<figure className="flex flex-col justify-between gap-6 rounded-xl border border-border bg-card p-6 shadow-surface sm:p-8">
            <figcaption className="space-y-3">
              <h3 className="text-xl font-semibold leading-snug tracking-tight">{t("single.tokensTitle")}</h3>
              <p className="max-w-[44ch] text-sm leading-6 text-muted-foreground">{t("single.tokensDescription")}</p>
            </figcaption>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2.5"><div className="h-20 rounded-md border border-border bg-background" /><p className="text-xs text-muted-foreground">{t("preview.canvas")}</p><code dir="ltr" className="block text-xs text-foreground">--background</code></div>
              <div className="space-y-2.5"><div className="h-20 rounded-md border border-border bg-card" /><p className="text-xs text-muted-foreground">{t("preview.surface")}</p><code dir="ltr" className="block text-xs text-foreground">--card</code></div>
              <div className="space-y-2.5"><div className="h-20 rounded-md border border-primary bg-primary" /><p className="text-xs text-muted-foreground">{t("preview.accent")}</p><code dir="ltr" className="block text-xs text-foreground">--primary</code></div>
            </div>
          </figure>`;
}
