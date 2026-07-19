/**
 * Marketing fragments shim — split 358 LOC file into marketing/ folder (<200 each).
 * Keeps backwards-compatible import path "./fragments/marketing.js".
 */
export {
  sharedHeroTitle,
  sharedHeroDescNext,
  sharedHeroDescTanStack,
  sharedWhyHeader,
  sharedFeatureCardsNext,
  sharedFeatureCardsTanStack,
  marketingSections,
  versionBadgesNext,
  versionBadgesTanstack,
} from "./marketing/shared.js";
export type { RouterType, MarketingSections } from "./marketing/shared.js";
export {
  marketingHeaderFragment,
  marketingHeroFragment,
  marketingFeaturesFragment,
  marketingQuickStartFragment,
  marketingFooterFragment,
} from "./marketing/sections.js";
export { buildMarketingPageContent } from "./marketing/page.js";
