export function rnrTabsContent(): string {
  return `import * as React from "react";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be rendered inside Tabs");
  return context;
}

export interface TabsProps extends React.ComponentProps<typeof View> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function Tabs({ defaultValue = "", value: controlled, onValueChange, className, children, nativeID, ...props }: TabsProps): React.JSX.Element {
  const [internal, setInternal] = React.useState(defaultValue);
  const generatedId = React.useId().replace(/:/g, "");
  const baseId = nativeID ?? \`tabs-\${generatedId}\`;
  const value = controlled ?? internal;
  const handleChange = React.useCallback((nextValue: string) => {
    if (controlled === undefined) setInternal(nextValue);
    onValueChange?.(nextValue);
  }, [controlled, onValueChange]);

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange, baseId }}>
      <View nativeID={baseId} className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </View>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return (
    <View
      {...props}
      accessibilityRole="tablist"
      className={cn("inline-flex min-h-11 flex-row items-center justify-center rounded-lg bg-muted p-1", className)}
    />
  );
}

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

export interface TabsContentProps extends React.ComponentProps<typeof View> {
  value: string;
  className?: string;
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps): React.JSX.Element | null {
  const context = useTabsContext();
  if (context.value !== value) return null;
  return (
    <View
      {...props}
      role="tabpanel"
      aria-labelledby={\`\${context.baseId}-tab-\${value}\`}
      className={cn("mt-2", className)}
    >
      {children}
    </View>
  );
}
`;
}
