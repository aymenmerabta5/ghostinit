import { file, type TemplateFile } from "../../../shared.js";

export function useSettingsHook(): TemplateFile {
  return file(
    "apps/web/src/app/settings/hooks/use-settings.ts",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth-client.js";
import { useForm } from "@repo/ui/form";
interface ProfileForm { name: string; }
export interface UseSettingsReturn {
  session: ReturnType<typeof authClient.useSession>["data"];
  isPending: boolean;
  user: NonNullable<ReturnType<typeof authClient.useSession>["data"]>["user"] | undefined;
  profileForm: ReturnType<typeof useForm<ProfileForm>>;
  currentPassword: string; setCurrentPassword: React.Dispatch<React.SetStateAction<string>>;
  newPassword: string; setNewPassword: React.Dispatch<React.SetStateAction<string>>;
  passwordError: string | null; passwordSuccess: string | null;
  twoFactorPassword: string; setTwoFactorPassword: React.Dispatch<React.SetStateAction<string>>;
  totpUri: string | null; backupCodes: string | null;
  verifyCode: string; setVerifyCode: React.Dispatch<React.SetStateAction<string>>;
  twoFactorError: string | null; twoFactorEnabled: boolean;
  deletePassword: string; setDeletePassword: React.Dispatch<React.SetStateAction<string>>;
  deleteError: string | null;
  handleChangePassword: (e: React.FormEvent) => Promise<void>;
  handleEnableTwoFactor: (e: React.FormEvent) => Promise<void>;
  handleVerifyTwoFactor: (e: React.FormEvent) => Promise<void>;
  handleDisableTwoFactor: (e: React.FormEvent) => Promise<void>;
  handleDeleteAccount: () => Promise<void>;
  clearPasswordMessages: () => void;
}
export function useSettings(): UseSettingsReturn {
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
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => { setTwoFactorEnabled((user as any)?.twoFactorEnabled ?? false); }, [(user as any)?.twoFactorEnabled]);
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
    const data = result.data as any;
    if (data) { setTotpUri(data.totpURI ? String(data.totpURI) : null); setBackupCodes(data.backupCodes ? String(data.backupCodes) : null); }
  }
  async function handleVerifyTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setTwoFactorError(null);
    const result = await authClient.twoFactor.verifyTotp({ code: verifyCode, trustDevice: true });
    if (result.error) { setTwoFactorError(result.error.message ?? "Invalid code"); return; }
    setTwoFactorEnabled(true); setTotpUri(null); setBackupCodes(null); setVerifyCode(""); setTwoFactorPassword("");
  }
  async function handleDisableTwoFactor(e: React.FormEvent): Promise<void> {
    e.preventDefault(); setTwoFactorError(null);
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    if (result.error) { setTwoFactorError(result.error.message ?? "Failed to disable 2FA"); return; }
    setTwoFactorEnabled(false); setTwoFactorPassword("");
  }
  async function handleDeleteAccount(): Promise<void> {
    setDeleteError(null);
    const result = await authClient.deleteUser({ password: deletePassword });
    if (result.error) { setDeleteError(result.error.message ?? "Failed to delete account"); return; }
    router.push("/");
  }
  return { session: session as any, isPending, user: user as any, profileForm, currentPassword, setCurrentPassword, newPassword, setNewPassword, passwordError, passwordSuccess, twoFactorPassword, setTwoFactorPassword, totpUri, backupCodes, verifyCode, setVerifyCode, twoFactorError, twoFactorEnabled, deletePassword, setDeletePassword, deleteError, handleChangePassword, handleEnableTwoFactor, handleVerifyTwoFactor, handleDisableTwoFactor, handleDeleteAccount, clearPasswordMessages };
}
`,
  );
}
