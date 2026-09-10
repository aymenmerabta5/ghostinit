import { file, type TemplateFile } from "../../../shared.js";

const types = `export interface NameConfirmationProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  expectedName: string;
  onConfirm(): void;
  title?: string;
  description?: string;
}
export interface RejectReasonProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(reason: string): void;
  title?: string;
  description?: string;
}
`;
const confirmationWorkflow = `"use client";
import { useAppForm } from "@/components/ui/form";
import type { NameConfirmationProps } from "./types";

export function useNameConfirmation({ expectedName, onConfirm }: NameConfirmationProps) {
  const form = useAppForm({ defaultValues: { name: "" }, onSubmit: async ({ value }) => {
    if (value.name.trim() !== expectedName) return;
    onConfirm();
    form.reset();
  } });
  return { form, confirm: () => form.handleSubmit(), cancel: () => form.reset() };
}
`;
const rejectionWorkflow = `"use client";
import { useAppForm } from "@/components/ui/form";
import type { RejectReasonProps } from "./types";

export function useRejectReason({ onSubmit, onOpenChange }: RejectReasonProps) {
  const form = useAppForm({ defaultValues: { reason: "" }, onSubmit: async ({ value }) => {
    const reason = value.reason.trim();
    if (!reason) return;
    onSubmit(reason);
    form.reset();
  } });
  return { form, submit: () => form.handleSubmit(), cancel: () => onOpenChange(false) };
}
`;
const confirmationView = `"use client";
import * as React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NameConfirmationProps } from "../types";
import type { useNameConfirmation } from "../use-name-confirmation";

export function NameConfirmationView({ open, onOpenChange, expectedName, title = "Are you sure?", description, model }: NameConfirmationProps & { model: ReturnType<typeof useNameConfirmation> }): React.JSX.Element {
  const { form, confirm, cancel } = model;
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle>{description && <AlertDialogDescription>{description}</AlertDialogDescription>}</AlertDialogHeader>
      <form.AppField name="name">{(field) => <div className="space-y-2">
        <Label htmlFor="confirm-name">Type <span className="font-mono font-semibold">{expectedName}</span> to confirm</Label>
        <Input id="confirm-name" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} placeholder={expectedName} />
      </div>}</form.AppField>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={cancel}>Cancel</AlertDialogCancel>
        <form.Subscribe selector={(state) => state.values.name}>{(name) => <AlertDialogAction disabled={name.trim() !== expectedName} onClick={() => void confirm()}>Confirm</AlertDialogAction>}</form.Subscribe>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
`;
const rejectionView = `"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { RejectReasonProps } from "../types";
import type { useRejectReason } from "../use-reject-reason";

export function RejectReasonView({ open, onOpenChange, title = "Reject", description = "Provide a reason for rejection.", model }: RejectReasonProps & { model: ReturnType<typeof useRejectReason> }): React.JSX.Element {
  const { form, submit, cancel } = model;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <form.AppField name="reason">{(field) => <div className="space-y-2">
        <Label htmlFor="reject-reason">Reason</Label>
        <Textarea id="reject-reason" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} placeholder="Explain why..." rows={4} />
      </div>}</form.AppField>
      <DialogFooter>
        <Button variant="outline" onClick={cancel}>Cancel</Button>
        <form.Subscribe selector={(state) => state.values.reason}>{(reason) => <Button disabled={!reason.trim()} onClick={() => void submit()}>{title}</Button>}</form.Subscribe>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
`;

export function dialogsFiles(base = "apps/web/src"): TemplateFile[] {
  const root = `${base}/features/confirmation-dialogs`;
  return [
    file(
      `${base}/components/dialogs/NameConfirmationAlertDialog.tsx`,
      'export { NameConfirmationAlertDialog } from "@/features/confirmation-dialogs/name-confirmation";\n',
    ),
    file(
      `${base}/components/dialogs/RejectReasonDialog.tsx`,
      'export { RejectReasonDialog } from "@/features/confirmation-dialogs/reject-reason";\n',
    ),
    file(
      `${base}/components/dialogs/index.ts`,
      'export { NameConfirmationAlertDialog } from "./NameConfirmationAlertDialog";\nexport { RejectReasonDialog } from "./RejectReasonDialog";\n',
    ),
    file(`${root}/types.ts`, types),
    file(`${root}/use-name-confirmation.ts`, confirmationWorkflow),
    file(`${root}/use-reject-reason.ts`, rejectionWorkflow),
    file(`${root}/components/name-confirmation-view.tsx`, confirmationView),
    file(`${root}/components/reject-reason-view.tsx`, rejectionView),
    file(
      `${root}/name-confirmation.tsx`,
      `"use client";
import type * as React from "react";
import type { NameConfirmationProps } from "./types";
import { useNameConfirmation } from "./use-name-confirmation";
import { NameConfirmationView } from "./components/name-confirmation-view";
export function NameConfirmationAlertDialog(props: NameConfirmationProps): React.JSX.Element {
  return <NameConfirmationView {...props} model={useNameConfirmation(props)} />;
}
`,
    ),
    file(
      `${root}/reject-reason.tsx`,
      `"use client";
import type * as React from "react";
import type { RejectReasonProps } from "./types";
import { useRejectReason } from "./use-reject-reason";
import { RejectReasonView } from "./components/reject-reason-view";
export function RejectReasonDialog(props: RejectReasonProps): React.JSX.Element {
  return <RejectReasonView {...props} model={useRejectReason(props)} />;
}
`,
    ),
  ];
}
