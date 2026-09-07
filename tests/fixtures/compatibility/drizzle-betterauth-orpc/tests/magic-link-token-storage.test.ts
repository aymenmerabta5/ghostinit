import { describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";

const rawToken = "synthetic-magic-link-token-1234567890";
const requestHeaders = new Headers({ origin: "http://localhost:3000" });

async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("base64url");
}

async function issueMagicLink(storeToken?: "plain" | "hashed") {
  let deliveredToken: string | undefined;
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "better-auth-secret-that-is-long-enough-for-magic-link-tests",
    rateLimit: { enabled: false },
    plugins: [
      magicLink({
        ...(storeToken ? { storeToken } : {}),
        generateToken: () => rawToken,
        sendMagicLink: ({ token }) => {
          deliveredToken = token;
        },
      }),
    ],
  });

  await auth.api.signInMagicLink({
    body: { email: "magic-link@example.com" },
    headers: requestHeaders,
  });

  return { auth, deliveredToken };
}

describe("pinned Better Auth magic-link token storage semantics", () => {
  test("defaults to persisting the bearer token in plaintext", async () => {
    const { auth, deliveredToken } = await issueMagicLink();
    const context = await auth.$context;

    expect(deliveredToken).toBe(rawToken);
    expect(await context.internalAdapter.findVerificationValue(rawToken)).not.toBeNull();
  });

  test('storeToken: "hashed" persists only the digest while delivering the bearer token', async () => {
    const { auth, deliveredToken } = await issueMagicLink("hashed");
    const context = await auth.$context;
    const hashedToken = await sha256Base64Url(rawToken);

    expect(deliveredToken).toBe(rawToken);
    expect(await context.internalAdapter.findVerificationValue(rawToken)).toBeNull();
    expect(await context.internalAdapter.findVerificationValue(hashedToken)).toMatchObject({
      identifier: hashedToken,
    });
  });
});
