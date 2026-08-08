export function qrContent(): string {
  return `import QRCode from "qrcode";

export async function generateQRCodeDataUrl(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    width: 120,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}
`;
}

export function qrContentServerOnly(): string {
  return `"server-only";
${qrContent()}`;
}
