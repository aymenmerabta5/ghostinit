import type { DesktopMode } from "../model.js";

function utilitiesSpecifier(mode: DesktopMode): string {
  return mode === "monorepo" ? "@repo/ui/lib/utils" : "@/platform/ui/lib/utils";
}

export function desktopUiBadgeContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "${utilitiesSpecifier(mode)}";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-destructive/50 bg-background text-destructive",
        outline: "border-input text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <div data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
`;
}

export function desktopUiEmptyContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${utilitiesSpecifier(mode)}";

export const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty" className={cn("flex w-full flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-6 text-center", className)} {...props} />
  ),
);
Empty.displayName = "Empty";

export const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...props} />
  ),
);
EmptyHeader.displayName = "EmptyHeader";

export const EmptyTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} data-slot="empty-title" className={cn("text-base font-medium", className)} {...props} />
  ),
);
EmptyTitle.displayName = "EmptyTitle";

export const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="empty-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
EmptyDescription.displayName = "EmptyDescription";

export const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty-content" className={cn("flex items-center gap-2", className)} {...props} />
  ),
);
EmptyContent.displayName = "EmptyContent";
`;
}

export function desktopUiSkeletonContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${utilitiesSpecifier(mode)}";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
`;
}

export function desktopUiSeparatorContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${utilitiesSpecifier(mode)}";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps): React.JSX.Element {
  return <div role="separator" aria-orientation={orientation} data-slot="separator" className={cn(orientation === "horizontal" ? "h-px w-full bg-border" : "h-full w-px bg-border", className)} {...props} />;
}
`;
}
