import { file, type TemplateFile } from "../../../shared.js";
export function settingsPasswordCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/password-card.tsx",
    `"use client";
import * as React from "react";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";
export function PasswordCard(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setSuccess(null);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) { setError(result.error.message ?? "Failed to update password"); return; }
    setSuccess("Password updated"); setCurrentPassword(""); setNewPassword("");
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Change password</CardTitle><CardDescription className="max-w-[60ch]">Use a strong password with at least 8 characters. Other sessions will be revoked.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Password error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field><FieldLabel htmlFor="current-password">Current password</FieldLabel><Input id="current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><FieldDescription>Must be at least 8 characters.</FieldDescription></Field>
          </FieldGroup>
          <Button type="submit">Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}
`,
  );
}
