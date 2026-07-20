export function rnrButtonContent(): string {
  return `import * as React from "react";
import { Pressable, type PressableProps, ActivityIndicator, View } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const buttonVariants = tv({
  base: "inline-flex flex-row items-center justify-center rounded-md gap-2",
  variants: {
    variant: {
      default: "bg-primary active:bg-primary/90",
      destructive: "bg-destructive active:bg-destructive/90",
      outline: "border border-input bg-background active:bg-accent",
      secondary: "bg-secondary active:bg-secondary/80",
      ghost: "active:bg-accent",
      link: "bg-transparent",
    },
    size: {
      default: "h-10 px-4",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
      icon: "size-10",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const buttonTextVariants = tv({
  base: "text-center font-medium",
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
    size: {
      default: "text-sm",
      sm: "text-xs",
      lg: "text-base",
      icon: "text-base",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends Omit<PressableProps, "children">, VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({ className, textClassName, variant, size, children, isLoading, disabled, ...props }: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || isLoading;
  return (
    <Pressable className={cn(buttonVariants({ variant, size }), isDisabled && "opacity-50", className)} disabled={isDisabled} {...props}>
      <View className="flex-row items-center justify-center gap-2">
        {isLoading ? <ActivityIndicator size="small" /> : null}
        {typeof children === "string" ? <Text className={cn(buttonTextVariants({ variant, size }), textClassName)}>{children}</Text> : children}
      </View>
    </Pressable>
  );
}

export { buttonVariants, buttonTextVariants };
`;
}
