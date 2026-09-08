import {
  singleMarketingClosingComponentContent,
  singleMarketingFeaturesComponentContent,
  singleMarketingHeroComponentContent,
  singleMarketingPageContent,
  type SingleMarketingOptions,
} from "../../../apps/fragments/marketing/single.js";

export function singleMarketingPage(): string {
  return singleMarketingPageContent("next");
}

export function singleMarketingHeroContent(options: SingleMarketingOptions): string {
  return singleMarketingHeroComponentContent("next", options);
}

export function singleMarketingFeaturesContent(options: SingleMarketingOptions): string {
  return singleMarketingFeaturesComponentContent("next", options);
}

export function singleMarketingClosingContent(options: SingleMarketingOptions): string {
  return singleMarketingClosingComponentContent("next", options);
}
