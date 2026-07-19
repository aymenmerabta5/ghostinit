/**
 * Header fragment – main header component with router-specific navigation
 */
import type { RouterType } from "./shared.js";
import {
  getInitialsFunction,
  getInitialsTanstackVariant,
  sharedHeaderStructure,
} from "./shared.js";

export function headerFileContent(router: RouterType): string {
  const isNext = router === "next";
  const linkImport = isNext
    ? `import Link from "next/link";
import { useRouter } from "next/navigation";`
    : `import { Link, useRouter } from "@tanstack/react-router";`;

  const navigateFn = isNext
    ? `  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    router.push("/");
  }`
    : `  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
    router.navigate({ to: '/' });
  }`;

  const dropdownNav = isNext
    ? `                <DropdownMenuItem onClick={() => router.push("/dashboard")}>Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/billing")}>Billing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>`
    : `                <DropdownMenuItem onClick={() => router.navigate({ to: '/dashboard' })}>Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: '/billing' })}>Billing</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: '/settings' })}>Settings</DropdownMenuItem>`;

  const logoLink = isNext
    ? `<Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">GhostInit</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              modular monolith
            </Badge>
          </Link>`
    : `<Link to="/" className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">GhostInit</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">modular monolith</Badge>
          </Link>`;

  const navLinks = isNext
    ? `              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/billing">Billing</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/settings">Settings</Link>
              </Button>
              {user?.role === "admin" ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/users">Admin</Link>
                </Button>
              ) : null}`
    : `              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/billing">Billing</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/settings">Settings</Link>
              </Button>
              {user?.role === 'admin' ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin">Admin</Link>
                </Button>
              ) : null}`;

  const signInUp = isNext
    ? `<div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Sign up</Link>
              </Button>
            </div>`
    : `<div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/sign-up">Sign up</Link>
              </Button>
            </div>`;

  const initialsFn = isNext ? getInitialsFunction : getInitialsTanstackVariant();

  return `"use client";

import * as React from "react";
${linkImport}
import {
  Badge,
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@repo/ui";
import { ThemeToggle } from "./theme-toggle.js";
import { useAuth } from "../hooks/use-auth.js";
import { authClient } from "../lib/auth-client.js";

${initialsFn}

export function Header(): React.JSX.Element {
  const { user, isAuthenticated, isPending } = useAuth();
  const router = useRouter();
  const initials = getInitials(user?.name, user?.email);

${navigateFn}

  return (
    <header className="${sharedHeaderStructure.shellClass}">
      <div className="${sharedHeaderStructure.innerClass}">
        <div className="flex items-center gap-6">
          ${logoLink}
          {isAuthenticated ? (
            <nav className="hidden md:flex items-center gap-1">
${navLinks}
            </nav>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isPending ? (
            <div className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />
          ) : isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="font-medium truncate">{user?.name ?? "User"}</span>
                  <span className="text-xs font-normal text-muted-foreground truncate">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
${dropdownNav}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleSignOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            ${signInUp}
          )}
        </div>
      </div>
    </header>
  );
}
`;
}
