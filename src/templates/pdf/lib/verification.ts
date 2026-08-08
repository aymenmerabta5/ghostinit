export function verificationContent(): string {
  return `const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateVerificationCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => SAFE_ALPHABET[b % SAFE_ALPHABET.length]);
  return \`INTX-\${chars.slice(0, 4).join("")}-\${chars.slice(4, 8).join("")}\`;
}

export function isValidVerificationCodeFormat(code: string): boolean {
  return /^INTX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code);
}
`;
}

export function verificationContentServerOnly(): string {
  return `"server-only";
${verificationContent()}`;
}
