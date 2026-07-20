export function rnrAvatarContent(): string {
  return `import * as React from "react";
import { View, Image, type ImageProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";
import { Text } from "./text";

const avatarVariants = tv({
  base: "relative flex shrink-0 overflow-hidden rounded-full",
  variants: {
    size: {
      default: "size-10",
      sm: "size-8",
      lg: "size-12",
      xl: "size-16",
    },
  },
  defaultVariants: { size: "default" },
});

export interface AvatarProps extends React.ComponentProps<typeof View>, VariantProps<typeof avatarVariants> {
  className?: string;
}

export function Avatar({ className, size, ...props }: AvatarProps): React.JSX.Element {
  return <View className={cn(avatarVariants({ size }), className)} {...props} />;
}

export interface AvatarImageProps extends ImageProps {
  className?: string;
}

export function AvatarImage({ className, ...props }: AvatarImageProps): React.JSX.Element {
  return <Image className={cn("aspect-square size-full", className)} {...props} />;
}

export interface AvatarFallbackProps extends React.ComponentProps<typeof View> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
}

export function AvatarFallback({ className, textClassName, children, ...props }: AvatarFallbackProps): React.JSX.Element {
  return (
    <View className={cn("flex size-full items-center justify-center rounded-full bg-muted", className)} {...props}>
      {typeof children === "string" ? <Text className={cn("text-muted-foreground text-sm font-medium", textClassName)}>{children}</Text> : children}
    </View>
  );
}
`;
}
