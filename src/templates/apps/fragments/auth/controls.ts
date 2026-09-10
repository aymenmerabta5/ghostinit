/** Shared generated OAuth controls used by both identity forms. */
export function authOAuthButtonsContent(): string {
  return `"use client";

import type * as React from "react";
import { Button } from "@/components/ui/button";
import type { IdentityOAuthProvider } from "@/lib/auth-model";

export interface AuthOAuthButtonsProps {
  googleLabel: string;
  githubLabel: string;
  separatorLabel: string;
  onSelect: (provider: IdentityOAuthProvider) => void | Promise<void>;
  disabled?: boolean;
}

export function AuthOAuthButtons({ googleLabel, githubLabel, separatorLabel, onSelect, disabled = false }: AuthOAuthButtonsProps): React.JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void onSelect("google")}>{googleLabel}</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void onSelect("github")}>{githubLabel}</Button>
      </div>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{separatorLabel}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
`;
}
