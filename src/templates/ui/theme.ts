import { file, type TemplateFile } from "../shared.js";
import { oklchLightTokens, oklchDarkTokens, themeInlineTokens } from "../apps/fragments/css.js";

/**
 * Single source OKLCH theme — @repo/ui/src/theme.css
 * Web: apps/web/src/app/globals.css does @import "@repo/ui/theme.css"
 * Mobile: apps/mobile/global.css does @import "tailwindcss"; @import "uniwind"; @import "@repo/ui/theme.css"
 * Contains light/dark tokens + @theme inline + @layer theme @variant for Uniwind compat.
 * One edit to --primary updates both web and mobile after restart.
 */

export function themeCssContent(): string {
  // Uniwind resolves themes from @variant blocks. Emitting only `light` made it
  // reject the theme set entirely ("Theme dark is missing variable --color-*"),
  // producing a 0-byte stylesheet and an unreadable app on dark-mode devices.
  // The dark values come from the .dark token block above, so the var() names
  // are identical — only the surrounding variant differs.
  const uniwindVariantLayer = `@layer theme {
  :root {
    @variant light {
      --color-background: var(--background);
      --color-foreground: var(--foreground);
      --color-card: var(--card);
      --color-card-foreground: var(--card-foreground);
      --color-popover: var(--popover);
      --color-popover-foreground: var(--popover-foreground);
      --color-primary: var(--primary);
      --color-primary-foreground: var(--primary-foreground);
      --color-secondary: var(--secondary);
      --color-secondary-foreground: var(--secondary-foreground);
      --color-muted: var(--muted);
      --color-muted-foreground: var(--muted-foreground);
      --color-accent: var(--accent);
      --color-accent-foreground: var(--accent-foreground);
      --color-destructive: var(--destructive);
      --color-destructive-foreground: var(--destructive-foreground);
      --color-border: var(--border);
      --color-input: var(--input);
      --color-ring: var(--ring);
    }
    @variant dark {
      --color-background: var(--background);
      --color-foreground: var(--foreground);
      --color-card: var(--card);
      --color-card-foreground: var(--card-foreground);
      --color-popover: var(--popover);
      --color-popover-foreground: var(--popover-foreground);
      --color-primary: var(--primary);
      --color-primary-foreground: var(--primary-foreground);
      --color-secondary: var(--secondary);
      --color-secondary-foreground: var(--secondary-foreground);
      --color-muted: var(--muted);
      --color-muted-foreground: var(--muted-foreground);
      --color-accent: var(--accent);
      --color-accent-foreground: var(--accent-foreground);
      --color-destructive: var(--destructive);
      --color-destructive-foreground: var(--destructive-foreground);
      --color-border: var(--border);
      --color-input: var(--input);
      --color-ring: var(--ring);
    }
  }
}
`;

  return `${oklchLightTokens}

${oklchDarkTokens}

${themeInlineTokens}

${uniwindVariantLayer}
`;
}

export function themeFiles(): TemplateFile[] {
  return [
    file("packages/ui/src/theme.css", themeCssContent()),
    file(
      "packages/ui/src/lib/utils.ts",
      `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
    ),
  ];
}
