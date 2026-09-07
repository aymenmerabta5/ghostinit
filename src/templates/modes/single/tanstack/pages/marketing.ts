import {
  singleMarketingClosingComponentContent,
  singleMarketingFeaturesComponentContent,
  singleMarketingHeroComponentContent,
  singleMarketingPageContent,
  type SingleMarketingOptions,
} from "../../../../apps/fragments/marketing/single.js";

export function singleMarketingPageTanstackContent(): string {
  return singleMarketingPageContent("tanstack");
}

export function singleMarketingHeroTanstackContent(options: SingleMarketingOptions): string {
  return singleMarketingHeroComponentContent("tanstack", options);
}

export function singleMarketingFeaturesTanstackContent(options: SingleMarketingOptions): string {
  return singleMarketingFeaturesComponentContent("tanstack", options);
}

export function singleMarketingClosingTanstackContent(options: SingleMarketingOptions): string {
  return singleMarketingClosingComponentContent("tanstack", options);
}
