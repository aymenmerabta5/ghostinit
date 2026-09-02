export function convexNotificationTokenProtectionContent(): string {
  return `const KEY_ENV = "NOTIFICATION_TOKEN_ENCRYPTION_KEY";
const DERIVATION_PREFIX = "ghostinit:notification-device-token:";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function masterKey(): Uint8Array {
  const configured = process.env[KEY_ENV];
  if (!configured || configured.startsWith("REPLACE_WITH")) {
    throw new Error("Notification token protection is unavailable");
  }
  let key: Uint8Array;
  try {
    key = decodeBase64Url(configured);
  } catch {
    throw new Error("Notification token protection is unavailable");
  }
  if (key.byteLength !== 32) throw new Error("Notification token protection is unavailable");
  return key;
}

async function hmac(keyBytes: Uint8Array, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function derivedKey(purpose: "encryption" | "fingerprint"): Promise<Uint8Array> {
  return await hmac(masterKey(), DERIVATION_PREFIX + purpose + ":v1");
}

export function requireNotificationDeviceToken(value: string): string {
  const pushToken = value.trim();
  if (pushToken.length < 16 || pushToken.length > 4096) {
    throw new Error("Invalid notification device token");
  }
  return pushToken;
}

export async function fingerprintNotificationDeviceToken(pushToken: string): Promise<string> {
  return encodeBase64Url(await hmac(await derivedKey("fingerprint"), pushToken));
}

export async function protectNotificationDeviceToken(pushToken: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(await derivedKey("encryption")),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      new TextEncoder().encode(pushToken),
    ),
  );
  const tagOffset = sealed.byteLength - 16;
  const ciphertext = sealed.slice(0, tagOffset);
  const authenticationTag = sealed.slice(tagOffset);
  return [
    "v1",
    encodeBase64Url(iv),
    encodeBase64Url(authenticationTag),
    encodeBase64Url(ciphertext),
  ].join(".");
}
`;
}
