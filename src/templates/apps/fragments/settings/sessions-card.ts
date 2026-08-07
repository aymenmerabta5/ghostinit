import { file, type TemplateFile } from "../../../shared.js";
export function settingsSessionsCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/sessions-card.tsx",
    `"use client";
import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
type Session = { id: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string; expiresAt: string; isCurrent?: boolean };
export function SessionsCard(): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await (authClient as unknown as { listSessions: () => Promise<{ data?: Session[]; error?: { message?: string } }> }).listSessions?.();
      if (res?.error) { setError(res.error.message ?? "Failed to load sessions"); return; }
      if (res?.data) setSessions(res.data as Session[]);
      else {
        // fallback to useSession + single session view
        const { data: sess } = authClient.useSession() as unknown as { data: { session?: { id: string; ipAddress?: string; userAgent?: string; createdAt: string; expiresAt: string } } | null };
        if (sess?.session) setSessions([{ id: sess.session.id, ipAddress: sess.session.ipAddress ?? null, userAgent: sess.session.userAgent ?? null, createdAt: String(sess.session.createdAt), expiresAt: String(sess.session.expiresAt), isCurrent: true }]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const revoke = useCallback(async (id: string) => {
    setError(null);
    const res = await (authClient as unknown as { revokeSession: (opts:{id:string})=>Promise<{error?:{message?:string}}> }).revokeSession?.({ id });
    if (res?.error) { setError(res.error.message ?? "Failed to revoke"); return; }
    await refresh();
  }, [refresh]);
  const revokeAll = useCallback(async () => {
    const res = await (authClient as unknown as { revokeSessions: ()=>Promise<{error?:{message?:string}}> }).revokeSessions?.();
    if (res?.error) setError(res.error.message ?? "Failed"); else await refresh();
  }, [refresh]);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2"><CardTitle className="text-base">Active sessions</CardTitle><Badge variant="secondary">{sessions.length}</Badge></div>
        <CardDescription className="max-w-[60ch]">Manage your active sessions. Revoke any session you don&apos;t recognize. Current session is highlighted.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Sessions</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
          <Button size="sm" variant="destructive" onClick={() => void revokeAll()} disabled={sessions.length<=1}>Revoke others</Button>
        </div>
        <Separator />
        {loading ? <p className="text-sm text-muted-foreground">Loading sessions…</p> : sessions.length===0 ? <p className="text-sm text-muted-foreground">No active sessions.</p> : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-mono text-xs truncate">{s.id.slice(0,8)}…{s.userAgent ?? "unknown device"}</span>
                  <span className="text-xs text-muted-foreground">{s.ipAddress ?? "no ip"} • expires {new Date(s.expiresAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.isCurrent ? <Badge variant="secondary">current</Badge> : null}
                  <Button size="sm" variant="outline" disabled={!!s.isCurrent} onClick={() => void revoke(s.id)}>Revoke</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
`,
  );
}
