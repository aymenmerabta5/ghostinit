import {
  singleMarketingClosingComponentContent,
  singleMarketingFeaturesComponentContent,
  singleMarketingHeroComponentContent,
  singleMarketingPageContent,
} from "../../../apps/fragments/marketing/single.js";

export function singleMarketingPage(): string {
  return singleMarketingPageContent("next");
}

export function singleMarketingHeroContent(): string {
  return singleMarketingHeroComponentContent("next");
}

export function singleMarketingFeaturesContent(): string {
  return singleMarketingFeaturesComponentContent("next");
}

export function singleMarketingClosingContent(hasBilling = true): string {
  return singleMarketingClosingComponentContent("next", hasBilling);
}
