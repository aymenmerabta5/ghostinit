import {
  singleMarketingClosingComponentContent,
  singleMarketingFeaturesComponentContent,
  singleMarketingHeroComponentContent,
  singleMarketingPageContent,
} from "../../../../apps/fragments/marketing/single.js";

export function singleMarketingPageTanstackContent(): string {
  return singleMarketingPageContent("tanstack");
}

export function singleMarketingHeroTanstackContent(): string {
  return singleMarketingHeroComponentContent("tanstack");
}

export function singleMarketingFeaturesTanstackContent(): string {
  return singleMarketingFeaturesComponentContent("tanstack");
}

export function singleMarketingClosingTanstackContent(hasBilling = true): string {
  return singleMarketingClosingComponentContent("tanstack", hasBilling);
}
