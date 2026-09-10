import { file, type TemplateFile } from "../../../shared.js";
export function formSubmitFile(): TemplateFile {
  return file(
    "apps/web/src/components/ui/form-submit.tsx",
    `"use client";
import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { useFormContext } from "./form-context";
import { Spinner } from "./spinner";
export interface SubmitButtonProps extends ButtonProps {
  ref?: React.Ref<HTMLButtonElement>;
}

export function SubmitButton({ ref, ...props }: SubmitButtonProps): React.JSX.Element {
  return <Button ref={ref} type="submit" data-slot="form-submit" {...props} />;
}

export interface AppFormSubmitButtonProps extends SubmitButtonProps {
  pendingLabel?: React.ReactNode;
}

export function AppFormSubmitButton({
  children,
  disabled = false,
  pendingLabel = "Submitting…",
  ...props
}: AppFormSubmitButtonProps): React.JSX.Element {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <SubmitButton
          {...props}
          disabled={disabled || !canSubmit || isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          {isSubmitting ? pendingLabel : children}
        </SubmitButton>
      )}
    </form.Subscribe>
  );
}

`,
  );
}
