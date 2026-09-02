import { file, type TemplateFile } from "../../../shared.js";

export function overlaysFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/tooltip.tsx",
      `"use client";

import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils.js";

export const TooltipProvider = BaseTooltip.Provider;
export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;
export const TooltipPortal = BaseTooltip.Portal;

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> {
  /** Base UI puts \`sideOffset\` on the Positioner, not the Popup. */
  sideOffset?: number;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 4, ...props }, ref) => (
  <BaseTooltip.Portal>
    <BaseTooltip.Positioner sideOffset={sideOffset}>
      <BaseTooltip.Popup
        ref={ref}
        data-slot="tooltip-content"
        className={cn(
          "overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </BaseTooltip.Positioner>
  </BaseTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";
`,
    ),
    file(
      "apps/web/src/components/ui/popover.tsx",
      `"use client";

import * as React from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "../../lib/utils.js";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverPortal = BasePopover.Portal;

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Popup> & { sideOffset?: number; align?: "center" | "start" | "end" }
>(({ className, sideOffset = 4, align = "center", ...props }, ref) => (
  <BasePopover.Portal>
    <BasePopover.Positioner sideOffset={sideOffset} align={align}>
      <BasePopover.Popup
        ref={ref}
        data-slot="popover-content"
        className={cn(
          "w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </BasePopover.Positioner>
  </BasePopover.Portal>
));
PopoverContent.displayName = "PopoverContent";

export const PopoverTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Title>
>(({ className, ...props }, ref) => (
  <BasePopover.Title ref={ref} data-slot="popover-title" className={cn("font-medium leading-none", className)} {...props} />
));
PopoverTitle.displayName = "PopoverTitle";

export const PopoverDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BasePopover.Description>
>(({ className, ...props }, ref) => (
  <BasePopover.Description ref={ref} data-slot="popover-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
));
PopoverDescription.displayName = "PopoverDescription";
`,
    ),
  ];
}

export function sheetFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/sheet.tsx",
      `"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { useSurfaceTranslations } from "../../lib/translations.js";

export const Sheet = BaseDialog.Root;
export const SheetTrigger = BaseDialog.Trigger;
export const SheetPortal = BaseDialog.Portal;
export const SheetClose = BaseDialog.Close;

function SheetCloseLabel(): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  return <span className="sr-only">{t("close")}</span>;
}

export const SheetOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      "fixed inset-0 bg-foreground/40 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

const sheetVariants = cva(
  "fixed gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[open]:animate-in data-[closed]:animate-out data-[closed]:duration-300 data-[open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[closed]:slide-out-to-top data-[open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[closed]:slide-out-to-bottom data-[open]:slide-in-from-bottom",
        start: "inset-y-0 start-0 h-full w-3/4 border-e data-[closed]:slide-out-to-left data-[open]:slide-in-from-left rtl:data-[closed]:slide-out-to-right rtl:data-[open]:slide-in-from-right sm:max-w-sm",
        end: "inset-y-0 end-0 h-full w-3/4 border-s data-[closed]:slide-out-to-right data-[open]:slide-in-from-right rtl:data-[closed]:slide-out-to-left rtl:data-[open]:slide-in-from-left sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "end",
    },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>,
    VariantProps<typeof sheetVariants> {
  showCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "end", className, children, showCloseButton = true, ...props }, ref) => (
    <BaseDialog.Portal>
      <SheetOverlay />
      <BaseDialog.Popup ref={ref} data-slot="sheet-content" className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {showCloseButton && (
          <BaseDialog.Close
            data-slot="sheet-close"
            className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X aria-hidden />
            <SheetCloseLabel />
          </BaseDialog.Close>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  ),
);
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="sheet-header" className={cn("flex flex-col gap-2 text-center sm:text-start", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

export const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="sheet-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title ref={ref} data-slot="sheet-title" className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description ref={ref} data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";
`,
    ),
    file(
      "apps/web/src/components/ui/breadcrumb.tsx",
      `"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { useSurfaceTranslations } from "../../lib/translations.js";

export const Breadcrumb = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<"nav"> & { separator?: React.ReactNode }>(
  function Breadcrumb({ className, ...props }, ref) {
    const t = useSurfaceTranslations("common");
    return <nav ref={ref} aria-label={t("breadcrumb")} data-slot="breadcrumb" className={cn("", className)} {...props} />;
  },
);
Breadcrumb.displayName = "Breadcrumb";

export const BreadcrumbList = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      data-slot="breadcrumb-list"
      className={cn("flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5", className)}
      {...props}
    />
  ),
);
BreadcrumbList.displayName = "BreadcrumbList";

export const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-slot="breadcrumb-item" className={cn("inline-flex items-center gap-1.5", className)} {...props} />
  ),
);
BreadcrumbItem.displayName = "BreadcrumbItem";

export interface BreadcrumbLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  ref?: React.Ref<HTMLAnchorElement>;
}

export function BreadcrumbLink({ className, ref, ...props }: BreadcrumbLinkProps): React.JSX.Element {
  return (
    <a
      ref={ref}
      data-slot="breadcrumb-link"
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    />
  );
}

export const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page" className={cn("font-normal text-foreground", className)} {...props} />
  ),
);
BreadcrumbPage.displayName = "BreadcrumbPage";

export const BreadcrumbSeparator = ({ children, className, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
  <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={className} {...props}>
    {children ?? <ChevronRight className="rtl:rotate-180" aria-hidden />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";
`,
    ),
  ];
}
