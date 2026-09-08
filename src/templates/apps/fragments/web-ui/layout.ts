import { file, type TemplateFile } from "../../../shared.js";

export function layoutFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/tabs.tsx",
      `"use client";

import * as React from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "../../lib/utils.js";

export const Tabs = BaseTabs.Root;

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.List>
>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    data-slot="tabs-list"
    className={cn(
      "inline-flex min-h-11 max-w-full items-center justify-center gap-1 rounded-lg border border-border bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    data-slot="tabs-trigger"
    className={cn(
      "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-card data-[active]:text-foreground data-[active]:shadow-control data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-control",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    data-slot="tabs-content"
    className={cn(
      "mt-5 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
`,
    ),
    file(
      "apps/web/src/components/ui/dialog.tsx",
      `"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { useSurfaceTranslations } from "../../lib/translations.js";

export const Dialog = BaseDialog.Root;
export const DialogPortal = BaseDialog.Portal;
export const DialogTrigger = BaseDialog.Trigger;

export const DialogBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 z-[var(--layer-overlay)] bg-scrim duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 motion-reduce:animate-none!",
      className,
    )}
    {...props}
  />
));
DialogBackdrop.displayName = "DialogBackdrop";

export const DialogClose = BaseDialog.Close;

function DialogCloseLabel(): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  return <span className="sr-only">{t("close")}</span>;
}

export const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <BaseDialog.Portal>
    <DialogBackdrop />
    <BaseDialog.Popup
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "fixed start-[50%] top-[50%] z-[var(--layer-modal)] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-modal duration-150 rtl:translate-x-[50%] data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none! sm:p-7",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <BaseDialog.Close
          data-slot="dialog-close"
          className="absolute end-4 top-4 flex size-8 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:size-4"
        >
          <X aria-hidden />
          <DialogCloseLabel />
        </BaseDialog.Close>
      )}
    </BaseDialog.Popup>
  </BaseDialog.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="dialog-header" className={cn("flex flex-col gap-2 pe-6 text-start", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title ref={ref} data-slot="dialog-title" className={cn("text-xl font-semibold leading-snug tracking-tight", className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description ref={ref} data-slot="dialog-description" className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";
`,
    ),
    file(
      "apps/web/src/components/ui/table.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div data-slot="table-container" className="relative w-full overflow-auto rounded-lg border border-border bg-card shadow-surface">
      <table ref={ref} data-slot="table" className={cn("w-full caption-bottom text-sm leading-6", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} data-slot="table-header" className={cn("bg-muted/60 [&_tr]:border-b", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} data-slot="table-footer" className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-accent/60", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn("h-11 whitespace-nowrap px-5 text-start align-middle text-xs font-semibold text-muted-foreground [&:has([role=checkbox])]:pe-0", className)}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} data-slot="table-cell" className={cn("px-5 py-4 align-middle [&:has([role=checkbox])]:pe-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";
`,
    ),
  ];
}
