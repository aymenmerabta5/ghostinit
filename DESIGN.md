# DESIGN.md — GhostInit Design System

**Inspired by https://t3.codes/ — the open-source control plane for coding agents. Dark-first, terminal-native, high-contrast, developer-trusted.**

## Scene

A solo founder at 2am in a dim room, 14-inch MacBook, external monitor showing a monorepo with 12 packages, terminal at the bottom, browser with the app's dashboard. The light is low, the code is the focus, the design should disappear into the task after the initial impression. This is not a SaaS dashboard for a manager; it's a control plane for a builder.

## Color Strategy: Restrained with One Committed Accent

**Restrained base + Committed accent.** Tinted neutrals carry 90% of the surface; one saturated accent carries selection, primary actions, and code highlights.

**Why restrained?** Product surfaces (dashboard, settings, admin) need to be scannable for hours. A drenched palette would fatigue. The brand surface (marketing landing) can push to Committed/Drenched for the hero, but the product stays restrained.

### OKLCH Tokens (Single Source: `packages/ui/src/theme.css`)

All values are OKLCH with low chroma at extremes (0.005–0.01) so black/white are tinted toward the brand hue, never pure #000/#fff.

**Dark (default):**

```css
--background: oklch(0.09 0.01 264); /* near-black, blue-tinted, like t3.codes */
--foreground: oklch(0.98 0.005 264); /* paper white, cool tint */
--card: oklch(0.13 0.01 264); /* slightly lifted from background for depth */
--card-foreground: oklch(0.98 0.005 264);
--popover: oklch(0.13 0.01 264);
--popover-foreground: oklch(0.98 0.005 264);
--primary: oklch(0.65 0.22 264); /* vibrant indigo, like t3's harness accent */
--primary-foreground: oklch(0.98 0.005 264);
--secondary: oklch(0.18 0.01 264);
--secondary-foreground: oklch(0.98 0.005 264);
--muted: oklch(0.18 0.01 264);
--muted-foreground: oklch(0.65 0.015 264); /* muted text, still tinted */
--accent: oklch(0.18 0.01 264);
--accent-foreground: oklch(0.98 0.005 264);
--border: oklch(0.22 0.01 264); /* visible but not harsh */
--input: oklch(0.22 0.01 264);
--ring: oklch(0.65 0.22 264);
--radius: 0.5rem; /* tighter than before (0.625 → 0.5) for more technical feel */
```

**Light (alternative):**

```css
--background: oklch(0.99 0.005 264); /* paper white, cool tint */
--foreground: oklch(0.14 0.01 264);
--card: oklch(0.99 0.005 264);
--card-foreground: oklch(0.14 0.01 264);
--primary: oklch(0.55 0.22 264); /* slightly darker for light contrast */
...
--border: oklch(0.92 0.01 264);
```

**Chart & Sidebar:** Desaturate as lightness increases. `chart-1` is primary at 0.65/0.22, `chart-2` at 0.68/0.14, etc. Sidebar uses same tokens as card, slightly darker for dark mode.

**@theme inline** maps `--color-*` to `var(--*)` for Tailwind. **@layer theme** with `@variant light`/`@variant dark` for Uniwind compat (mobile).

### Elevation

- No shadows as default. Borders carry the structure (like t3.codes). Shadows only on popovers/dialogs (`shadow-lg` on `DropdownMenuContent`, `DialogContent`).
- Cards use `border bg-card` with no shadow, `rounded-lg` (0.5rem) not `xl`. Feels more tool-like, less marketing.

## Typography

