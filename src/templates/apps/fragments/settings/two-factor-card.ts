import { file, type TemplateFile } from "../../../shared.js";
export function settingsTwoFactorCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/two-factor-card.tsx",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
export function TwoFactorCard(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  type SessionUser = { twoFactorEnabled?: boolean | null };
  const user = session?.user as unknown as SessionUser | undefined;
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const serverEnabled = user?.twoFactorEnabled ?? false;
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const enabled = optimisticEnabled ?? serverEnabled;
  useEffect(() => { if (optimisticEnabled !== null && optimisticEnabled === serverEnabled) setOptimisticEnabled(null); }, [optimisticEnabled, serverEnabled]);
  async function handleEnable(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    const result = await authClient.twoFactor.enable({ password });
    if (result.error) { setError(result.error.message ?? "Failed to enable 2FA"); return; }
    type EnableData = { totpURI?: string | null; backupCodes?: string[] | string | null };
    const data = result.data as unknown as EnableData | null;
    setTotpUri(data?.totpURI ? String(data.totpURI) : null);
    setBackupCodes(data?.backupCodes ? String(data.backupCodes) : null);
  }
  async function handleVerify(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: verifyCode, trustDevice: true });
    if (result.error) { setError(result.error.message ?? "Invalid code"); return; }
    setOptimisticEnabled(true); setTotpUri(null); setBackupCodes(null); setVerifyCode(""); setPassword("");
  }
  async function handleDisable(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    const result = await authClient.twoFactor.disable({ password });
    if (result.error) { setError(result.error.message ?? "Failed to disable 2FA"); return; }
    setOptimisticEnabled(false); setPassword("");
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Two-factor authentication</CardTitle><Badge variant={enabled ? "secondary" : "outline"}><span className="flex items-center gap-1.5"><span className={enabled ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} /> {enabled ? "enabled" : "disabled"}</span></Badge></div>
        <CardDescription className="max-w-[65ch]">Secure your account with TOTP. Trust device 30 days, backup codes single-use.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>2FA error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {enabled ? (
          <form onSubmit={handleDisable} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground max-w-[65ch]">2FA is currently enabled for your account.</p>
            <FieldGroup><Field><FieldLabel htmlFor="disable-2fa-password">Password</FieldLabel><Input id="disable-2fa-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field></FieldGroup>
            <Button type="submit" variant="outline">Disable 2FA</Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {!totpUri ? (
              <form onSubmit={handleEnable} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Enable TOTP-based two-factor authentication.</p>
                <FieldGroup><Field><FieldLabel htmlFor="enable-2fa-password">Password</FieldLabel><Input id="enable-2fa-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field></FieldGroup>
                <Button type="submit">Enable 2FA</Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Scan the TOTP URI in your authenticator app, then enter the code to verify.</p>
                <div className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono">{totpUri}</div>
                {backupCodes ? <div className="flex flex-col gap-2"><p className="text-sm font-medium">Backup codes</p><pre className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono whitespace-pre-wrap">{backupCodes}</pre><p className="text-xs text-muted-foreground max-w-[60ch]">Store these securely. Each code can be used once.</p></div> : null}
                <FieldGroup><Field><FieldLabel htmlFor="verify-code">Verification code</FieldLabel><Input id="verify-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="000000" className="font-mono tracking-widest text-center" /><FieldDescription>6-digit code from authenticator.</FieldDescription></Field></FieldGroup>
                <Button type="submit">Verify and enable</Button>
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
`,
  );
}
