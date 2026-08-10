export function rnrDialogContent(): string {
  return `import * as React from "react";
import { View, Modal, Pressable, ScrollView } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";

export function Dialog({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }): React.JSX.Element {
  if (!open) return <>{children}</>;
  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={() => onOpenChange?.(false)}>
      <Pressable onPress={() => onOpenChange?.(false)} className="flex-1 bg-black/50 items-center justify-center p-4">
        <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-lg">
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function DialogTrigger({ asChild, children, ...props }: { asChild?: boolean; children?: React.ReactNode } & React.ComponentProps<typeof View>): React.JSX.Element {
  return <View {...props}>{children}</View>;
}

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("bg-background border border-border rounded-lg p-6 shadow-lg", className)} {...props}>{children}</View>;
}

export function DialogHeader({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text className={cn("text-lg font-semibold leading-none", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("flex flex-col-reverse sm:flex-row sm:justify-end gap-2", className)} {...props} />;
}
`;
}
