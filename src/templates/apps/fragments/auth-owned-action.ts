import { file, type TemplateFile } from "../../shared.js";

export function authOwnedActionContent(): string {
  return `"use client";
import * as React from "react";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";

export function useAuthOwnedAction() {
  const captureOwner = useAuthOwnedEffect();
  const inFlight = React.useRef(false);
  const [isPending, setPending] = React.useState(false);

  const run = React.useCallback(async <T,>(
    operation: () => Promise<T>,
    onSuccess: (value: T) => void,
    onError: () => void,
  ): Promise<void> => {
    if (inFlight.current) return;
    const isCurrent = captureOwner();
    if (!isCurrent()) return;
    inFlight.current = true;
    setPending(true);
    try {
      const value = await operation();
      if (isCurrent()) onSuccess(value);
    } catch {
      if (isCurrent()) onError();
    } finally {
      inFlight.current = false;
      if (isCurrent()) setPending(false);
    }
  }, [captureOwner]);

  return { isPending, run };
}
`;
}

export function authOwnedActionFile(sourceRoot: string): TemplateFile {
  return file(`${sourceRoot}/hooks/use-auth-owned-action.ts`, authOwnedActionContent());
}
