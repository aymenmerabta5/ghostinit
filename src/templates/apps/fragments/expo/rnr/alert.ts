export function rnrAlertContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const alertVariants = tv({
  base: "relative flex w-full rounded-lg border p-4",
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      destructive: "border-destructive/50 text-destructive dark:border-destructive bg-destructive/10",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface AlertProps extends React.ComponentProps<typeof View>, VariantProps<typeof alertVariants> {
  className?: string;
}

export function Alert({ className, variant, ...props }: AlertProps): React.JSX.Element {
  return <View className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<typeof Text> & { className?: string }): React.JSX.Element {
  return <Text className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { alertVariants };
`;
}
