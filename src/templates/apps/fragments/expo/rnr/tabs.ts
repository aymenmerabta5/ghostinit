import { file, type TemplateFile } from "../../../../shared.js";
import { rnrTabsContextContent, rnrTabsTriggerContent } from "./tabs-parts.js";

export function rnrTabsContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";
import { TabsContext, useTabsContext } from "./tabs-context";
export { TabsTrigger, type TabsTriggerProps } from "./tabs-trigger";

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

export function rnrTabsFiles(sourceRoot = "apps/mobile/src"): TemplateFile[] {
  return [
    file(sourceRoot + "/components/ui/tabs.tsx", rnrTabsContent()),
    file(sourceRoot + "/components/ui/tabs-context.ts", rnrTabsContextContent()),
    file(sourceRoot + "/components/ui/tabs-trigger.tsx", rnrTabsTriggerContent()),
  ];
}
