export function rnrTextContent(): string {
  return `import * as React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cn } from "@/lib/utils";

const TextClassContext = React.createContext<string | undefined>(undefined);

export interface TextProps extends RNTextProps {
  className?: string;
}

export const Text = React.forwardRef<RNText, TextProps>(({ className, ...props }, ref) => {
  const ctxClass = React.useContext(TextClassContext);
  return <RNText ref={ref} className={cn("text-foreground text-base", ctxClass, className)} {...props} />;
});
Text.displayName = "Text";

export { TextClassContext };
`;
}
