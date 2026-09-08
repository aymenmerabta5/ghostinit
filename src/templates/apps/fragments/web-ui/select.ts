import { file, type TemplateFile } from "../../../shared.js";

export function selectFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/select.tsx",
      `"use client";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { ChevronsUpDown } from "lucide-react";
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
        "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 text-card-foreground shadow-control ring-offset-background transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronsUpDown className="size-4 text-muted-foreground" data-icon="inline-end" aria-hidden />
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
      className={cn("min-w-0 truncate text-start data-[placeholder]:text-muted-foreground", className)}
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
      <BaseSelect.Positioner alignItemWithTrigger={false} sideOffset={4} className="z-[var(--layer-popover)]">
        <BaseSelect.Popup
          ref={ref}
          data-slot="select-content"
          className={cn(
            "min-w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-popover duration-150 data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 motion-reduce:animate-none!",
            className,
          )}
          {...props}
        >
          <BaseSelect.List className="max-h-80 overflow-y-auto">{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export {
  SelectGroup,
  SelectItem,
  type SelectGroupProps,
  type SelectItemProps,
} from "./select-items.js";
`,
    ),
    file(
      "apps/web/src/components/ui/select-items.tsx",
      `"use client";
import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";

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
        "relative flex min-h-9 w-full cursor-default select-none items-center rounded-md py-2 ps-8 pe-2.5 text-sm leading-5 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="absolute start-2 flex items-center justify-center [&_svg]:size-4">
        <Check aria-hidden />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
`,
    ),
  ];
}