**Product: One family, system native.** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` for everything except code. No display/body pairing; weight and size do the work.

- **Scale:** 1.2 ratio between steps (tighter than brand's 1.25+). More elements on product screens; exaggerated contrast creates noise.
- **Headings:** `text-2xl font-semibold tracking-tight` for page titles, `text-base font-medium` for card titles. No fluid `clamp()` — fixed rem, users sit at consistent DPI.
- **Body:** `text-sm` (14px) is the default for product UI, not `base`. `text-xs` for metadata. Line length 65ch for prose, denser for tables.
- **Code:** `font-mono text-xs` with `oklch(0.65 0.015 264)` for muted, `primary` for highlights. Use for `turbo.json`, `ghostinit create`, `oRPC` snippets.
- **Brand (marketing hero):** Can use larger `text-4xl md:text-5xl` with `tracking-tight` and `font-semibold`, but still system sans. No serif for this dev tool; serif would be Editorial reflex.

**Line height:** `leading-relaxed` for prose, `leading-none` for headings. Dark mode text gets `+0.05` line-height (light type reads lighter).

## Layout

**Product: Predictable grids, familiar patterns.**

- Top bar `h-14` with `max-w-6xl mx-auto px-6`, not full-bleed. Like t3.codes' header.
- Sidebar (when present) `w-64` with `bg-card border-r`, not floating.
- Cards in `grid-cols-1 md:grid-cols-3` for dashboard, `md:grid-cols-12` for marketing. Use `auto-fit minmax(280px,1fr)` when cards are the right affordance, but prefer lists/tables for dense data.
- **No nested cards.** Ever. Use `Separator` or `border-t`.
- **No identical card grids** with icon+heading+text repeated. Vary: one large `md:col-span-7` + one `md:col-span-5`, or a list with leading icons.

**Brand (marketing):**

- Hero with left-aligned, asymmetric: heading + sub + two CTAs + `Badge` + trust bar. Not centered-stack.
- Code snippet as hero imagery: `ghostinit create demo --billing stripe,chargily` in a `pre` with `bg-card border` and `font-mono`, not a stock photo.
- Social proof as a horizontal scroller (like t3.codes testimonials), not a grid.

## Components

**Button:** `h-9` default (not `h-10`), `rounded-md`, `gap-2`. Variants: `default` (primary), `outline` (border), `ghost` (hover accent), `secondary`. No `destructive` heavy color on idle — only on hover. `asChild` maps to Base UI `render` with `nativeButton={false}` when wrapping `<a>`.

**Input:** `h-9`, `border-input`, `bg-background`, `focus:ring-ring`. No inner shadows.

**Card:** `rounded-lg border bg-card`, `p-6` header, `p-6 pt-0` content. No shadow by default. `CardTitle` `text-base font-medium`, `CardDescription` `text-sm text-muted-foreground`.

**Badge:** `rounded-full` for status, `rounded-md` for tech. `variant=secondary` for muted.

**Dialog/Dropdown:** Portal + Positioner + Popup with `shadow-lg` and `animate-in` (150ms ease-out-quart).

**Empty States:** Teach, don't just say "nothing". `EmptyTitle` + `EmptyDescription` with `max-w-[60ch]` and a primary action.

## Motion

- **Product:** 150–200ms, ease-out-quart. Hover `transition-colors`, focus `ring-2`, dialog `animate-in fade-in zoom-in 95%`. No page-load choreography.
- **Brand:** Can have one well-orchestrated hero reveal (staggered `animate-in` on heading, sub, CTAs), but not scattered.

## Imagery

**Code is imagery.** No stock photos. Hero is a terminal: `bunx ghostinit create demo --yes --no-install` with syntax highlighting (muted = comment gray, primary = command white, accent = flag). If you must add an image, use a real screenshot of the generated monorepo (like t3.codes' updated-screenshot.webp), not a colored div.

## Theme

Dark is the scene: 2am, dim room, code. Light is a toggle for those who need it, not the hero. The `ThemeToggle` is in the header, not hidden.

## Cross-Platform Consistency

All targets (`apps/web` Next, `apps/web` TanStack Start, `apps/mobile` Expo, `apps/desktop` Electron) import the same `packages/ui/src/theme.css` via `@import "@repo/ui/theme.css"`. Mobile's `global.css` does `@import "tailwindcss"; @import "uniwind"; @import "@repo/ui/theme.css"; @import "tw-animate-css";`. Desktop's `index.css` does `@import "tailwindcss"; @import "@repo/ui/theme.css";`.

One edit to `--primary` in `theme.css` updates all after restart. Verified via `bun run dev` on each.

## Bans Enforced

- No `border-left: 4px` side-stripes
- No `background-clip: text` gradient text
- No glassmorphism
- No hero-metric (big number + label)
- No modal as first thought (use inline sheet or inline form)
