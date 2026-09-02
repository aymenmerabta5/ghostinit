import { file, type TemplateFile } from "../../../shared.js";

export function dropdownFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/dropdown-menu.tsx",
      `"use client";

import * as React from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils.js";

export const DropdownMenu = BaseMenu.Root;
export const DropdownMenuPortal = BaseMenu.Portal;
export const DropdownMenuGroup = BaseMenu.Group;
export const DropdownMenuTrigger = BaseMenu.Trigger;

export interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseMenu.Popup> {
  /** Positioner alignment — Base UI puts \`align\`/\`sideOffset\` on the Positioner. */
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner align={align} sideOffset={sideOffset}>
      <BaseMenu.Popup
        ref={ref}
        data-slot="dropdown-menu-content"
        className={cn(
          "min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Item> & { inset?: boolean; variant?: "default" | "destructive" }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <BaseMenu.Item
    ref={ref}
    data-slot="dropdown-menu-item"
    data-inset={inset}
    data-variant={variant}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:ps-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.GroupLabel> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <BaseMenu.GroupLabel
    ref={ref}
    data-slot="dropdown-menu-label"
    data-inset={inset}
    className={cn("px-2 py-1.5 text-sm font-semibold data-[inset]:ps-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>
>(({ className, ...props }, ref) => (
  <BaseMenu.Separator ref={ref} data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuSub = BaseMenu.SubmenuRoot;

export const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.SubmenuTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <BaseMenu.SubmenuTrigger
    ref={ref}
    data-slot="dropdown-menu-sub-trigger"
    data-inset={inset}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent data-[inset]:ps-8 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ms-auto rtl:rotate-180" aria-hidden />
  </BaseMenu.SubmenuTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Popup>
>(({ className, ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner sideOffset={4}>
      <BaseMenu.Popup
        ref={ref}
        data-slot="dropdown-menu-sub-content"
        className={cn(
          "min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";
`,
    ),
  ];
}
