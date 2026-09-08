export type RouterType = "next" | "tanstack";

export interface HeaderNavigationCapabilities {
  readonly eve?: boolean;
  readonly notifications?: boolean;
  readonly storage?: boolean;
  readonly featureFlags?: boolean;
  readonly jobs?: boolean;
}

export const sharedHeaderStructure = {
  shellClass: "sticky top-0 z-[var(--layer-navigation)] h-16 w-full border-b bg-card",
  innerClass:
    "mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8 lg:px-10",
};
