import {
  identityPasskeyClientCapabilityFor,
  type IdentityClientTarget,
} from "../../../../domain/data-model/index.js";

export const IDENTITY_OAUTH_PROVIDERS = ["google", "github"] as const;

export type IdentityOAuthProvider = (typeof IDENTITY_OAUTH_PROVIDERS)[number];

export function isIdentityOAuthProvider(value: string): value is IdentityOAuthProvider {
  return (IDENTITY_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Application-owned browser boundary around Better Auth.
 *
 * Generated UI imports only this allowlisted surface for account mutations. The
 * raw client remains exported for framework providers and the reactive session
 * hook, but credential, OAuth, recovery, profile and security operations do not
 * leak vendor method paths into feature components.
 */
export interface IdentityClientAdapterOptions {
  readonly database?: "postgres" | "convex" | "none";
  readonly emailPassword?: boolean;
  readonly oauthMode?: "browser" | "desktop";
  readonly target?: IdentityClientTarget;
}

export function identityClientAdapterContent(options: IdentityClientAdapterOptions = {}): string {
  const database = options.database ?? "postgres";
  const emailPassword = options.emailPassword ?? true;
  const target = options.target ?? "nextjs";
  const passkeyCapability = identityPasskeyClientCapabilityFor(database, target);
  const oauthCall =
    options.oauthMode === "desktop"
      ? "desktopSignInWithOAuth(input)"
      : "authClient.signIn.social(input)";
  const emailFlowTypes = `interface IdentityEmailFlowResult {
  data?: unknown;
  error?: { message?: string } | null;
}

interface IdentityEmailFlowClient {
  signIn: {
    magicLink(input: { email: string; callbackURL: string }): Promise<IdentityEmailFlowResult>;
  };
  sendVerificationEmail(input: {
    email: string;
    callbackURL: string;
  }): Promise<IdentityEmailFlowResult>;
}

const identityEmailFlowClient = authClient as typeof authClient & IdentityEmailFlowClient;
`;
  const emailPasswordMethods = `  signInWithEmail(input: { email: string; password: string; callbackURL: string }) {
    return authClient.signIn.email(input);
  },
  signUpWithEmail(input: { name: string; email: string; password: string; callbackURL: string }) {
    return authClient.signUp.email(input);
  },
`;
  const emailRecoveryMethods = `  requestPasswordReset(input: { email: string; redirectTo: string }) {
    return authClient.requestPasswordReset(input);
  },
  requestMagicLink(input: { email: string; callbackURL: string }) {
    return identityEmailFlowClient.signIn.magicLink(input);
  },
  requestEmailVerification(input: { email: string; callbackURL: string }) {
    return identityEmailFlowClient.sendVerificationEmail(input);
  },
  resetPassword(input: { newPassword: string; token: string }) {
    return authClient.resetPassword(input);
  },
`;
  const passwordSecurityMethods = `  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
  }) {
    return authClient.changePassword(input);
  },
  enableTwoFactor(input: { password: string }) {
    return authClient.twoFactor.enable(input);
  },
  verifyTwoFactor(input: { code: string; trustDevice: boolean }) {
    return authClient.twoFactor.verifyTotp(input);
  },
  verifyBackupCode(input: { code: string; trustDevice: boolean }) {
    return authClient.twoFactor.verifyBackupCode(input);
  },
  disableTwoFactor(input: { password: string }) {
    return authClient.twoFactor.disable(input);
  },
`;
  const deleteAccountMethod = `  deleteAccount(input?: { password: string }) {
    // OAuth-only accounts omit a password; Better Auth then requires a recent session.
    return authClient.deleteUser(input ?? {});
  },`;
  const passkeyClient =
    passkeyCapability.status === "supported"
      ? `export const identityPasskeyClient = Object.freeze({
  supported: true as const,
  capability: identityPasskeyCapability,
  authenticate() {
    return authClient.signIn.passkey();
  },
  register(input: { name?: string } = {}) {
    return authClient.passkey.addPasskey(input);
  },
  list(options: { signal?: AbortSignal } = {}) {
    return authClient.passkey.listUserPasskeys({ fetchOptions: options });
  },
  rename(input: { id: string; name: string }) {
    return authClient.passkey.updatePasskey(input);
  },
  delete(input: { id: string }) {
    return authClient.passkey.deletePasskey(input);
  },
});`
      : `export const identityPasskeyClient = identityPasskeyCapability;`;
  return `export const IDENTITY_OAUTH_PROVIDERS = ${JSON.stringify(IDENTITY_OAUTH_PROVIDERS)} as const;
export type IdentityOAuthProvider = (typeof IDENTITY_OAUTH_PROVIDERS)[number];

function isIdentityOAuthProvider(value: string): value is IdentityOAuthProvider {
  return (IDENTITY_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export const identityPasskeyCapability = Object.freeze(${JSON.stringify(passkeyCapability)} as const);
export const identityClientCapabilities = Object.freeze({
  emailPassword: ${emailPassword},
  oauthProviders: IDENTITY_OAUTH_PROVIDERS,
  passkey: identityPasskeyCapability,
});

export function isIdentityRecentAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = Reflect.get(error, "code");
  return code === "SESSION_NOT_FRESH" || code === "SESSION_EXPIRED";
}

${emailFlowTypes}
${passkeyClient}

export const identityClient = Object.freeze({
  capabilities: identityClientCapabilities,
  passkeys: identityPasskeyClient,
  useSession() {
    return authClient.useSession();
  },
${emailPasswordMethods}
  signInWithOAuth(input: { provider: IdentityOAuthProvider; callbackURL: string }) {
    if (!isIdentityOAuthProvider(input.provider)) {
      throw new TypeError("Unsupported OAuth provider");
    }
    return ${oauthCall};
  },
${emailRecoveryMethods}
  updateProfile(input: { name: string }) {
    return authClient.updateUser(input);
  },
${passwordSecurityMethods}
${deleteAccountMethod}
});

export interface EmailPasswordMessages {
  invalidEmail: string;
  passwordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
}

export interface NameMessages {
  nameRequired: string;
  nameTooShort: string;
  nameTooLong: string;
}

function passwordSchema(messages: Pick<EmailPasswordMessages, "passwordRequired" | "passwordTooShort" | "passwordTooLong">) {
  return z
    .string()
    .min(1, messages.passwordRequired)
    .min(8, messages.passwordTooShort)
    .max(64, messages.passwordTooLong);
}

export function createSignInSchema(messages: EmailPasswordMessages) {
  return z.object({
    email: z.string().trim().email(messages.invalidEmail),
    password: passwordSchema(messages),
  });
}

export function createSignUpSchema(messages: EmailPasswordMessages & NameMessages) {
  return createSignInSchema(messages).extend({
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .min(2, messages.nameTooShort)
      .max(50, messages.nameTooLong),
  });
}

export function createEmailSchema(invalidEmail: string) {
  return z.object({ email: z.string().trim().email(invalidEmail) });
}

export function createResetPasswordSchema(
  messages: Pick<EmailPasswordMessages, "passwordRequired" | "passwordTooShort" | "passwordTooLong"> & {
    passwordMismatch: string;
  },
) {
  return z
    .object({
      newPassword: passwordSchema(messages),
      confirmPassword: passwordSchema(messages),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}

export function createProfileSchema(messages: NameMessages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .min(2, messages.nameTooShort)
      .max(50, messages.nameTooLong),
  });
}

export function createChangePasswordSchema(
  messages: Pick<EmailPasswordMessages, "passwordRequired" | "passwordTooShort" | "passwordTooLong"> & {
    currentPasswordRequired: string;
  },
) {
  return z.object({
    currentPassword: z.string().min(1, messages.currentPasswordRequired),
    newPassword: passwordSchema(messages),
  });
}

export function createRequiredPasswordSchema(passwordRequired: string) {
  return z.object({ password: z.string().min(1, passwordRequired) });
}

export function createTotpSchema(codeSixDigits: string) {
  return z.object({ code: z.string().regex(/^[0-9]{6}$/, codeSixDigits) });
}

export function createTwoFactorChallengeSchema(method: "authenticator" | "backup", message: string) {
  return z.object({
    code: method === "backup" ? z.string().trim().min(1, message) : z.string().regex(/^[0-9]{6}$/, message),
    trustDevice: z.boolean(),
  });
}
`;
}
