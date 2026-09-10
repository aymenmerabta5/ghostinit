export function manualPaymentConfigContent(): string {
  return `/** Configure the real recipient before accepting transfers. Amounts and balances are DZD minor units (100 = 1 DZD). */
export const manualPaymentConfig = {
  enabled: false,
  currency: "DZD" as const,
  receiverInstructions: "",
  allowedMethods: ["BaridiMob", "Bank transfer"] as readonly string[],
};
`;
}
