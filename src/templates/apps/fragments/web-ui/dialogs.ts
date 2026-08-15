import { file, type TemplateFile } from "../../../shared.js";

export function dialogsFiles(base = "apps/web/src"): TemplateFile[] {
  const confirm = `"use client";
import * as React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NameConfirmationAlertDialog({ open, onOpenChange, expectedName, onConfirm, title = "Are you sure?", description }: { open: boolean; onOpenChange: (open: boolean) => void; expectedName: string; onConfirm: () => void; title?: string; description?: string }) {
  const [value, setValue] = React.useState("");
  const matches = value.trim() === expectedName;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-name">Type <span className="font-mono font-semibold">{expectedName}</span> to confirm</Label>
          <Input id="confirm-name" value={value} onChange={(e) => setValue(e.target.value)} placeholder={expectedName} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setValue("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!matches} onClick={() => { if (matches) { onConfirm(); setValue(""); } }}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
`;

  const reject = `"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function RejectReasonDialog({ open, onOpenChange, onSubmit, title = "Reject", description = "Provide a reason for rejection." }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void; title?: string; description?: string }) {
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why..." rows={4} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!reason.trim()} onClick={() => { onSubmit(reason.trim()); setReason(""); }}>{title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
`;

  return [
    file(`${base}/components/dialogs/NameConfirmationAlertDialog.tsx`, confirm),
    file(`${base}/components/dialogs/RejectReasonDialog.tsx`, reject),
    file(
      `${base}/components/dialogs/index.ts`,
      `export { NameConfirmationAlertDialog } from "./NameConfirmationAlertDialog";\nexport { RejectReasonDialog } from "./RejectReasonDialog";\n`,
    ),
  ];
}
