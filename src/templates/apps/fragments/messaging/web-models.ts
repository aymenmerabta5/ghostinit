export function messagingWebModelsContent(): string {
  return `export interface ConversationSummary {
  id: string;
}

export interface MessageSummary {
  id: string;
  body?: string | null;
  senderId: string;
  createdAt: string;
  attachments?: Array<{ url: string; mimeType: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toConversation(value: unknown): ConversationSummary | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
  };
}

function toAttachment(value: unknown): { url: string; mimeType: string } | undefined {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.mimeType !== "string") {
    return undefined;
  }
  return { url: value.url, mimeType: value.mimeType };
}

export function toMessage(value: unknown): MessageSummary | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.senderId !== "string"
  ) {
    return undefined;
  }
  const createdAt = value.createdAt instanceof Date
    ? value.createdAt
    : typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime())) return undefined;
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.flatMap((item) => {
        const attachment = toAttachment(item);
        return attachment ? [attachment] : [];
      })
    : undefined;
  return {
    id: value.id,
    senderId: value.senderId,
    createdAt: createdAt.toISOString(),
    ...(typeof value.body === "string" || value.body === null ? { body: value.body } : {}),
    ...(attachments ? { attachments } : {}),
  };
}

export function createClientMessageKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  if (typeof cryptoValue === "object" && cryptoValue !== null) {
    const randomUUID: unknown = Reflect.get(cryptoValue, "randomUUID");
    if (typeof randomUUID === "function") {
      const generated: unknown = Reflect.apply(randomUUID, cryptoValue, []);
      if (typeof generated === "string" && generated.length >= 16) return generated;
    }
  }
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join("-");
}

export interface PendingMessageAttachmentUpload {
  conversationId: string;
  fileFingerprint: string;
  attachmentId: string;
}

export interface MessageAttachmentFingerprintInput {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export function messageAttachmentFingerprint(file: MessageAttachmentFingerprintInput): string {
  return JSON.stringify([file.name, file.size, file.type, file.lastModified]);
}

export function reusablePendingAttachmentId(
  pending: PendingMessageAttachmentUpload | null,
  conversationId: string,
  fileFingerprint: string,
): string | undefined {
  return pending?.conversationId === conversationId && pending.fileFingerprint === fileFingerprint
    ? pending.attachmentId
    : undefined;
}

`;
}
