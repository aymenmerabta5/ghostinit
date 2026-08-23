import { file, type TemplateFile } from "../../../shared.js";

// Generic missing primitives needed by form-fields/dialogs — minimal, framework-agnostic
// These were absent, causing generation-matrix alias resolution failure for
// @/components/ui/select, textarea, checkbox, dialog, alert-dialog.

export function missingUiFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/textarea.tsx",
      `"use client";
import * as React from "react";
import { cn } from "../../lib/utils.js";
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn("flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />
));
Textarea.displayName = "Textarea";
`,
    ),
    file(
      "apps/web/src/components/ui/select.tsx",
      `"use client";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface SelectOption {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
}

export interface SelectProps {
  children: React.ReactNode;
  items: readonly SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
  placeholder?: string;
}

export function Select({
  items,
  placeholder,
  value,
  onValueChange,
  disabled,
  ...props
}: SelectProps): React.JSX.Element {
  const resolvedItems = placeholder ? [{ label: placeholder, value: null }, ...items] : items;
  const handleValueChange = (next: string | null): void => {
    if (next !== null) onValueChange?.(next);
  };
  return (
    <BaseSelect.Root<string>
      items={resolvedItems}
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled}
      {...props}
    />
  );
}

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger> {
  ref?: React.Ref<HTMLButtonElement>;
}

export function SelectTrigger({
  className,
  children,
  ref,
  ...props
}: SelectTriggerProps): React.JSX.Element {
  return (
    <BaseSelect.Trigger
      ref={ref}
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronsUpDown data-icon="inline-end" aria-hidden />
    </BaseSelect.Trigger>
  );
}

export interface SelectValueProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Value> {
  ref?: React.Ref<HTMLSpanElement>;
}

export function SelectValue({ className, ref, ...props }: SelectValueProps): React.JSX.Element {
  return (
    <BaseSelect.Value
      ref={ref}
      data-slot="select-value"
      className={cn("truncate data-[placeholder]:text-muted-foreground", className)}
      {...props}
    />
  );
}

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Popup> {
  ref?: React.Ref<HTMLDivElement>;
}

export function SelectContent({
  className,
  children,
  ref,
  ...props
}: SelectContentProps): React.JSX.Element {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner alignItemWithTrigger={false} sideOffset={4}>
        <BaseSelect.Popup
          ref={ref}
          data-slot="select-content"
          className={cn(
            "min-w-[var(--anchor-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
            className,
          )}
          {...props}
        >
          <BaseSelect.List>{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export interface SelectGroupProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Group> {
  ref?: React.Ref<HTMLDivElement>;
}

export const SelectGroup = ({ ref, ...props }: SelectGroupProps): React.JSX.Element => {
  return <BaseSelect.Group ref={ref} data-slot="select-group" {...props} />;
};

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Item> {
  value: string;
  ref?: React.Ref<HTMLElement>;
}

export function SelectItem({
  className,
  children,
  ref,
  ...props
}: SelectItemProps): React.JSX.Element {
  return (
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
  );
}
`,
    ),
    file(
      "apps/web/src/components/ui/checkbox.tsx",
      `"use client";
import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";
export const Checkbox = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root>>(({ className, ...props }, ref) => (
  <BaseCheckbox.Root ref={ref} data-slot="checkbox" className={cn("peer size-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:text-primary-foreground", className)} {...props}>
    <BaseCheckbox.Indicator className="flex items-center justify-center text-current"><Check aria-hidden /></BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
));
Checkbox.displayName = "Checkbox";
`,
    ),
    // dialog.tsx already emitted by layout.ts — do not duplicate here to avoid composer conflict
    file(
      "apps/web/src/components/ui/alert-dialog.tsx",
      `"use client";
import * as React from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "../../lib/utils.js";
import { buttonVariants } from "./button.js";
export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogPortal = BaseAlertDialog.Portal;
export const AlertDialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Backdrop>>(({ className, ...props }, ref) => <BaseAlertDialog.Backdrop ref={ref} data-slot="alert-dialog-overlay" className={cn("fixed inset-0 bg-foreground/40", className)} {...props} />);
AlertDialogOverlay.displayName = "AlertDialogOverlay";
export const AlertDialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Popup>>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Portal>
    <BaseAlertDialog.Backdrop className="fixed inset-0 bg-foreground/40" />
    <BaseAlertDialog.Popup ref={ref} data-slot="alert-dialog-content" className={cn("fixed start-1/2 top-1/2 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200", className)} {...props} />
  </BaseAlertDialog.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";
export const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-2 text-center sm:text-start", className)} {...props} />;
export const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div data-slot="alert-dialog-footer" className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2", className)} {...props} />;
export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Title>>(({ className, ...props }, ref) => <BaseAlertDialog.Title ref={ref} data-slot="alert-dialog-title" className={cn("text-lg font-semibold", className)} {...props} />);
AlertDialogTitle.displayName = "AlertDialogTitle";
export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Description>>(({ className, ...props }, ref) => <BaseAlertDialog.Description ref={ref} data-slot="alert-dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />);
AlertDialogDescription.displayName = "AlertDialogDescription";
export const AlertDialogAction = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close> & { variant?: string } >(({ className, ...props }, ref) => <BaseAlertDialog.Close ref={ref} className={cn(buttonVariants(), className)} {...props} />);
AlertDialogAction.displayName = "AlertDialogAction";
export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close>>(({ className, ...props }, ref) => <BaseAlertDialog.Close ref={ref} className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />);
AlertDialogCancel.displayName = "AlertDialogCancel";
`,
    ),
  ];
}
