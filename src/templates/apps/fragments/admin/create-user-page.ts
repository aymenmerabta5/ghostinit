import { file, type TemplateFile } from "../../../shared.js";
export function adminCreateUserPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/create/page.tsx",
    `"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "../../../../lib/auth-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
interface CreateUserForm { name: string; email: string; password: string; role: "admin" | "user"; }
export default function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: "", email: "", password: "", role: "user", } as CreateUserForm,
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await authClient.admin.createUser({ name: value.name, email: value.email, password: value.password, role: value.role });
      if (result.error) { setError(result.error.message ?? "Failed to create user"); return; }
      router.push("/admin/users");
    },
  });
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 p-6 md:p-0">
      <div className="flex flex-col gap-2"><div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Create user</h1><Button variant="ghost" size="sm" asChild><Link href="/admin/users">Back to users</Link></Button></div><p className="text-sm text-muted-foreground max-w-[65ch]">Add a new account. Admins can manage all users.</p></div>
      <Separator />
      <Card><CardHeader><CardTitle className="text-base">User details</CardTitle><CardDescription className="max-w-[60ch]">Password must be at least 8 characters. Role determines access.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? <Alert variant="destructive"><AlertTitle>Failed to create</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          <Form form={form} className="flex flex-col gap-6">
            <FieldGroup>
              <TanStackField form={form} name="name">{(field) => (<Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name={field.name} type="text" placeholder="Ada Lovelace" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} /><FieldDescription>Display name for the account.</FieldDescription></Field>)}</TanStackField>
              <TanStackField form={form} name="email" validators={{ onSubmit: ({ value }) => (value.includes("@") ? undefined : "Enter a valid email") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name={field.name} type="email" placeholder="you@example.com" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>Account email address.</FieldDescription>}</Field>)}</TanStackField>
              <TanStackField form={form} name="password" validators={{ onSubmit: ({ value }) => (value.length >= 8 ? undefined : "Password must be at least 8 characters") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name={field.name} type="password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>At least 8 characters.</FieldDescription>}</Field>)}</TanStackField>
              <TanStackField form={form} name="role">{(field) => (<Field><FieldLabel htmlFor="role">Role</FieldLabel><select id="role" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value as CreateUserForm["role"])} onBlur={field.handleBlur} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select><FieldDescription>Admins can manage all users.</FieldDescription></Field>)}</TanStackField>
            </FieldGroup>
            <SubmitButton>Create user</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
`,
  );
}
