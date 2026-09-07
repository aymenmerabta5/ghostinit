import { expect } from "bun:test";
import type { Browser, Page } from "@playwright/test";

interface PasskeyRecord {
  id: string;
  userId: string;
  name: string;
}
interface ClientResult<T> {
  data: T | null;
  error?: { status?: number; code?: string; message?: string } | null;
}
declare global {
  interface Window {
    passkeyFixture: {
      register(input: { name: string }): Promise<ClientResult<PasskeyRecord>>;
      authenticate(): Promise<ClientResult<{ user: { id: string }; session: { id: string } }>>;
      list(): Promise<ClientResult<PasskeyRecord[]>>;
      rename(input: {
        id: string;
        name: string;
      }): Promise<ClientResult<{ passkey: PasskeyRecord }>>;
      remove(input: { id: string }): Promise<ClientResult<{ status: boolean }>>;
      signOut(): Promise<ClientResult<unknown>>;
      session(): Promise<ClientResult<{ user: { id: string } }>>;
    };
  }
}

async function enter(
  page: Page,
  origin: string,
  user: "owner" | "other",
  errors: readonly string[],
) {
  const seed = await page.request.post(`${origin}/__fixture__/seed`, { data: { user } });
  expect(seed.status()).toBe(200);
  await page.goto(origin);
  try {
    await page.waitForFunction(
      () => typeof window.passkeyFixture?.register === "function",
      undefined,
      { timeout: 10_000 },
    );
  } catch {
    throw new Error(`Generated passkey client did not load: ${errors.join("; ")}`);
  }
}

/** Real browser WebAuthn ceremonies; no authenticator response or crypto is mocked. */
export async function verifyGeneratedPasskeys(browser: Browser, origin: string): Promise<number> {
  const ownerContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const unexpectedOrigins: string[] = [];
  for (const context of [ownerContext, otherContext]) {
    await context.route("**/*", async (route) => {
      const requestOrigin = new URL(route.request().url()).origin;
      if (requestOrigin !== origin) {
        unexpectedOrigins.push(requestOrigin);
        await route.abort();
      } else await route.continue();
    });
  }
  const page = await ownerContext.newPage();
  const other = await otherContext.newPage();
  const cdp = await ownerContext.newCDPSession(page);
  let registrationBody: unknown;
  let authenticationBody: unknown;
  let authenticationRequests = 0;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/")) authenticationRequests += 1;
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/passkey/verify-registration")) registrationBody = request.postDataJSON();
    if (path.endsWith("/passkey/verify-authentication"))
      authenticationBody = request.postDataJSON();
  });
  try {
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await enter(page, origin, "owner", pageErrors);
    const registered = await page.evaluate(() =>
      window.passkeyFixture.register({ name: "Primary key" }),
    );
    expect(registered.error).toBeFalsy();
    expect(registered.data?.id).toBeTruthy();
    const credential = registered.data!;
    const listed = await page.evaluate(() => window.passkeyFixture.list());
    expect(listed.error).toBeFalsy();
    expect(listed.data?.map((entry) => entry.id)).toEqual([credential.id]);
    const beforeLimits = (await (
      await page.request.get(`${origin}/__fixture__/limiter`)
    ).json()) as {
      rows: Array<{ id: string; key: string; count: number }>;
      uniqueKeyEnforced: boolean;
    };
    await page.evaluate(() => window.passkeyFixture.list());
    await page.evaluate(() => window.passkeyFixture.list());
    const afterLimits = (await (
      await page.request.get(`${origin}/__fixture__/limiter`)
    ).json()) as typeof beforeLimits;
    expect(afterLimits.rows.every((row) => typeof row.id === "string" && row.id.length > 0)).toBe(
      true,
    );
    expect(
      afterLimits.rows.some(
        (row) =>
          row.count >= (beforeLimits.rows.find((before) => before.id === row.id)?.count ?? 0) + 2,
      ),
    ).toBe(true);
    expect(new Set(afterLimits.rows.map((row) => row.key)).size).toBe(afterLimits.rows.length);
    expect(afterLimits.uniqueKeyEnforced).toBe(true);
    const renamed = await page.evaluate(
      (id) => window.passkeyFixture.rename({ id, name: "Renamed key" }),
      credential.id,
    );
    expect(renamed.error).toBeFalsy();
    expect(renamed.data?.passkey.name).toBe("Renamed key");

    expect(registrationBody).toBeDefined();
    const replayRegistration = await page.request.post(
      `${origin}/api/auth/passkey/verify-registration`,
      {
        data: registrationBody,
        headers: { Origin: origin },
      },
    );
    expect(replayRegistration.status()).toBe(400);

    await enter(other, origin, "other", pageErrors);
    const foreignList = await other.evaluate(() => window.passkeyFixture.list());
    expect(foreignList.error).toBeFalsy();
    expect(foreignList.data).toEqual([]);
    const foreignRename = await other.evaluate(
      (id) => window.passkeyFixture.rename({ id, name: "Stolen name" }),
      credential.id,
    );
    expect(foreignRename.error?.status).toBe(401);
    const foreignDelete = await other.evaluate(
      (id) => window.passkeyFixture.remove({ id }),
      credential.id,
    );
    expect(foreignDelete.error?.status).toBe(401);
    expect((await page.evaluate(() => window.passkeyFixture.list())).data?.[0]?.name).toBe(
      "Renamed key",
    );

    expect((await page.evaluate(() => window.passkeyFixture.signOut())).error).toBeFalsy();
    expect((await page.evaluate(() => window.passkeyFixture.list())).error?.status).toBe(401);
    const authenticated = await page.evaluate(() => window.passkeyFixture.authenticate());
    expect(authenticated.error).toBeFalsy();
    expect(authenticated.data?.user.id).toBe(credential.userId);
    expect(authenticated.data?.session.id).toBeTruthy();
    expect(authenticationBody).toBeDefined();
    const replayAuthentication = await page.request.post(
      `${origin}/api/auth/passkey/verify-authentication`,
      {
        data: authenticationBody,
        headers: { Origin: origin },
      },
    );
    expect(replayAuthentication.status()).toBe(400);

    const deleted = await page.evaluate(
      (id) => window.passkeyFixture.remove({ id }),
      credential.id,
    );
    expect(deleted.error).toBeFalsy();
    expect(deleted.data?.status).toBe(true);
    expect((await page.evaluate(() => window.passkeyFixture.list())).data).toEqual([]);
    expect((await page.evaluate(() => window.passkeyFixture.signOut())).error).toBeFalsy();
    const removedCredential = await page.evaluate(() => window.passkeyFixture.authenticate());
    expect(removedCredential.error).toBeTruthy();
    expect(removedCredential.data).toBeNull();
    expect(unexpectedOrigins).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(authenticationRequests).toBeGreaterThanOrEqual(14);
    return authenticationRequests;
  } finally {
    await ownerContext.close();
    await otherContext.close();
  }
}
