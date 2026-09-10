import { file, type TemplateFile } from "../../shared.js";

export function nativeFormFieldContent(): string {
  return `import type * as React from "react";
import { View, type TextInputProps } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
function firstError(errors: readonly unknown[]): string | null {
  for (const error of errors) {
    if (typeof error === "string" && error) return error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return null;
}
export interface NativeFormFieldProps {
  label: string; value: string; onChange(value: string): void; onBlur(): void; errors: readonly unknown[];
  secureTextEntry?: boolean; disabled?: boolean; maxLength?: number; description?: string; placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"]; autoCapitalize?: TextInputProps["autoCapitalize"];
}
export function NativeFormField({ label, value, onChange, onBlur, errors, secureTextEntry, disabled, maxLength, description, placeholder, keyboardType, autoCapitalize }: NativeFormFieldProps): React.JSX.Element {
  const error = firstError(errors);
  return <View className="gap-2"><Text className="text-sm font-medium">{label}</Text><Input accessibilityLabel={label} value={value} onChangeText={onChange} onBlur={onBlur} secureTextEntry={secureTextEntry} editable={!disabled} maxLength={maxLength} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize={autoCapitalize} />{description ? <Text className="text-xs text-muted-foreground">{description}</Text> : null}{error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}</View>;
}
`;
}

export function nativeFormFieldFiles(sourceRoot: string): TemplateFile[] {
  return [file(`${sourceRoot}/components/form-fields/native-field.tsx`, nativeFormFieldContent())];
}
