export function rnrLabelContent(): string {
  return `import * as React from "react";
import { Text } from "./text";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.ComponentProps<typeof Text> {
  className?: string;
}

export function Label({ className, ...props }: LabelProps): React.JSX.Element {
  return <Text className={cn("text-sm font-medium leading-none text-foreground", className)} {...props} />;
}
`;
}
