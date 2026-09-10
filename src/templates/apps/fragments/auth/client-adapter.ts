import {
  identityPasskeyClientCapabilityFor,
  type IdentityClientTarget,
} from "../../../../domain/data-model/index.js";

export { IDENTITY_OAUTH_PROVIDERS, isIdentityOAuthProvider } from "./client-validation.js";
export type { IdentityOAuthProvider } from "./client-validation.js";

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
  const emailFlowTypes = `export interface IdentityEmailFlowResult {
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
  return `import { IDENTITY_OAUTH_PROVIDERS, isIdentityOAuthProvider, type IdentityOAuthProvider } from "./auth-model";
export { IDENTITY_OAUTH_PROVIDERS, isIdentityOAuthProvider, isIdentityRecentAuthenticationError } from "./auth-model";
export type { IdentityOAuthProvider } from "./auth-model";
export { createSignInSchema, createSignUpSchema, createEmailSchema, createResetPasswordSchema, createProfileSchema, createChangePasswordSchema, createRequiredPasswordSchema, createTotpSchema, createTwoFactorChallengeSchema } from "./auth-validation";
export type { EmailPasswordMessages, NameMessages } from "./auth-validation";

export const identityPasskeyCapability = Object.freeze(${JSON.stringify(passkeyCapability)} as const);
export const identityClientCapabilities = Object.freeze({
  emailPassword: ${emailPassword},
  oauthProviders: IDENTITY_OAUTH_PROVIDERS,
  passkey: identityPasskeyCapability,
});

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

`;
}
