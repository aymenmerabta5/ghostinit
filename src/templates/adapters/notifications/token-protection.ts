export function notificationTokenProtectionContent(): string {
  return `import "server-only";
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_ENV = "NOTIFICATION_TOKEN_ENCRYPTION_KEY";

function masterKey(): Buffer {
  const configured = process.env[KEY_ENV];
  if (!configured || configured.startsWith("REPLACE_WITH")) {
    throw new Error(KEY_ENV + " must contain a 32-byte base64url key");
  }
  const key = Buffer.from(configured, "base64url");
  if (key.byteLength !== 32) throw new Error(KEY_ENV + " must decode to exactly 32 bytes");
  return key;
}

function derivedKey(purpose: "encryption" | "fingerprint"): Buffer {
  return createHmac("sha256", masterKey())
    .update("ghostinit:notification-device-token:" + purpose + ":v1", "utf8")
    .digest();
}

export function fingerprintNotificationDeviceToken(pushToken: string): string {
  return createHmac("sha256", derivedKey("fingerprint"))
    .update(pushToken, "utf8")
    .digest("base64url");
}

export function assertNotificationTokenFingerprint(pushToken: string, expected: string): void {
  const actual = fingerprintNotificationDeviceToken(pushToken);
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.byteLength !== expectedBytes.byteLength || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Error("Notification token fingerprint mismatch");
  }
}

export function protectNotificationDeviceToken(pushToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("encryption"), iv);
  const ciphertext = Buffer.concat([cipher.update(pushToken, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
`;
}
