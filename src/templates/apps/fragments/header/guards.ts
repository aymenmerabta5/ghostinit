/**
 * Header identity action fragments.
 */
import type { RouterType } from "./shared.js";

export function signOutButtonContent(router: RouterType): string {
  if (router === "tanstack") {
    return `"use client"

import * as React from 'react'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client.js'
import { getQueryClient, transitionQueryAuthScope } from '../lib/query-client.js'
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function SignOutButton(): React.JSX.Element {
  const router = useRouter()
  const t = useSurfaceTranslations("header")

  async function handleClick(): Promise<void> {
    await authClient.signOut()
    transitionQueryAuthScope(getQueryClient(), null)
    router.navigate({ to: '/' })
  }

  return (
    <Button variant="outline" onClick={() => void handleClick()}>
      {t("signOut")}
    </Button>
  )
}
`;
  }
  return `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client.js";
import { getQueryClient, transitionQueryAuthScope } from "../lib/query-client.js";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function SignOutButton(): React.JSX.Element {
  const router = useRouter();
  const t = useSurfaceTranslations("header");

  async function handleClick(): Promise<void> {
    await authClient.signOut();
    transitionQueryAuthScope(getQueryClient(), null);
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={() => void handleClick()}>
      {t("signOut")}
    </Button>
  );
}
`;
}
