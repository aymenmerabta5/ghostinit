import { file, type TemplateFile } from "../../../../shared.js";
import { rnrDialogContextContent, rnrDialogModalContent } from "./dialog-parts.js";

export function rnrDialogContent(): string {
  return `import * as React from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";
import { DialogContext, useDialogContext } from "./dialog-context";
export { DialogContent, type DialogContentProps } from "./dialog-content";

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export function Dialog({ open: controlled, defaultOpen = false, onOpenChange, children }: DialogProps): React.JSX.Element {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const triggerRef = React.useRef<View | null>(null);
  const open = controlled ?? uncontrolled;
  const setOpen = React.useCallback((nextOpen: boolean) => {
    if (controlled === undefined) setUncontrolled(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlled, onOpenChange]);
  const openDialog = React.useCallback(() => setOpen(true), [setOpen]);
  const close = React.useCallback(() => {
    setOpen(false);
    const trigger = triggerRef.current;
    if (trigger) {
      requestAnimationFrame(() => AccessibilityInfo.sendAccessibilityEvent(trigger, "focus"));
    }
  }, [setOpen]);

  return (
    <DialogContext.Provider value={{ open, close, openDialog, triggerRef }}>
      {children}
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps extends React.ComponentProps<typeof Pressable> {
  children?: React.ReactNode;
}

export function DialogTrigger({ children, accessibilityLabel, className, onPress, ...props }: DialogTriggerProps): React.JSX.Element {
  const context = useDialogContext();
  const label = accessibilityLabel ?? (typeof children === "string" ? children : "Open dialog");
  return (
    <Pressable
      {...props}
      ref={context.triggerRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        context.openDialog();
        onPress?.(event);
      }}
      className={cn("min-h-11 min-w-11 items-center justify-center rounded-md", className)}
    >
      {children}
    </Pressable>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("flex flex-col gap-1.5 text-center sm:text-start", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text accessibilityRole="header" className={cn("text-lg font-semibold leading-none", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
`;
}

export function rnrDialogFiles(sourceRoot = "apps/mobile/src"): TemplateFile[] {
  return [
    file(sourceRoot + "/components/ui/dialog.tsx", rnrDialogContent()),
    file(sourceRoot + "/components/ui/dialog-context.ts", rnrDialogContextContent()),
    file(sourceRoot + "/components/ui/dialog-content.tsx", rnrDialogModalContent()),
  ];
}
