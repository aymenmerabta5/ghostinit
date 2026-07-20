export function rnrCardContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { Text, TextClassContext } from "./text";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View className={cn("bg-card border border-border flex flex-col gap-6 rounded-xl py-6 shadow-sm", className)} {...props} />
    </TextClassContext.Provider>
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) {
  return <Text role="heading" aria-level={3} className={cn("font-semibold leading-none", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }) {
  return <Text className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
  return <View className={cn("flex flex-row items-center px-6", className)} {...props} />;
}
`;
}
