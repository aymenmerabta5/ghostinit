export function rnrTabsContextContent(): string {
  return `import * as React from "react";

export interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

export const TabsContext = React.createContext<TabsContextValue | null>(null);

export function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be rendered inside Tabs");
  return context;
}

`;
}

export function rnrTabsTriggerContent(): string {
  return `import * as React from "react";
import { Pressable } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";
import { useTabsContext } from "./tabs-context";

export interface TabsTriggerProps extends React.ComponentProps<typeof Pressable> {
  value: string;
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
}

export function TabsTrigger({ value, className, textClassName, children, disabled, accessibilityLabel, accessibilityState, onPress, ...props }: TabsTriggerProps): React.JSX.Element {
  const context = useTabsContext();
  const isActive = context.value === value;
  const isDisabled = disabled === true;
  const triggerId = \`\${context.baseId}-tab-\${value}\`;
  const label = accessibilityLabel ?? (typeof children === "string" ? children : value);

  return (
    <Pressable
      {...props}
      nativeID={triggerId}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, selected: isActive }}
      disabled={isDisabled}
      onPress={(event) => {
        context.onValueChange(value);
        onPress?.(event);
      }}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 py-2",
        isActive && "ui-selected border border-border bg-background",
        isDisabled && "ui-disabled opacity-50",
        className,
      )}
    >
      {typeof children === "string" ? (
        <Text className={cn("text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground", textClassName)}>
          {children}
        </Text>
      ) : children}
    </Pressable>
  );
}

`;
}
