export function rnrTabsContent(): string {
  return `import * as React from "react";
import { View, Pressable } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";

interface TabsContextValue {
  value: string;
  onValueChange: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

export interface TabsProps extends React.ComponentProps<typeof View> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
}

export function Tabs({ defaultValue = "", value: controlled, onValueChange, className, children, ...props }: TabsProps): React.JSX.Element {
  const [internal, setInternal] = React.useState(defaultValue);
  const val = controlled ?? internal;
  const handleChange = React.useCallback((v: string) => {
    if (controlled === undefined) setInternal(v);
    onValueChange?.(v);
  }, [controlled, onValueChange]);

  return (
    <TabsContext.Provider value={{ value: val, onValueChange: handleChange }}>
      <View className={cn("flex flex-col gap-2", className)} {...props}>{children}</View>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1", className)} {...props} />;
}

export interface TabsTriggerProps extends React.ComponentProps<typeof Pressable> {
  value: string;
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
}

export function TabsTrigger({ value, className, textClassName, children, ...props }: TabsTriggerProps): React.JSX.Element {
  const ctx = React.useContext(TabsContext);
  const isActive = ctx?.value === value;
  return (
    <Pressable onPress={() => ctx?.onValueChange(value)} className={cn("inline-flex items-center justify-center rounded-md px-3 py-1", isActive && "bg-background shadow-sm", className)} {...props}>
      {typeof children === "string" ? <Text className={cn("text-sm font-medium", isActive ? "text-foreground" : "text-muted-foreground", textClassName)}>{children}</Text> : children}
    </Pressable>
  );
}

export interface TabsContentProps extends React.ComponentProps<typeof View> {
  value: string;
  className?: string;
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps): React.JSX.Element | null {
  const ctx = React.useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return <View className={cn("mt-2", className)} {...props}>{children}</View>;
}
`;
}
