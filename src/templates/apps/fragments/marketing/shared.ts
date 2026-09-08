export type RouterType = "next" | "tanstack";
export type MarketingLayout = "single" | "monorepo";

export interface MarketingOptions {
  readonly hasAuth: boolean;
  readonly hasApi: boolean;
  readonly hasBilling: boolean;
  readonly hasEve: boolean;
  readonly database: "postgres" | "convex" | "none";
}

export const noMarketingCapabilities: MarketingOptions = {
  hasAuth: false,
  hasApi: false,
  hasBilling: false,
  hasEve: false,
  database: "none",
};

export const sharedWhyHeader = `<div className="max-w-2xl space-y-4">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{t("features.title")}</h2>
          <p className="max-w-[58ch] text-base leading-7 text-muted-foreground">{t("features.description")}</p>
        </div>`;

export const sharedFoundation = `<article>
          <h3 className="text-xl font-semibold leading-snug tracking-tight">{t("features.architectureTitle")}</h3>
          <p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted-foreground">{t("features.architectureDescription")}</p>
        </article>`;
