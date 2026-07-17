import { file, type TemplateFile } from "../shared.js";

export function pageFiles(): TemplateFile[] {
  return [
    layout(),
    marketingPage(),
    signInPage(),
    signUpPage(),
    twoFactorPage(),
    dashboardPage(),
    settingsLayout(),
    settingsPage(),
    adminLayout(),
    adminDashboardPage(),
    adminUsersPage(),
    adminCreateUserPage(),
  ];
}

function layout(): TemplateFile {
  return file(
    "apps/web/src/app/layout.tsx",
    `import * as React from "react";
import type { Metadata } from "next";
import { Providers } from "../components/providers.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostInit App",
  description: "Your opinionated modular monolith",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`,
  );
}

function marketingPage(): TemplateFile {
  return file(
    "apps/web/src/app/page.tsx",
    `import * as React from "react";
import Link from "next/link";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-4">GhostInit</h1>
      <p className="text-slate-600 mb-8">Opinionated modular-monolith starter.</p>
      <div className="flex gap-4">
        <Link href="/sign-up" className="px-4 py-2 rounded bg-slate-900 text-white hover:bg-slate-800">
          Sign up
        </Link>
        <Link href="/sign-in" className="px-4 py-2 rounded border border-slate-300 hover:bg-slate-100">
          Sign in
        </Link>
      </div>
    </main>
  );
}
`,
  );
}

function signInPage(): TemplateFile {
  return file(
    "apps/web/src/app/sign-in/page.tsx",
    `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client.js";
import { Button, Input, Label } from "@repo/ui";

export default function SignInPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      return;
    }
    if ("twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
      router.push("/2fa");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Sign in</h1>
        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </main>
  );
}
`,
  );
}

function signUpPage(): TemplateFile {
  return file(
    "apps/web/src/app/sign-up/page.tsx",
    `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client.js";
import { Button, Input, Label } from "@repo/ui";

export default function SignUpPage(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await authClient.signUp.email({ name, email, password, callbackURL: "/dashboard" });
    if (result.error) {
      setError(result.error.message ?? "Sign up failed");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Create account</h1>
        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full">Sign up</Button>
      </form>
    </main>
  );
}
`,
  );
}

function twoFactorPage(): TemplateFile {
  return file(
    "apps/web/src/app/2fa/page.tsx",
    `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client.js";
import { Button, Input, Label } from "@repo/ui";

export default function TwoFactorPage(): React.JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
    if (result.error) {
      setError(result.error.message ?? "Invalid code");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Two-factor authentication</h1>
        <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator app.</p>
        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        <div>
          <Label htmlFor="code">Authentication code</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <Button type="submit" className="w-full">Verify</Button>
      </form>
    </main>
  );
}
`,
  );
}

function dashboardPage(): TemplateFile {
  return file(
    "apps/web/src/app/dashboard/page.tsx",
    `import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@repo/auth";
import { SignOutButton } from "../../components/sign-out-button.js";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">Settings</Link>
            <SignOutButton />
          </div>
        </div>
        <p className="text-slate-600">
          Welcome, <strong>{session.user.name ?? session.user.email}</strong>. Role: <span className="capitalize">{session.user.role}</span>
        </p>
      </div>
    </main>
  );
}
`,
  );
}

function settingsLayout(): TemplateFile {
  return file(
    "apps/web/src/app/settings/layout.tsx",
    `"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui";

const nav = [
  { label: "Settings", href: "/settings" },
  { label: "Admin", href: "/admin" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8 md:flex-row">
        <aside className="w-full md:w-48 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium",
                pathname === item.href ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {item.label}
            </Link>
          ))}
        </aside>
        <section className="flex-1">{children}</section>
      </div>
    </main>
  );
}
`,
  );
}

