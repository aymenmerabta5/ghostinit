/**
 * Shared dark-first GhostInit design contract.
 *
 * `semanticThemeCssContent()` is the only renderer for semantic tokens. Package
 * mode emits it as `@repo/ui/theme.css`; single mode embeds the same output in
 * its global stylesheet. App stylesheets only select the platform adapter and
 * add the appropriate base layer.
 */

export const tailwindImports = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));`;

export const oklchDarkTokens = `:root,
.dark {
  --background: oklch(0.09 0.01 264);
  --foreground: oklch(0.98 0.005 264);
  --card: oklch(0.13 0.01 264);
  --card-foreground: oklch(0.98 0.005 264);
  --popover: oklch(0.13 0.01 264);
  --popover-foreground: oklch(0.98 0.005 264);
  --primary: oklch(0.65 0.22 264);
  --primary-foreground: oklch(0.12 0.02 264);
  --secondary: oklch(0.18 0.01 264);
  --secondary-foreground: oklch(0.98 0.005 264);
  --muted: oklch(0.18 0.01 264);
  --muted-foreground: oklch(0.65 0.015 264);
  --accent: oklch(0.18 0.01 264);
  --accent-foreground: oklch(0.98 0.005 264);
  --destructive: oklch(0.63 0.22 27);
  --destructive-foreground: oklch(0.98 0.005 264);
  --border: oklch(0.22 0.01 264);
  --input: oklch(0.22 0.01 264);
  --ring: oklch(0.65 0.22 264);
  --success: oklch(0.68 0.14 150);
  --warning: oklch(0.72 0.13 75);
  --code: oklch(0.12 0.01 264);
  --code-foreground: oklch(0.78 0.012 264);
  --radius: 0.5rem;
  --chart-1: oklch(0.65 0.22 264);
  --chart-2: oklch(0.68 0.14 186);
  --chart-3: oklch(0.62 0.12 150);
  --chart-4: oklch(0.72 0.13 75);
  --chart-5: oklch(0.64 0.16 35);
  --sidebar: oklch(0.11 0.01 264);
  --sidebar-foreground: oklch(0.98 0.005 264);
  --sidebar-primary: oklch(0.65 0.22 264);
  --sidebar-primary-foreground: oklch(0.12 0.02 264);
  --sidebar-accent: oklch(0.18 0.01 264);
  --sidebar-accent-foreground: oklch(0.98 0.005 264);
  --sidebar-border: oklch(0.22 0.01 264);
  --sidebar-ring: oklch(0.65 0.22 264);
}`;

export const oklchLightTokens = `.light {
  --background: oklch(0.99 0.005 264);
  --foreground: oklch(0.14 0.01 264);
  --card: oklch(0.99 0.005 264);
  --card-foreground: oklch(0.14 0.01 264);
  --popover: oklch(0.99 0.005 264);
  --popover-foreground: oklch(0.14 0.01 264);
  --primary: oklch(0.55 0.22 264);
  --primary-foreground: oklch(0.99 0.005 264);
  --secondary: oklch(0.95 0.01 264);
  --secondary-foreground: oklch(0.14 0.01 264);
  --muted: oklch(0.95 0.01 264);
  --muted-foreground: oklch(0.5 0.015 264);
  --accent: oklch(0.95 0.01 264);
  --accent-foreground: oklch(0.14 0.01 264);
  --destructive: oklch(0.55 0.22 27);
  --destructive-foreground: oklch(0.99 0.005 264);
  --border: oklch(0.92 0.01 264);
  --input: oklch(0.92 0.01 264);
  --ring: oklch(0.55 0.22 264);
  --success: oklch(0.5 0.14 150);
  --warning: oklch(0.55 0.13 75);
  --code: oklch(0.96 0.007 264);
  --code-foreground: oklch(0.25 0.01 264);
  --radius: 0.5rem;
  --chart-1: oklch(0.55 0.22 264);
  --chart-2: oklch(0.62 0.14 186);
  --chart-3: oklch(0.58 0.12 150);
  --chart-4: oklch(0.65 0.13 75);
  --chart-5: oklch(0.58 0.16 35);
  --sidebar: oklch(0.97 0.007 264);
  --sidebar-foreground: oklch(0.14 0.01 264);
  --sidebar-primary: oklch(0.55 0.22 264);
  --sidebar-primary-foreground: oklch(0.99 0.005 264);
  --sidebar-accent: oklch(0.95 0.01 264);
  --sidebar-accent-foreground: oklch(0.14 0.01 264);
  --sidebar-border: oklch(0.92 0.01 264);
  --sidebar-ring: oklch(0.55 0.22 264);
}`;

const colorTokenNames = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "success",
  "warning",
  "code",
  "code-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

function renderColorMappings(indent: string): string {
  return colorTokenNames.map((name) => `${indent}--color-${name}: var(--${name});`).join("\n");
}

export const themeInlineTokens = `@theme inline {
${renderColorMappings("  ")}
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --tracking-display: -0.025em;
}`;

const uniwindVariantLayer = `@layer theme {
  :root {
    @variant light {
${renderColorMappings("      ")}
    }
    @variant dark {
${renderColorMappings("      ")}
    }
  }
}`;

export const baseLayer = `@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-sm text-foreground antialiased;
    font-family: var(--font-sans);
  }
  h1, h2, h3, .display {
    letter-spacing: var(--tracking-display);
  }
  code, pre, kbd, samp {
    font-family: var(--font-mono);
  }
}`;

/** Render the complete portable token contract for every selected platform. */
export function semanticThemeCssContent(): string {
  return `${oklchDarkTokens}

${oklchLightTokens}

${themeInlineTokens}

${uniwindVariantLayer}
`;
}

/** Render a flat web stylesheet from the same theme renderer as package mode. */
export function standaloneWebGlobalCssContent(): string {
  return `${tailwindImports}

${semanticThemeCssContent()}
${baseLayer}
`;
}

/**
 * Package-mode web CSS imports the resolved UI theme and adds DOM base roles.
 * Fonts are system-native; no framework font loader is required.
 */
export function globalCssContent(): string {
  return `@import "tailwindcss";
@import "@repo/ui/theme.css";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));

${baseLayer}
`;
}

/** Native CSS consumes the portable contract without the DOM base layer. */
export function mobileGlobalCssContent(): string {
  return `@import "tailwindcss";
@import "uniwind";
@import "@repo/ui/theme.css";
@import "tw-animate-css";

@source "./app/**/*.{js,jsx,ts,tsx}";
@source "./src/**/*.{js,jsx,ts,tsx}";
@source "./components/**/*.{js,jsx,ts,tsx}";

@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));
`;
}
