/** Shared generated OAuth controls used by both identity forms. */
export function authOAuthButtonsContent(): string {
  return `"use client";

import type * as React from "react";
import { Button } from "@/components/ui/button";

type OAuthProvider = "google" | "github";

export interface AuthOAuthButtonsProps {
  googleLabel: string;
  githubLabel: string;
  separatorLabel: string;
  onSelect: (provider: OAuthProvider) => void | Promise<void>;
}

export function AuthOAuthButtons({ googleLabel, githubLabel, separatorLabel, onSelect }: AuthOAuthButtonsProps): React.JSX.Element {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={() => void onSelect("google")}>{googleLabel}</Button>
        <Button type="button" variant="outline" onClick={() => void onSelect("github")}>{githubLabel}</Button>
      </div>
      <div className="relative flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{separatorLabel}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
`;
}
