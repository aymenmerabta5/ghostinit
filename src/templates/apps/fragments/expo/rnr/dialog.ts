export function rnrDialogContent(): string {
  return `import * as React from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Modal,
  Pressable,
  View,
} from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";

interface DialogContextValue {
  open: boolean;
  close: () => void;
  openDialog: () => void;
  triggerRef: React.RefObject<View | null>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be rendered inside Dialog");
  return context;
}

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

export interface DialogContentProps extends React.ComponentProps<typeof View> {
  accessibilityLabel?: string;
  children?: React.ReactNode;
  className?: string;
}

export function DialogContent({ accessibilityLabel = "Dialog", className, children, ...props }: DialogContentProps): React.JSX.Element | null {
  const context = useDialogContext();
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const contentRef = React.useRef<View | null>(null);
  const { close, open } = context;

  React.useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, open]);

  const focusContent = React.useCallback(() => {
    const content = contentRef.current;
    if (content) AccessibilityInfo.sendAccessibilityEvent(content, "focus");
  }, []);

  if (!open) return null;
  return (
    <Modal
      transparent
      visible
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={close}
      onShow={focusContent}
    >
      <View className="flex-1 items-center justify-center p-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          onPress={close}
          className="absolute inset-0 bg-foreground/50"
        />
        <View
          {...props}
          ref={contentRef}
          role="dialog"
          accessibilityLabel={accessibilityLabel}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          className={cn("w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg", className)}
        >
          {children}
        </View>
      </View>
    </Modal>
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