function settingsPage(): TemplateFile {
  return file(
    "apps/web/src/app/settings/page.tsx",
    `"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client.js";
import { Button, Card, Input, Label } from "@repo/ui";

export default function SettingsPage(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  useEffect(() => {
    setTwoFactorEnabled(user?.twoFactorEnabled ?? false);
  }, [user?.twoFactorEnabled]);


  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled ?? false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) {
      setPasswordError(result.error.message ?? "Failed to update password");
      return;
    }
    setPasswordSuccess("Password updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function handleEnableTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTwoFactorError(null);
    const result = await authClient.twoFactor.enable({ password: twoFactorPassword });
    if (result.error) {
      setTwoFactorError(result.error.message ?? "Failed to enable 2FA");
      return;
    }
    const data = result.data;
    if (data && typeof data === "object") {
      setTotpUri("totpURI" in data ? String(data.totpURI) : null);
      setBackupCodes("backupCodes" in data ? String(data.backupCodes) : null);
    }
  }

  async function handleVerifyTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTwoFactorError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: verifyCode, trustDevice: true });
    if (result.error) {
      setTwoFactorError(result.error.message ?? "Invalid code");
      return;
    }
    setTwoFactorEnabled(true);
    setTotpUri(null);
    setBackupCodes(null);
    setVerifyCode("");
    setTwoFactorPassword("");
  }

  async function handleDisableTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setTwoFactorError(null);
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    if (result.error) {
      setTwoFactorError(result.error.message ?? "Failed to disable 2FA");
      return;
    }
    setTwoFactorEnabled(false);
    setTwoFactorPassword("");
  }

  async function handleDeleteAccount(): Promise<void> {
    setDeleteError(null);
    if (typeof window !== "undefined" && !window.confirm("Are you sure you want to delete your account? This cannot be undone.")) {
      return;
    }
    const result = await authClient.deleteUser({ password: deletePassword });
    if (result.error) {
      setDeleteError(result.error.message ?? "Failed to delete account");
      return;
    }
    router.push("/");
  }

  if (isPending || !user) {
    return <main className="p-8">Loading...</main>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Change password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          {passwordError ? <p className="text-red-600 text-sm">{passwordError}</p> : null}
          {passwordSuccess ? <p className="text-green-600 text-sm">{passwordSuccess}</p> : null}
          <Button type="submit">Update password</Button>
        </form>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        {twoFactorEnabled ? (
          <form onSubmit={handleDisableTwoFactor} className="space-y-4">
            <p className="text-sm text-slate-600">2FA is currently enabled.</p>
            <div>
              <Label htmlFor="disable-2fa-password">Password</Label>
              <Input id="disable-2fa-password" type="password" required value={twoFactorPassword} onChange={(e) => setTwoFactorPassword(e.target.value)} />
            </div>
            {twoFactorError ? <p className="text-red-600 text-sm">{twoFactorError}</p> : null}
            <Button type="submit" variant="outline">Disable 2FA</Button>
          </form>
        ) : (
          <div className="space-y-4">
            {!totpUri ? (
              <form onSubmit={handleEnableTwoFactor} className="space-y-4">
                <p className="text-sm text-slate-600">Enable TOTP-based two-factor authentication.</p>
                <div>
                  <Label htmlFor="enable-2fa-password">Password</Label>
                  <Input id="enable-2fa-password" type="password" required value={twoFactorPassword} onChange={(e) => setTwoFactorPassword(e.target.value)} />
                </div>
                {twoFactorError ? <p className="text-red-600 text-sm">{twoFactorError}</p> : null}
                <Button type="submit">Enable 2FA</Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyTwoFactor} className="space-y-4">
                <p className="text-sm text-slate-600">Scan the TOTP URI below in your authenticator app, then enter the code to verify.</p>
                <div className="break-all rounded-md bg-slate-50 p-3 text-xs text-slate-700">{totpUri}</div>
                {backupCodes ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Backup codes</p>
                    <pre className="break-all rounded-md bg-slate-50 p-3 text-xs text-slate-700">{backupCodes}</pre>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="verify-code">Verification code</Label>
                  <Input id="verify-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} />
                </div>
                {twoFactorError ? <p className="text-red-600 text-sm">{twoFactorError}</p> : null}
                <Button type="submit">Verify and enable</Button>
              </form>
            )}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Danger zone</h2>
        <div>
          <Label htmlFor="delete-password">Password to confirm deletion</Label>
          <Input id="delete-password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
        </div>
        {deleteError ? <p className="text-red-600 text-sm">{deleteError}</p> : null}
        <Button variant="destructive" onClick={() => void handleDeleteAccount()}>Delete account</Button>
      </Card>
    </div>
  );
}
`,
  );
}

function adminLayout(): TemplateFile {
  return file(
    "apps/web/src/app/admin/layout.tsx",
    `import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as React from "react";
import { auth } from "@repo/auth";
import { AdminGuard } from "../../components/admin-guard";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.role !== "admin") {
    redirect("/");
  }
  return <AdminGuard>{children}</AdminGuard>;
}
`,
  );
}

function adminDashboardPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/page.tsx",
    `import { redirect } from "next/navigation";\n\nexport default async function AdminDashboardPage(): Promise<never> {\n  redirect("/admin/users");\n}\n`,
  );
}

function adminUsersPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/page.tsx",
    `"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "../../../lib/auth-client.js";
import { Badge, Button, Card } from "@repo/ui";

export default function AdminUsersPage(): React.JSX.Element {
  const [data, setData] = useState<{
    users: Array<{ id: string; name: string | null; email: string; role: string; banned: boolean }>;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const result = await authClient.admin.listUsers({ query: { limit: 100 } });
    if (result.error) {
      setError(result.error.message ?? "Failed to load users");
      return;
    }
    if (result.data) {
      setData({
        users: result.data.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? "user",
          banned: u.banned ?? false,
        })),
        total: result.data.total,
      });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleBan(userId: string, banned: boolean): Promise<void> {
    if (banned) {
      await authClient.admin.unbanUser({ userId });
    } else {
      await authClient.admin.banUser({ userId });
    }
    await load();
  }

  async function setRole(userId: string, currentRole: string): Promise<void> {
    const role: "admin" | "user" = currentRole === "admin" ? "user" : "admin";
    await authClient.admin.setRole({ userId, role });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link href="/admin/users/create">
          <Button>Create user</Button>
        </Link>
      </div>
      {error ? <p className="text-red-600 text-sm">{error}</p> : null}
      <Card className="divide-y divide-slate-100">
        {data?.users.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{user.name ?? user.email}</p>
              <p className="text-sm text-slate-600">{user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={user.role === "admin" ? "bg-slate-900 text-white" : ""}>{user.role}</Badge>
              <Button size="sm" variant="outline" onClick={() => void setRole(user.id, user.role)}>
                {user.role === "admin" ? "Demote" : "Make admin"}
              </Button>
              <Button size="sm" variant={user.banned ? "default" : "destructive"} onClick={() => void toggleBan(user.id, user.banned)}>
                {user.banned ? "Unban" : "Ban"}
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
`,
  );
}

function adminCreateUserPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/create/page.tsx",
    `"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../../../lib/auth-client.js";
import { Button, Input, Label } from "@repo/ui";

export default function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await authClient.admin.createUser({ name, email, password, role });
    if (result.error) {
      setError(result.error.message ?? "Failed to create user");
      return;
    }
    router.push("/admin/users");
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Create user</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "user")}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit">Create user</Button>
      </form>
    </div>
  );
}
`,
  );
}
