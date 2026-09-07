import { file, type TemplateFile } from "../../../shared.js";
export function adminUserRow(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/components/user-row.tsx",
    `"use client";
import * as React from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { AdminUser } from "@repo/kernel";
interface UserRowProps { user: AdminUser; onToggleBan: (id: string, banned: boolean) => void; onSetRole: (id: string, role: string) => void; }
export function UserRow({ user, onToggleBan, onSetRole }: UserRowProps): React.JSX.Element {
  const [banOpen, setBanOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{user.name ?? user.email}</p>
          <Badge variant="secondary" className="capitalize"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {user.role}</span></Badge>
          {user.banned ? <Badge variant="destructive">banned</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline">{user.role === "admin" ? "Demote" : "Make admin"}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{user.role === "admin" ? "Demote user?" : "Make admin?"}</DialogTitle><DialogDescription>Change role for {user.email} to {user.role === "admin" ? "user" : "admin"}.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button><Button onClick={() => { onSetRole(user.id, user.role); setRoleOpen(false); }}>Confirm</Button></DialogFooter></DialogContent>
        </Dialog>
        <Dialog open={banOpen} onOpenChange={setBanOpen}>
          <DialogTrigger asChild><Button size="sm" variant={user.banned ? "default" : "destructive"}>{user.banned ? "Unban" : "Ban"}</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{user.banned ? "Unban user?" : "Ban user?"}</DialogTitle><DialogDescription>{user.banned ? "Restore access for" : "Revoke access for"} {user.email}.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setBanOpen(false)}>Cancel</Button><Button variant={user.banned ? "default" : "destructive"} onClick={() => { onToggleBan(user.id, user.banned); setBanOpen(false); }}>{user.banned ? "Unban" : "Ban"}</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
`,
  );
}
