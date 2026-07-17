import { file, type TemplateFile } from "../shared.js";

export function componentFiles(): TemplateFile[] {
  return [providersComponent(), signOutButton(), authClient(), adminGuard()];
}

function providersComponent(): TemplateFile {
  return file(
    "apps/web/src/components/providers.tsx",
    `"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
`,
  );
}

function signOutButton(): TemplateFile {
  return file(
    "apps/web/src/components/sign-out-button.tsx",
    `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client.js";
import { Button } from "@repo/ui";

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
`,
  );
}

function authClient(): TemplateFile {
  return file(
    "apps/web/src/lib/auth-client.ts",
    `export { authClient } from "@repo/auth/client";
`,
  );
}

function adminGuard(): TemplateFile {
  return file(
    "apps/web/src/components/admin-guard.tsx",
    `"use client";

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
`,
  );
}
