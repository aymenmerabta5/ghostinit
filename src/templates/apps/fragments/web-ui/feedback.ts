import { file, type TemplateFile } from "../../../shared.js";

export function feedbackFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/avatar.tsx",
      `"use client";

import * as React from "react";
import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "../../lib/utils.js";

export const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Root>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Root
    ref={ref}
    data-slot="avatar"
    className={cn("relative flex size-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = "Avatar";

export const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Image>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn("aspect-square size-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof BaseAvatar.Fallback>
>(({ className, ...props }, ref) => (
  <BaseAvatar.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";
`,
    ),
    file(
      "apps/web/src/components/ui/sonner.tsx",
      `"use client";

import { Toaster as SonnerToaster, type ToasterProps as SonnerToasterProps } from "sonner";
import { useTheme } from "next-themes";

export type ToasterProps = SonnerToasterProps;

export function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system";

  return (
    <SonnerToaster
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
`,
    ),
    file(
      "apps/web/src/components/ui/empty.tsx",
      `"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

export const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-6 text-center text-balance md:p-12 bg-card",
        className,
      )}
      {...props}
    />
  ),
);
Empty.displayName = "Empty";

export const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)} {...props} />
  ),
);
EmptyHeader.displayName = "EmptyHeader";

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

export const EmptyTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty-title" className={cn("text-lg font-medium tracking-tight", className)} {...props} />
  ),
);
EmptyTitle.displayName = "EmptyTitle";

export const EmptyDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="empty-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
EmptyDescription.displayName = "EmptyDescription";

export const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="empty-content"
      className={cn("flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance", className)}
      {...props}
    />
  ),
);
EmptyContent.displayName = "EmptyContent";
`,
    ),
    file(
      "apps/web/src/components/ui/separator.tsx",
      `"use client";

import * as React from "react";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cn } from "../../lib/utils.js";

export const Separator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSeparator> & {
    orientation?: "horizontal" | "vertical";
  }
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <BaseSeparator
    ref={ref}
    orientation={orientation}
    data-slot="separator"
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className,
    )}
    {...props}
  />
));
Separator.displayName = "Separator";
`,
    ),
    file(
      "apps/web/src/components/ui/skeleton.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
`,
    ),
    file(
      "apps/web/src/components/ui/spinner.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";
import { useSurfaceTranslations } from "../../lib/translations.js";

export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const t = useSurfaceTranslations("common");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      data-slot="spinner"
      className={cn("size-4 animate-spin rounded-full border-2 border-muted border-t-foreground", className)}
      {...props}
    >
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
`,
    ),
  ];
}
