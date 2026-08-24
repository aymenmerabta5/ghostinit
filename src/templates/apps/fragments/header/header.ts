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
    ? `              <Button variant="ghost" size="sm" render={<Link href="/dashboard" />} nativeButton={false}>
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" render={<Link href="/billing" />} nativeButton={false}>
                Billing
              </Button>
              <Button variant="ghost" size="sm" render={<Link href="/settings" />} nativeButton={false}>
                Settings
              </Button>
              {user?.role === "admin" ? (
                <Button variant="ghost" size="sm" render={<Link href="/admin/users" />} nativeButton={false}>
                  Admin
                </Button>
              ) : null}`
    : `              <Button variant="ghost" size="sm" render={<Link to="/dashboard" />} nativeButton={false}>
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" render={<Link to="/billing" />} nativeButton={false}>
                Billing
              </Button>
              <Button variant="ghost" size="sm" render={<Link to="/settings" />} nativeButton={false}>
                Settings
              </Button>
              {user?.role === 'admin' ? (
                <Button variant="ghost" size="sm" render={<Link to="/admin" />} nativeButton={false}>
                  Admin
                </Button>
              ) : null}`;

  const signInUp = isNext
    ? `<div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" render={<Link href="/sign-in" />} nativeButton={false}>
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/sign-up" />} nativeButton={false}>
                Sign up
              </Button>
            </div>`
    : `<div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" render={<Link to="/sign-in" />} nativeButton={false}>
                Sign in
              </Button>
              <Button size="sm" render={<Link to="/sign-up" />} nativeButton={false}>
                Sign up
              </Button>
            </div>`;

  const initialsFn = isNext ? getInitialsFunction : getInitialsTanstackVariant();

  return `"use client";

import * as React from "react";
${linkImport}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu" />}>
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
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
