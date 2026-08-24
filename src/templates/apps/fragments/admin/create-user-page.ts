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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { isUserRole } from "@repo/kernel";
import type { UserRole } from "@repo/kernel";
interface CreateUserForm { name: string; email: string; password: string; role: UserRole; }
const ROLE_OPTIONS = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
] satisfies readonly { label: string; value: UserRole }[];
export default function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const defaultValues: CreateUserForm = { name: "", email: "", password: "", role: "user" };
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await authClient.admin.createUser({ name: value.name, email: value.email, password: value.password, role: value.role });
      if (result.error) { setError(result.error.message ?? "Failed to create user"); return; }
      router.push("/admin/users");
    },
  });
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 p-6 md:p-0">
      <div className="flex flex-col gap-2"><div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Create user</h1><Button variant="ghost" size="sm" render={<Link href="/admin/users" />} nativeButton={false}>Back to users</Button></div><p className="text-sm text-muted-foreground max-w-[65ch]">Add a new account. Admins can manage all users.</p></div>
      <Separator />
      <Card><CardHeader><CardTitle className="text-base">User details</CardTitle><CardDescription className="max-w-[60ch]">Password must be at least 8 characters. Role determines access.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? <Alert variant="destructive"><AlertTitle>Failed to create</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          <Form form={form} className="flex flex-col gap-6">
            <FieldGroup>
              <TanStackField form={form} name="name">{(field) => (<Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name={field.name} type="text" placeholder="Ada Lovelace" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} /><FieldDescription>Display name for the account.</FieldDescription></Field>)}</TanStackField>
              <TanStackField form={form} name="email" validators={{ onSubmit: ({ value }) => (value.includes("@") ? undefined : "Enter a valid email") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name={field.name} type="email" placeholder="you@example.com" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>Account email address.</FieldDescription>}</Field>)}</TanStackField>
              <TanStackField form={form} name="password" validators={{ onSubmit: ({ value }) => (value.length >= 8 ? undefined : "Password must be at least 8 characters") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name={field.name} type="password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>At least 8 characters.</FieldDescription>}</Field>)}</TanStackField>
              <TanStackField form={form} name="role">{(field) => (<Field><FieldLabel id="role-label" htmlFor="role">Role</FieldLabel><Select items={ROLE_OPTIONS} value={field.state.value} onValueChange={(role) => { if (isUserRole(role)) field.handleChange(role); }}><SelectTrigger id="role" aria-labelledby="role-label" onBlur={field.handleBlur}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>Admins can manage all users.</FieldDescription></Field>)}</TanStackField>
            </FieldGroup>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <SubmitButton disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting ? "Creating user…" : "Create user"}
                </SubmitButton>
              )}
            </form.Subscribe>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
`,
  );
}
