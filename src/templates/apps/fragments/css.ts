/**
 * Shared OKLCH design tokens + Tailwind v4 global CSS
 * Deduplicates 95% identical global CSS between Next (app/globals.css) and TanStack (styles/app.css)
 * Both use same paper white oklch(0.99) + indigo primary 0.55 chroma 0.22
 * After RNR+Uniwind refactor: theme tokens live in @repo/ui/src/theme.css (single source).
 * Web and mobile both @import that file.
 */

export const tailwindImports = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
`;

export const oklchLightTokens = `:root {
  --background: oklch(0.99 0.002 106);
  --foreground: oklch(0.21 0.01 264);
  --card: oklch(0.99 0.002 106);
  --card-foreground: oklch(0.21 0.01 264);
  --popover: oklch(0.99 0.002 106);
  --popover-foreground: oklch(0.21 0.01 264);
  --primary: oklch(0.55 0.22 264);
  --primary-foreground: oklch(0.985 0.002 106);
  --secondary: oklch(0.967 0.005 264);
  --secondary-foreground: oklch(0.21 0.01 264);
  --muted: oklch(0.967 0.005 264);
  --muted-foreground: oklch(0.55 0.02 264);
  --accent: oklch(0.96 0.01 264);
  --accent-foreground: oklch(0.21 0.01 264);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.985 0.002 106);
  --border: oklch(0.92 0.005 264);
  --input: oklch(0.92 0.005 264);
  --ring: oklch(0.55 0.22 264);
  --radius: 0.625rem;
  --chart-1: oklch(0.55 0.22 264);
  --chart-2: oklch(0.68 0.14 186);
  --chart-3: oklch(0.62 0.12 150);
  --chart-4: oklch(0.75 0.15 65);
  --chart-5: oklch(0.66 0.18 35);
  --sidebar: oklch(0.985 0.003 106);
  --sidebar-foreground: oklch(0.21 0.01 264);
  --sidebar-primary: oklch(0.55 0.22 264);
  --sidebar-primary-foreground: oklch(0.985 0.002 106);
  --sidebar-accent: oklch(0.96 0.01 264);
  --sidebar-accent-foreground: oklch(0.21 0.01 264);
  --sidebar-border: oklch(0.92 0.005 264);
  --sidebar-ring: oklch(0.55 0.22 264);
}`;

export const oklchDarkTokens = `.dark {
  --background: oklch(0.17 0.01 264);
  --foreground: oklch(0.96 0.005 264);
  --card: oklch(0.21 0.012 264);
  --card-foreground: oklch(0.96 0.005 264);
  --popover: oklch(0.21 0.012 264);
  --popover-foreground: oklch(0.96 0.005 264);
  --primary: oklch(0.62 0.19 264);
  --primary-foreground: oklch(0.17 0.01 264);
  --secondary: oklch(0.27 0.01 264);
  --secondary-foreground: oklch(0.96 0.005 264);
  --muted: oklch(0.27 0.01 264);
  --muted-foreground: oklch(0.68 0.01 264);
  --accent: oklch(0.27 0.014 264);
  --accent-foreground: oklch(0.96 0.005 264);
  --destructive: oklch(0.65 0.22 25);
  --destructive-foreground: oklch(0.96 0.005 264);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.62 0.19 264);
  --chart-1: oklch(0.62 0.19 264);
  --chart-2: oklch(0.65 0.16 180);
  --chart-3: oklch(0.70 0.15 75);
  --chart-4: oklch(0.68 0.18 310);
  --chart-5: oklch(0.70 0.16 40);
  --sidebar: oklch(0.21 0.012 264);
  --sidebar-foreground: oklch(0.96 0.005 264);
  --sidebar-primary: oklch(0.62 0.19 264);
  --sidebar-primary-foreground: oklch(0.17 0.01 264);
  --sidebar-accent: oklch(0.27 0.014 264);
  --sidebar-accent-foreground: oklch(0.96 0.005 264);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.62 0.19 264);
}`;

export const themeInlineTokens = `@theme inline {
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
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}`;

export const baseLayer = `@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}`;

/**
 * Web global.css — single source: imports @repo/ui/theme.css
 * Contains only imports + base layer, tokens live in @repo/ui/theme.css
 */
export function globalCssContent(): string {
  return `@import "tailwindcss";
@import "@repo/ui/theme.css";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

${baseLayer}
`;
}

/**
 * Mobile global.css — Uniwind + Tailwind + single source @repo/ui/theme.css
 * Must be imported in apps/mobile/app/_layout.tsx at top per Uniwind docs.
 */
export function mobileGlobalCssContent(): string {
  return `@import "tailwindcss";
@import "uniwind";
@import "@repo/ui/theme.css";
@import "tw-animate-css";

@source "./app/**/*.{js,jsx,ts,tsx}";
@source "./src/**/*.{js,jsx,ts,tsx}";
@source "./components/**/*.{js,jsx,ts,tsx}";

@custom-variant dark (&:is(.dark *));
`;
}
