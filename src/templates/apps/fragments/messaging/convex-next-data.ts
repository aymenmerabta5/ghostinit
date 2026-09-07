export function convexNextMessageViewsContent(): string {
  return `interface MessageAttachmentView {
  id: string;
  url: string;
  originalName: string;
}

export interface MessageView {
  id: string;
  body: string | null;
  attachments: MessageAttachmentView[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attachmentView(value: unknown): MessageAttachmentView | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string" || typeof value.originalName !== "string") return null;
  return { id: value.id, url: value.url, originalName: value.originalName };
}

function messageView(value: unknown): MessageView | null {
  if (!isRecord(value) || typeof value._id !== "string") return null;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.flatMap((attachment) => attachmentView(attachment) ?? [])
    : [];
  return {
    id: value._id,
    body: typeof value.body === "string" ? value.body : null,
    attachments,
  };
}

export function messageViews(value: unknown): MessageView[] {
  if (!isRecord(value) || !Array.isArray(value.messages)) return [];
  return value.messages.flatMap((message) => messageView(message) ?? []);
}
`;
}
