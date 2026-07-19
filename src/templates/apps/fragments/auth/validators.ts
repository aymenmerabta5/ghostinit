export const sharedValidators = {
  email: `value.includes("@") ? undefined : "Enter a valid email"`,
  emailVerbose: `value.includes("@") ? undefined : "Enter a valid email that contains @"`,
  password: `value.length >= 8 ? undefined : "Password must be at least 8 characters"`,
  name: `value.trim().length >= 1 ? undefined : "Enter your name"`,
  totp: `/^[0-9]{6}$/.test(value) ? undefined : "Enter a 6-digit code"`,
};
