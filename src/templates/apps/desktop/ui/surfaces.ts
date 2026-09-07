import type { DesktopMode } from "../model.js";

function utilitiesSpecifier(mode: DesktopMode): string {
  return mode === "monorepo" ? "@repo/ui/lib/utils" : "@/platform/ui/lib/utils";
}

export function desktopUiTextareaContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${utilitiesSpecifier(mode)}";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
`;
}

export function desktopUiAlertContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "${utilitiesSpecifier(mode)}";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border bg-card text-card-foreground",
        destructive: "border-destructive/50 bg-card text-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    data-slot="alert"
    data-variant={variant}
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    data-slot="alert-title"
    className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="alert-description"
    className={cn("col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";
`;
}

export function desktopUiSelectContent(mode: DesktopMode = "monorepo"): string {
  return `"use client";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "${utilitiesSpecifier(mode)}";

export interface SelectOption {
  readonly label: React.ReactNode;
  readonly value: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly children: React.ReactNode;
  readonly items: readonly SelectOption[];
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly name?: string;
}

export function Select({ items, value, onValueChange, ...props }: SelectProps): React.JSX.Element {
  return (
    <BaseSelect.Root<string>
      items={items}
      value={value}
      onValueChange={(next) => { if (next !== null) onValueChange?.(next); }}
      {...props}
    />
  );
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronsUpDown data-icon="inline-end" aria-hidden />
  </BaseSelect.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Value>
>(({ className, ...props }, ref) => (
  <BaseSelect.Value ref={ref} data-slot="select-value" className={cn("truncate", className)} {...props} />
));
SelectValue.displayName = "SelectValue";

export const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Popup>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Portal>
    <BaseSelect.Positioner alignItemWithTrigger={false} sideOffset={4}>
      <BaseSelect.Popup
        ref={ref}
        data-slot="select-content"
        className={cn(
          "min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        <BaseSelect.List>{children}</BaseSelect.List>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  </BaseSelect.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Group>
>((props, ref) => <BaseSelect.Group ref={ref} data-slot="select-group" {...props} />);
SelectGroup.displayName = "SelectGroup";

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Item> {
  readonly value: string;
}

export const SelectItem = React.forwardRef<HTMLElement, SelectItemProps>(
  ({ className, children, ...props }, ref) => (
    <BaseSelect.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 ps-8 pe-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="absolute start-2 flex items-center justify-center">
        <Check aria-hidden />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  ),
);
SelectItem.displayName = "SelectItem";
`;
}
