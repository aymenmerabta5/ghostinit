export function rnrDialogContextContent(): string {
  return `import * as React from "react";
import type { View } from "react-native";

export interface DialogContextValue {
  open: boolean;
  close: () => void;
  openDialog: () => void;
  triggerRef: React.RefObject<View | null>;
}

export const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialogContext(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be rendered inside Dialog");
  return context;
}

`;
}

export function rnrDialogModalContent(): string {
  return `import * as React from "react";
import { AccessibilityInfo, BackHandler, Modal, Pressable, View } from "react-native";
import { cn } from "@/lib/utils";
import { useDialogContext } from "./dialog-context";

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

`;
}
