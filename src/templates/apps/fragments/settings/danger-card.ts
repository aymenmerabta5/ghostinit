import { file, type TemplateFile } from "../../../shared.js";
export function settingsDangerZoneCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/danger-zone-card.tsx",
    `"use client";
import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth-client.js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
export function DangerZoneCard(): React.JSX.Element {
  const router = useRouter();
  const [deletePassword, setDeletePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function handleDelete(): Promise<void> {
    setError(null);
    const result = await authClient.deleteUser({ password: deletePassword });
    if (result.error) { setError(result.error.message ?? "Failed to delete account"); return; }
    setOpen(false); router.push("/");
  }
  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle><CardDescription className="max-w-[65ch]">Permanently delete your account and all associated data. This cannot be undone.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        {error ? <Alert variant="destructive"><AlertTitle>Unable to delete</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <FieldGroup><Field><FieldLabel htmlFor="delete-password">Confirm with password</FieldLabel><Input id="delete-password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Your password" /><FieldDescription>This action is irreversible. Use Dialog confirmation.</FieldDescription></Field></FieldGroup>
      </CardContent>
      <CardFooter>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="destructive">Delete account</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Delete account?</DialogTitle><DialogDescription className="max-w-[60ch]">This will permanently delete your account and all associated data. This action cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => void handleDelete()}>Confirm delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
`,
  );
}
