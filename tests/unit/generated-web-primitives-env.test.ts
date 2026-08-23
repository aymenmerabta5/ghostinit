import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  createGeneratedProcessEnv,
  parseEnvContent,
} from "../helpers/generated-web-primitives-env.js";

describe("generated web primitive environment boundary", () => {
  test("parses only assignments and removes matching quotes", () => {
    expect(
      parseEnvContent(
        [
          "",
          "  # comment",
          "PLAIN=value",
          'DOUBLE="two words"',
          "SINGLE='three words'",
          "EMPTY=",
        ].join("\n"),
        "fixture.env",
      ),
    ).toEqual({
      PLAIN: "value",
      DOUBLE: "two words",
      SINGLE: "three words",
      EMPTY: "",
    });
  });

  test("rejects malformed, unmatched, and conflicting duplicate entries without values", () => {
    expect(() => parseEnvContent("MISSING_EQUALS", "fixture.env")).toThrow(
      "Malformed environment entry at fixture.env:1",
    );
    expect(() => parseEnvContent('BROKEN="secret', "fixture.env")).toThrow(
      "Unmatched quote for BROKEN at fixture.env:1",
    );
    expect(() => parseEnvContent("DUPLICATE=one\nDUPLICATE=two", "fixture.env")).toThrow(
      "Conflicting duplicate environment key DUPLICATE",
    );
  });

  test("reads root and app env files, merges base env, and reserves public URLs", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-primitive-env-"));
    const transaction = new FsTransaction(root);
    try {
      await transaction.write(
        ".env.local",
        [
          "POSTGRES_PASSWORD=root-password",
          "BETTER_AUTH_SECRET=abcdefghijklmnopqrstuvwxyz123456",
          "BETTER_AUTH_URL=http://localhost:3000",
          "ROOT_ONLY=root",
        ].join("\n"),
      );
      await transaction.write(
        "apps/web/.env.local",
        [
          "POSTGRES_PASSWORD=root-password",
          'BETTER_AUTH_SECRET="abcdefghijklmnopqrstuvwxyz123456"',
          "BETTER_AUTH_URL='http://localhost:3000'",
          "APP_ONLY=app",
          "RESEND_API_KEY=REPLACE_WITH_RESEND_API_KEY",
        ].join("\n"),
      );
      expect(transaction.getStagedFiles()).toHaveLength(2);
      await transaction.commit();

      const env = createGeneratedProcessEnv(root, "http://127.0.0.1:43123", {
        BASE_ONLY: "base",
        NEXT_PUBLIC_APP_URL: "http://stale.invalid",
      });

      expect(env.BASE_ONLY).toBe("base");
      expect(env.ROOT_ONLY).toBe("root");
      expect(env.APP_ONLY).toBe("app");
      expect(env.NEXT_PUBLIC_APP_URL).toBe("http://127.0.0.1:43123");
      expect(env.VITE_APP_URL).toBe("http://127.0.0.1:43123");
      expect(env.POSTGRES_PASSWORD).toBe("root-password");
      expect(env.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
      expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
      expect(env.RESEND_API_KEY).toBe("REPLACE_WITH_RESEND_API_KEY");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
