import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync } from "oxc-parser";
import { proxyFiles } from "../../src/templates/proxy.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("maintenance bypass exchange", () => {
  test("uses a bounded same-origin POST and never puts the master token in a URL or cookie", async () => {
    const files = proxyFiles("monorepo", false, true);
    const access = files.find(({ path }) => path.endsWith("/lib/maintenance-access.ts"));
    const route = files.find(({ path }) => path.endsWith("/maintenance/access/route.ts"));
    const page = files.find(({ path }) => path.endsWith("/maintenance/page.tsx"));
    const proxy = files.find(({ path }) => path.endsWith("/proxy.ts"));
    if (!access || !route || !page || !proxy) throw new Error("Maintenance files were not emitted");

    for (const file of [access, route, page, proxy]) {
      expect(parseSync(file.path, file.content).errors, file.path).toEqual([]);
    }
    const emitted = files.map(({ content }) => content).join("\n");
    expect(emitted).not.toContain("?maintenance_bypass=");
    expect(proxy.content).not.toContain("searchParams.get");
    expect(page.content).toContain('method="post"');
    expect(page.content).toContain('type="password"');
    expect(route.content).toContain("origin !== requestOrigin");
    expect(route.content).toContain("MAX_ACCESS_BODY_BYTES");
    expect(route.content).toContain("ACCESS_BODY_TIMEOUT_MS");
    expect(route.content).toContain("MAX_ACCESS_ATTEMPTS");
    expect(route.content).toContain('response.headers.set("Cache-Control", "no-store")');

    const directory = mkdtempSync(join(tmpdir(), "ghostinit-maintenance-test-"));
    temporaryDirectories.push(directory);
    const modulePath = join(directory, "maintenance-access.ts");
    writeFileSync(modulePath, access.content);
    const module = (await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`)) as {
      isMaintenanceSecretConfigured(secret: string | undefined): boolean;
      issueMaintenanceCookie(secret: string): Promise<string>;
      matchesMaintenanceMaster(candidate: string, secret: string): Promise<boolean>;
      verifyMaintenanceCookie(cookie: string | undefined, secret: string): Promise<boolean>;
    };
    const secret = "A9_secure-maintenance-token_B7xQ2mN8pL4vR6z";
    expect(module.isMaintenanceSecretConfigured("repeated-repeated-repeated-repeated")).toBe(false);
    expect(module.isMaintenanceSecretConfigured(secret)).toBe(true);
    expect(await module.matchesMaintenanceMaster(secret, secret)).toBe(true);
    expect(await module.matchesMaintenanceMaster(`${secret}x`, secret)).toBe(false);
    const cookie = await module.issueMaintenanceCookie(secret);
    expect(cookie).not.toContain(secret);
    expect(await module.verifyMaintenanceCookie(cookie, secret)).toBe(true);
    const [expiresText, encodedSignature] = cookie.split(".") as [string, string];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const canonicalLastIndex = alphabet.indexOf(encodedSignature.at(-1) ?? "");
    expect(canonicalLastIndex).toBeGreaterThanOrEqual(0);
    expect(canonicalLastIndex % 4).toBe(0);
    const nonCanonicalSignature = encodedSignature.slice(0, -1) + alphabet[canonicalLastIndex + 1];
    expect(Buffer.from(nonCanonicalSignature, "base64url")).toEqual(
      Buffer.from(encodedSignature, "base64url"),
    );
    expect(
      await module.verifyMaintenanceCookie(`${expiresText}.${nonCanonicalSignature}`, secret),
    ).toBe(false);
    expect(await module.verifyMaintenanceCookie(`${cookie.slice(0, -1)}x`, secret)).toBe(false);
    expect(access.content).toContain("crypto.subtle.verify");
  });
});
