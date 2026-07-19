/**
 * Shared auth form validators and UI patterns.
 * Used by both Next and TanStack auth pages to stay DRY.
 */
export const validators = {
  email: (v: string) => (v.includes("@") ? undefined : "Enter a valid email"),
  password: (v: string) => (v.length >= 8 ? undefined : "Password must be at least 8 characters"),
  code6: (v: string) => (/^[0-9]{6}$/.test(v) ? undefined : "Enter a 6-digit code"),
};

export const authFormDescription = "Secure session with httpOnly lax cookies.";
