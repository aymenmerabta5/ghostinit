export function rnrInputContent(): string {
  return `import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "@/lib/utils";

export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(({ className, ...props }, ref) => {
  return <TextInput ref={ref} className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground", className)} {...props} />;
});
Input.displayName = "Input";
`;
}
