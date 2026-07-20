/**
 * Header guards – sign-out button + admin guard fragments
 */
import type { RouterType } from "./shared.js";

export function signOutButtonContent(router: RouterType): string {
  if (router === "tanstack") {
    return `"use client"

import * as React from 'react'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client.js'
import { Button } from "@/components/ui/button";

export function SignOutButton(): React.JSX.Element {
  const router = useRouter()

  async function handleClick(): Promise<void> {
    await authClient.signOut()
    router.navigate({ to: '/' })
  }

  return (
    <Button variant="outline" onClick={() => void handleClick()}>
      Sign out
    </Button>
  )
}
`;
  }
  return `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client.js";
import { Button } from "@/components/ui/button";

export function SignOutButton(): React.JSX.Element {
  const router = useRouter();

  async function handleClick(): Promise<void> {
    await authClient.signOut();
    router.push("/");
  }

  return (
    <Button variant="outline" onClick={() => void handleClick()}>
      Sign out
    </Button>
  );
}
`;
}

export function adminGuardContent(router: RouterType): string {
  if (router === "tanstack") {
    return `"use client"

import * as React from 'react'
import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '../lib/auth-client.js'

export function AdminGuard({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && session?.user?.role !== 'admin') {
      router.navigate({ to: '/' })
    }
  }, [isPending, session, router])

  if (isPending || session?.user?.role !== 'admin') return null

  return <>{children}</>
}
`;
  }
  return `"use client";

import * as React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client.js";

export function AdminGuard({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session?.user?.role !== "admin") {
      router.replace("/");
    }
  }, [isPending, session, router]);

  if (isPending || session?.user?.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
`;
}
