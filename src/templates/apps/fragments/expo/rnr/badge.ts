export function rnrBadgeContent(): string {
  return `import * as React from "react";
import { View } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const badgeVariants = tv({
  base: "inline-flex items-center rounded-full border px-2.5 py-0.5",
  variants: {
    variant: {
      default: "border-transparent bg-primary",
      secondary: "border-transparent bg-secondary",
      destructive: "border-transparent bg-destructive",
      outline: "border-input",
    },
  },
  defaultVariants: { variant: "default" },
});

const badgeTextVariants = tv({
  base: "text-xs font-semibold",
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.ComponentProps<typeof View>, VariantProps<typeof badgeVariants> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
}

export function Badge({ className, textClassName, variant, children, ...props }: BadgeProps): React.JSX.Element {
  const isString = typeof children === "string";
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {isString ? <Text className={cn(badgeTextVariants({ variant }), textClassName)}>{children}</Text> : children}
    </View>
  );
}

export { badgeVariants };
`;
}
