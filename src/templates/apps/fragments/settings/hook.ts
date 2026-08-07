import { file, type TemplateFile } from "../../../shared.js";

export function useSettingsHook(): TemplateFile {
  return file(
    "apps/web/src/app/settings/hooks/use-settings.ts",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth-client.js";
import { useForm } from "@/components/ui/form";
interface ProfileForm { name: string; }
// Derived from the implementation rather than hand-written. The form field's type
// is TanStack Form's ReactFormExtendedApi with eleven type parameters; restating
// it by hand drifted (a hand-written \`ReturnType<typeof useForm<ProfileForm>>\` is
// an instantiation expression, which ReturnType rejects — TS2344/TS2635).
export type UseSettingsReturn = ReturnType<typeof useSettings>;
export function useSettings() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  // Derived during render — not via effect (vercel rerender-derived-state-no-effect)
  const serverTwoFactorEnabled = (user as unknown as { twoFactorEnabled?: boolean })?.twoFactorEnabled ?? false;
  const [optimisticTwoFactor, setOptimisticTwoFactor] = useState<boolean | null>(null);
  const twoFactorEnabled = optimisticTwoFactor ?? serverTwoFactorEnabled;
  // Clear optimistic once server confirms
  useEffect(() => {
    if (optimisticTwoFactor !== null && optimisticTwoFactor === serverTwoFactorEnabled) {
      setOptimisticTwoFactor(null);
    }
  }, [serverTwoFactorEnabled, optimisticTwoFactor]);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const profileForm = useForm({
    defaultValues: { name: (user?.name as string) ?? "" } as ProfileForm,
    onSubmit: async ({ value }) => {
      setPasswordError(null); setPasswordSuccess(null);
      const result = await authClient.updateUser({ name: value.name });
      if (result.error) { setPasswordError(result.error.message ?? "Failed to update profile"); return; }
      setPasswordSuccess("Profile updated");
    },
  });
  useEffect(() => { if (user?.name) profileForm.setFieldValue("name", user.name as string); }, [user?.name, profileForm]);
  function clearPasswordMessages() { setPasswordError(null); setPasswordSuccess(null); }
  async function handleChangePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setPasswordError(null); setPasswordSuccess(null);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) { setPasswordError(result.error.message ?? "Failed to update password"); return; }
    setPasswordSuccess("Password updated"); setCurrentPassword(""); setNewPassword("");
  }
  async function handleEnableTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setTwoFactorError(null);
    const result = await authClient.twoFactor.enable({ password: twoFactorPassword });
    if (result.error) { setTwoFactorError(result.error.message ?? "Failed to enable 2FA"); return; }
    type TwoFactorEnableData = { totpURI?: string | null; backupCodes?: string[] | string | null };
    const data = result.data as unknown as TwoFactorEnableData | null;
    if (data) { setTotpUri(data.totpURI ? String(data.totpURI) : null); setBackupCodes(data.backupCodes ? String(data.backupCodes) : null); }
  }
  async function handleVerifyTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setTwoFactorError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: verifyCode, trustDevice: true });
    if (result.error) { setTwoFactorError(result.error.message ?? "Invalid code"); return; }
    setOptimisticTwoFactor(true); setTotpUri(null); setBackupCodes(null); setVerifyCode(""); setTwoFactorPassword("");
  }
  async function handleDisableTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setTwoFactorError(null);
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    if (result.error) { setTwoFactorError(result.error.message ?? "Failed to disable 2FA"); return; }
    setOptimisticTwoFactor(false); setTwoFactorPassword("");
  }
  async function handleDeleteAccount(): Promise<void> {
    setDeleteError(null);
    const result = await authClient.deleteUser({ password: deletePassword });
    if (result.error) { setDeleteError(result.error.message ?? "Failed to delete account"); return; }
    router.push("/");
  }
  type SessionUser = { id: string; email: string; name: string | null; role: string; twoFactorEnabled?: boolean };
  type SessionData = { user: SessionUser } | null;
  return { session: session as unknown as SessionData, isPending, user: user as unknown as SessionUser | undefined, profileForm, currentPassword, setCurrentPassword, newPassword, setNewPassword, passwordError, passwordSuccess, twoFactorPassword, setTwoFactorPassword, totpUri, backupCodes, verifyCode, setVerifyCode, twoFactorError, twoFactorEnabled, deletePassword, setDeletePassword, deleteError, handleChangePassword, handleEnableTwoFactor, handleVerifyTwoFactor, handleDisableTwoFactor, handleDeleteAccount, clearPasswordMessages };
}
`,
  );
}
