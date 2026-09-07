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
  /** Base UI positions alignment and spacing on the Positioner. */
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner align={align} sideOffset={sideOffset} className="z-[var(--layer-popover)]">
      <BaseMenu.Popup
        ref={ref}
        data-slot="dropdown-menu-content"
        className={cn(
          "min-w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-popover",
          "duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none!",
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
      "relative flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm leading-5 outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:ps-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10 data-[variant=destructive]:data-[highlighted]:text-destructive [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
    className={cn("px-2.5 py-2 text-xs font-medium leading-5 text-muted-foreground data-[inset]:ps-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseMenu.Separator>
>(({ className, ...props }, ref) => (
  <BaseMenu.Separator ref={ref} data-slot="dropdown-menu-separator" className={cn("mx-1 my-1.5 h-px bg-border", className)} {...props} />
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
      "flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm leading-5 outline-none focus:bg-accent data-[highlighted]:bg-accent data-[state=open]:bg-accent data-[inset]:ps-8 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
    <BaseMenu.Positioner sideOffset={4} className="z-[var(--layer-popover)]">
      <BaseMenu.Popup
        ref={ref}
        data-slot="dropdown-menu-sub-content"
        className={cn(
          "min-w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-popover duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none!",
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
