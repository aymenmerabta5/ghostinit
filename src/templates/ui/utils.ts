export function uiUtilsContent(): string {
  return `import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: { theme: { shadow: ["control", "surface", "popover", "modal"] } },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
`;
}
