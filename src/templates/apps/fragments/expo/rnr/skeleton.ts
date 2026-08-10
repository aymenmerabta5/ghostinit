export function rnrSkeletonContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }): React.JSX.Element {
  return <View className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />;
}
`;
}
