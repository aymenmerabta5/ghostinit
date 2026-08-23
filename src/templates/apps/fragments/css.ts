/**
 * Shared OKLCH design tokens + Tailwind v4 global CSS
 * DARK-FIRST — near-black, high-contrast, terminal-native
 * Palette: bg #09090b (oklch 0.15 0.01 285), card #111113 (0.18 0.01 285), fg #fafafa (0.985), muted #a1a1aa(0.71)/#71717a(0.55)/#52525b(0.44), border rgba(255,255,255,0.08) → 0.27 / 0.14→0.32, accent oklch 0.68 0.17 262 (~#6b7cff), ok #4ac06c, warn #e8a127, danger #ff3b4a
 * Radius: 12px (0.75rem), 8px (sm), 16px (xl)
 * Fonts: DM Sans 400/500/600 + JetBrains Mono 400/500, tracking -0.035em display, mono 11px meta
 * Grain: feTurbulence baseFrequency 0.9 4 octaves opacity 0.035 fixed z-9999
 * Grid: 48px grid with radial mask for hero
 * Deduplicates 95% identical global CSS between Next (app/globals.css) and TanStack (styles/app.css)
 * Both use same tokens: dark is default, light is toggle.
 * After RNR+Uniwind refactor: theme tokens live in @repo/ui/src/theme.css (single source).
 * Web and mobile both @import that file.
 */

export const tailwindImports = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));
`;

export const oklchLightTokens = `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.15 0.01 285);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.15 0.01 285);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.15 0.01 285);
  --primary: oklch(0.60 0.19 262);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.967 0.01 285);
  --secondary-foreground: oklch(0.15 0.01 285);
  --muted: oklch(0.967 0.01 285);
  --muted-foreground: oklch(0.55 0.014 285);
  --accent: oklch(0.967 0.01 285);
  --accent-foreground: oklch(0.15 0.01 285);
  --destructive: oklch(0.60 0.24 27);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.92 0.01 285);
  --input: oklch(0.92 0.01 285);
  --ring: oklch(0.60 0.19 262);
  --success: oklch(0.58 0.14 150);
  --warning: oklch(0.60 0.13 75);
  --code: oklch(0.965 0.006 285);
  --code-foreground: oklch(0.28 0.01 285);
  --radius: 0.75rem;
  --chart-1: oklch(0.60 0.19 262);
  --chart-2: oklch(0.72 0.16 150);
  --chart-3: oklch(0.62 0.12 150);
  --chart-4: oklch(0.76 0.15 75);
  --chart-5: oklch(0.60 0.18 35);
  --sidebar: oklch(0.985 0.01 285);
  --sidebar-foreground: oklch(0.15 0.01 285);
  --sidebar-primary: oklch(0.60 0.19 262);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.967 0.01 285);
  --sidebar-accent-foreground: oklch(0.15 0.01 285);
  --sidebar-border: oklch(0.92 0.01 285);
  --sidebar-ring: oklch(0.60 0.19 262);
}`;

export const oklchDarkTokens = `.dark {
  --background: oklch(0.15 0.01 285);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0.01 285);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0.01 285);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.68 0.17 262);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.21 0.01 285);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.21 0.01 285);
  --muted-foreground: oklch(0.71 0.013 285);
  --accent: oklch(0.21 0.01 285);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.63 0.24 27);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.27 0.01 285);
  --input: oklch(0.32 0.01 285);
  --ring: oklch(0.68 0.17 262);
  --success: oklch(0.72 0.16 150);
  --warning: oklch(0.76 0.15 75);
  --code: oklch(0.12 0.01 285);
  --code-foreground: oklch(0.80 0.012 285);
  --chart-1: oklch(0.68 0.17 262);
  --chart-2: oklch(0.72 0.16 150);
  --chart-3: oklch(0.62 0.12 150);
  --chart-4: oklch(0.76 0.15 75);
  --chart-5: oklch(0.66 0.18 35);
  --sidebar: oklch(0.18 0.01 285);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.68 0.17 262);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.21 0.01 285);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.27 0.01 285);
  --sidebar-ring: oklch(0.68 0.17 262);
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
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-code: var(--code);
  --color-code-foreground: var(--code-foreground);
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
  --font-sans: "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --tracking-display: -0.035em;
}`;

// grain overlay: feTurbulence baseFrequency 0.9 numOctaves 4, opacity 0.035, fixed, z-9999
export const grainOverlayCss = `/* grain — feTurbulence baseFrequency 0.9, 4 octaves, opacity 0.035, fixed, z-9999 */
.grain-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.035;
}
.grain-overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}`;

// hero grid: 48px grid with radial mask
export const heroGridCss = `/* hero — 48px grid with radial mask */
.hero-grid {
  background-size: 48px 48px;
  background-image:
    linear-gradient(to right, var(--border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--border) 1px, transparent 1px);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 70%, transparent 110%);
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 70%, transparent 110%);
}
.display-tight {
  letter-spacing: -0.035em;
}
.text-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.02em;
}`;

export const baseLayer = `@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans);
    font-feature-settings: "ss01" 1, "ss02" 1;
  }
  h1, h2, h3, .display {
    letter-spacing: var(--tracking-display);
  }
  code, pre, kbd, samp {
    font-family: var(--font-mono);
  }
}`;

/**
 * Web global.css — single source: imports @repo/ui/theme.css
 * Contains only imports + base layer, tokens live in @repo/ui/theme.css
 * Fonts are loaded per-framework: Next via next/font, TanStack via <link> in __root, Mobile via expo-font
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
@custom-variant light (&:is(.light *));
`;
}
