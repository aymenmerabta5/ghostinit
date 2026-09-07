export type RouterType = "next" | "tanstack";

export interface HeaderNavigationCapabilities {
  readonly eve?: boolean;
  readonly notifications?: boolean;
  readonly storage?: boolean;
  readonly featureFlags?: boolean;
  readonly jobs?: boolean;
}

export const sharedHeaderStructure = {
  shellClass: "sticky top-0 z-[var(--layer-navigation)] w-full border-b bg-card",
  innerClass: "mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8",
};
