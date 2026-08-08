export function invoiceExampleContent(): string {
  return `import type { InvoiceData } from "../templates/invoice";

export const exampleInvoiceData: InvoiceData = {
  invoiceNumber: "INV-2025-001",
  issuedAt: new Date(),
  dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  from: { name: "Acme Corp", email: "hello@acme.com", address: "123 Business St, Algiers, DZ" },
  to: { name: "Client LLC", email: "client@example.com", address: "456 Client Ave, Oran, DZ" },
  items: [
    { description: "Design System Setup", quantity: 1, unitPrice: 1200 },
    { description: "Monthly Retainer — Development", quantity: 2, unitPrice: 2500 },
  ],
  currency: "USD",
  notes: "Payment due within 14 days. Thank you!",
};
`;
}

export function certificateExampleContent(): string {
  return `import type { CertificateData } from "../templates/certificate";

export const exampleCertificateData: CertificateData = {
  recipientName: "Aymen Benali",
  recipientEmail: "aymen@example.com",
  issuerName: "GhostInit Academy",
  reason: "has successfully completed the Advanced PDF Generation course",
  issuedAt: new Date(),
};
`;
}

export function agreementExampleContent(): string {
  return `import type { AgreementData } from "../templates/agreement";

export const exampleAgreementData: AgreementData = {
  title: "Service Agreement",
  subtitle: "ghostinit",
  parties: [
    { name: "Acme Corp", email: "legal@acme.com", roleLabel: "Provider", color: "#2563eb" },
    { name: "Client LLC", email: "client@example.com", roleLabel: "Client", color: "#059669" },
  ],
  effectiveDate: new Date(),
  expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  terms: ["Provider will deliver services as described.", "Client will pay per invoice terms.", "Either party may terminate with 30 days notice."],
  notes: "This is a sample agreement for demonstration purposes.",
};
`;
}
