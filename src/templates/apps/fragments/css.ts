// Package, single, web, and native outputs share this semantic token renderer.

export const tailwindImports = `@import "tailwindcss";
@import "@fontsource-variable/geist/wght.css";
@import "@fontsource-variable/geist-mono/wght.css";
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));`;

export const oklchDarkTokens = `.dark {
  --background: oklch(0.1949 0.0155 261.6);
  --foreground: oklch(0.9598 0.0091 258.3);
  --card: oklch(0.2374 0.0195 258.4);
  --card-foreground: oklch(0.9598 0.0091 258.3);
  --popover: oklch(0.2860 0.0255 255.7);
  --popover-foreground: oklch(0.9598 0.0091 258.3);
  --primary: oklch(0.7879 0.1066 266.9);
  --primary-foreground: oklch(0.1949 0.0155 261.6);
  --secondary: oklch(0.2860 0.0255 255.7);
  --secondary-foreground: oklch(0.9598 0.0091 258.3);
  --muted: oklch(0.2860 0.0255 255.7);
  --muted-foreground: oklch(0.7409 0.0262 257.7);
  --accent: oklch(0.3697 0.0418 260.8);
  --accent-foreground: oklch(0.9598 0.0091 258.3);
  --destructive: oklch(0.7834 0.1295 10.3);
  --destructive-foreground: oklch(0.1949 0.0155 261.6);
  --border: oklch(0.3697 0.0418 260.8);
  --input: oklch(0.5264 0.0398 256.4);
  --ring: oklch(0.7879 0.1066 266.9);
  --success: oklch(0.8036 0.1172 158.8);
  --warning: oklch(0.8166 0.1043 80.6);
  --code: oklch(0.2252 0.0216 260.5);
  --code-foreground: oklch(0.7875 0.0416 258.8);
  --chart-1: oklch(0.7879 0.1066 266.9);
  --chart-2: oklch(0.72 0.08 225);
  --chart-3: oklch(0.64 0.12 267);
  --chart-4: oklch(0.84 0.05 255);
  --chart-5: oklch(0.58 0.07 245);
  --sidebar: oklch(0.2374 0.0195 258.4);
  --sidebar-foreground: oklch(0.9598 0.0091 258.3);
  --sidebar-primary: oklch(0.7879 0.1066 266.9);
  --sidebar-primary-foreground: oklch(0.1949 0.0155 261.6);
  --sidebar-accent: oklch(0.2860 0.0255 255.7);
  --sidebar-accent-foreground: oklch(0.7879 0.1066 266.9);
  --sidebar-border: oklch(0.3697 0.0418 260.8);
  --sidebar-ring: oklch(0.7879 0.1066 266.9);
  --scrim: oklch(0.13 0.015 261 / 0.72);
  --elevation-control: 0 1px 2px oklch(0.13 0.015 261 / 0.16);
  --elevation-surface: 0 2px 8px oklch(0.13 0.015 261 / 0.12);
  --elevation-popover: 0 8px 24px -6px oklch(0.13 0.015 261 / 0.42);
  --elevation-modal: 0 24px 64px -16px oklch(0.13 0.015 261 / 0.6);
}`;

export const oklchLightTokens = `:root,
.light {
  --background: oklch(0.9759 0.0029 264.5);
  --foreground: oklch(0.2493 0.0114 278.0);
  --card: oklch(0.9965 0.0017 247.8);
  --card-foreground: oklch(0.2493 0.0114 278.0);
  --popover: oklch(0.9965 0.0017 247.8);
  --popover-foreground: oklch(0.2493 0.0114 278.0);
  --primary: oklch(0.5084 0.2059 266.9);
  --primary-foreground: oklch(0.9965 0.0017 247.8);
  --secondary: oklch(0.9543 0.0074 260.7);
  --secondary-foreground: oklch(0.2493 0.0114 278.0);
  --muted: oklch(0.9543 0.0074 260.7);
  --muted-foreground: oklch(0.5251 0.0247 259.2);
  --accent: oklch(0.9478 0.0162 262.8);
  --accent-foreground: oklch(0.5084 0.2059 266.9);
  --destructive: oklch(0.5201 0.1806 18.2);
  --destructive-foreground: oklch(0.9965 0.0017 247.8);
  --border: oklch(0.9108 0.0139 258.3);
  --input: oklch(0.6662 0.0301 258.4);
  --ring: oklch(0.5084 0.2059 266.9);
  --success: oklch(0.4916 0.1117 156.0);
  --warning: oklch(0.4959 0.1065 71.5);
  --code: oklch(0.9633 0.0074 260.7);
  --code-foreground: oklch(0.3697 0.0418 260.8);
  --chart-1: oklch(0.5084 0.2059 266.9);
  --chart-2: oklch(0.55 0.09 225);
  --chart-3: oklch(0.67 0.14 267);
  --chart-4: oklch(0.76 0.06 255);
  --chart-5: oklch(0.43 0.07 245);
  --sidebar: oklch(0.9965 0.0017 247.8);
  --sidebar-foreground: oklch(0.2493 0.0114 278.0);
  --sidebar-primary: oklch(0.5084 0.2059 266.9);
  --sidebar-primary-foreground: oklch(0.9965 0.0017 247.8);
  --sidebar-accent: oklch(0.9478 0.0162 262.8);
  --sidebar-accent-foreground: oklch(0.5084 0.2059 266.9);
  --sidebar-border: oklch(0.9108 0.0139 258.3);
  --sidebar-ring: oklch(0.5084 0.2059 266.9);
  --scrim: oklch(0.1949 0.0155 261.6 / 0.48);
  --elevation-control: 0 1px 2px oklch(0.2493 0.0114 278 / 0.06);
  --elevation-surface: 0 2px 8px oklch(0.2493 0.0114 278 / 0.035);
  --elevation-popover: 0 8px 24px -6px oklch(0.2493 0.0114 278 / 0.16);
  --elevation-modal: 0 24px 64px -16px oklch(0.2493 0.0114 278 / 0.24);
  --radius: 0.75rem;
  --layer-navigation: 20;
  --layer-overlay: 40;
  --layer-modal: 50;
  --layer-popover: 60;
  --layer-tooltip: 70;
  --layer-toast: 80;
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
  "scrim",
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
  --radius-sm: calc(var(--radius) - 6px);
  --radius-md: calc(var(--radius) - 4px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --shadow-control: var(--elevation-control);
  --shadow-surface: var(--elevation-surface);
  --shadow-popover: var(--elevation-popover);
  --shadow-modal: var(--elevation-modal);
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

export const baseLayer = `@theme inline {
  --font-sans: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

@layer base {
  :root {
    --font-geist-sans: "Geist Variable";
    --font-geist-mono: "Geist Mono Variable";
  }
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    line-height: 1.6;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3, .display {
    letter-spacing: var(--tracking-display);
    text-wrap: balance;
  }
  ::selection {
    background-color: var(--primary);
    color: var(--primary-foreground);
  }
  code, pre, kbd, samp {
    font-family: var(--font-mono);
  }
}`;

export function semanticThemeCssContent(): string {
  return `${oklchLightTokens}

${oklchDarkTokens}

${themeInlineTokens}

${uniwindVariantLayer}
`;
}

export function standaloneWebGlobalCssContent(): string {
  return `${tailwindImports}

${semanticThemeCssContent()}
${baseLayer}
`;
}

export function globalCssContent(): string {
  return `@import "tailwindcss";
@import "@fontsource-variable/geist/wght.css";
@import "@fontsource-variable/geist-mono/wght.css";
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
