import { file, type TemplateFile } from "../../../shared.js";
import { selectFiles } from "./select.js";

export function missingUiFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/textarea.tsx",
      `"use client";
import * as React from "react";
import { cn } from "../../lib/utils.js";
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn("flex min-h-28 w-full min-w-0 resize-y rounded-md border border-input bg-card px-3 py-2.5 text-base leading-6 text-card-foreground shadow-control ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 md:text-sm", className)} {...props} />
));
Textarea.displayName = "Textarea";
`,
    ),
    ...selectFiles(),
    file(
      "apps/web/src/components/ui/checkbox.tsx",
      `"use client";
import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";
export const Checkbox = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseCheckbox.Root>>(({ className, ...props }, ref) => (
  <BaseCheckbox.Root ref={ref} data-slot="checkbox" className={cn("peer mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-card shadow-control ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground", className)} {...props}>
    <BaseCheckbox.Indicator className="flex items-center justify-center text-current [&_svg]:size-3"><Check aria-hidden /></BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
));
Checkbox.displayName = "Checkbox";
`,
    ),
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
export const AlertDialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Backdrop>>(({ className, ...props }, ref) => <BaseAlertDialog.Backdrop ref={ref} data-slot="alert-dialog-overlay" className={cn("fixed inset-0 z-[var(--layer-overlay)] bg-scrim", className)} {...props} />);
AlertDialogOverlay.displayName = "AlertDialogOverlay";
export const AlertDialogContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Popup>>(({ className, ...props }, ref) => (
  <BaseAlertDialog.Portal>
    <AlertDialogOverlay />
    <BaseAlertDialog.Popup ref={ref} data-slot="alert-dialog-content" className={cn("fixed start-1/2 top-1/2 z-[var(--layer-modal)] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-modal duration-150 rtl:translate-x-1/2 sm:p-7", className)} {...props} />
  </BaseAlertDialog.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";
export const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-2 text-start", className)} {...props} />;
export const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div data-slot="alert-dialog-footer" className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)} {...props} />;
export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Title>>(({ className, ...props }, ref) => <BaseAlertDialog.Title ref={ref} data-slot="alert-dialog-title" className={cn("text-xl font-semibold leading-snug tracking-tight", className)} {...props} />);
AlertDialogTitle.displayName = "AlertDialogTitle";
export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Description>>(({ className, ...props }, ref) => <BaseAlertDialog.Description ref={ref} data-slot="alert-dialog-description" className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />);
AlertDialogDescription.displayName = "AlertDialogDescription";
export const AlertDialogAction = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close> & { variant?: string } >(({ className, ...props }, ref) => <BaseAlertDialog.Close ref={ref} className={cn(buttonVariants(), className)} {...props} />);
AlertDialogAction.displayName = "AlertDialogAction";
export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof BaseAlertDialog.Close>>(({ className, ...props }, ref) => <BaseAlertDialog.Close ref={ref} className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />);
AlertDialogCancel.displayName = "AlertDialogCancel";
`,
    ),
  ];
}
