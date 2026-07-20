import { tv } from "tailwind-variants";
import { twMerge } from "tailwind-merge";
import * as React from "react";

// tv + tailwind-merge compatibility
const button = tv({
  base: "inline-flex rounded-md",
  variants: { variant: { default: "bg-primary" } }
});
const merged = twMerge("p-2", "p-4", button({ variant: "default" }));
console.log("tv+twMerge OK:", merged);

// tw-animate-css is CSS only, import check via file existence is enough
// reanimated import is ESM safe? require only types
// uniwind import
// @ts-ignore - uniwind has react-native export condition
import type { UniwindConfig } from "uniwind";

export const ok = true;
