export const sharedValidators = {
  email: `!/\\S+@\\S+\\.\\S+/.test(value) ? "Enter a valid email" : undefined`,
  emailVerbose: `!/\\S+@\\S+\\.\\S+/.test(value) ? "Enter a valid email that contains @" : undefined`,
  password: `(() => { if (value.length < 8) return "Password must be at least 8 characters"; if (value.length >= 64) return "Password must be under 64 characters"; let s=0; if (/[a-z]/.test(value)) s++; if (/[A-Z]/.test(value)) s++; if (/[0-9]/.test(value)) s++; if (/[^A-Za-z0-9]/.test(value)) s++; if (s < 2 && value.length < 12) return "Add uppercase, number, or symbol for stronger password"; return undefined; })()`,
  passwordStrong: `(() => { if (value.length < 12) return "Use 12+ characters with mixed case, number, and symbol"; return undefined; })()`,
  name: `value.trim().length >= 1 ? undefined : "Enter your name"`,
  nameStrict: `value.trim().length < 2 ? "Name must be at least 2 characters" : value.trim().length > 50 ? "Name must be under 50 characters" : undefined`,
  totp: `/^[0-9]{6}$/.test(value) ? undefined : "Enter a 6-digit code"`,
};
