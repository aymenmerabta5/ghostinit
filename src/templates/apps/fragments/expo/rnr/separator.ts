export function rnrSeparatorContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

export function Separator({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof View> & { className?: string; orientation?: "horizontal" | "vertical" }): React.JSX.Element {
  return (
    <View
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}
`;
}
