import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasBroadWebSocketCspSource } from "../integration/e2e-csp.js";

const recordedCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://us.i.posthog.com https://example.convex.cloud wss://example.convex.cloud; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";

function executeHarnessCspAssertions(csp: string): void {
  const harness = readFileSync(
    resolve(import.meta.dir, "../integration/e2e-build.test.ts"),
    "utf8",
  );
  const start = harness.indexOf("      if (options.productionCsp) {");
  const end = harness.indexOf("      await new Promise(", start);
  if (start < 0 || end <= start) throw new Error("Production CSP assertion block is missing");
  const run = new Function(
    "expect",
    "health",
    "label",
    "options",
    "hasBroadWebSocketCspSource",
    harness.slice(start, end),
  ) as (...args: unknown[]) => void;
  run(
    expect,
    new Response(null, { headers: { "content-security-policy": csp } }),
    "emitted-CSP-regression",
    { productionCsp: true },
    hasBroadWebSocketCspSource,
  );
}

describe("production E2E websocket CSP acceptance", () => {
  test("accepts the actual scoped Convex production header", () => {
    expect(recordedCsp.includes(" wss:")).toBe(true);
    expect(hasBroadWebSocketCspSource(recordedCsp)).toBe(false);
    expect(() => executeHarnessCspAssertions(recordedCsp)).not.toThrow();
  });

  test("the actual production harness rejects every bare websocket scheme", () => {
    for (const source of ["ws:", "wss:", "WS:", "WSS:"]) {
      const broad = recordedCsp.replace("connect-src 'self'", "connect-src 'self' " + source);
      expect(() => executeHarnessCspAssertions(broad)).toThrow();
      const formFeed = recordedCsp.replace(
        "connect-src 'self'",
        "connect-src 'self' " + source + "\f",
      );
      expect(() => executeHarnessCspAssertions(formFeed)).toThrow();
    }
  });

  test("rejects bare schemes at literal and Headers.append policy boundaries", () => {
    for (const source of ["ws:", "wss:", "WS:", "WSS:"]) {
      const policy = recordedCsp.replace(/connect-src[^;]+;/, "") + " connect-src 'self' " + source;
      const literal = policy + ", img-src 'self'";
      const headers = new Headers();
      headers.append("content-security-policy", policy);
      headers.append("content-security-policy", "img-src 'self'");
      for (const csp of [literal, headers.get("content-security-policy")!]) {
        expect(hasBroadWebSocketCspSource(csp)).toBe(true);
        expect(() => executeHarnessCspAssertions(csp)).toThrow();
      }
    }
  });

  for (const source of ["ws:", "wss:", "WS:", "WSS:"]) {
    for (const surrounding of [
      ["connect-src 'self' ", "; object-src 'none'"],
      ["connect-src\t", "\t"],
      ["connect-src\f", "\f;"],
      ["connect-src ", ", img-src 'self'"],
      ["", ""],
      ["connect-src ", ""],
    ]) {
      test("rejects bare source " + JSON.stringify([source, surrounding]), () => {
        expect(hasBroadWebSocketCspSource(surrounding[0] + source + surrounding[1])).toBe(true);
      });
    }
  }

  test("does not confuse scoped URLs or URL paths with scheme-only sources", () => {
    for (const csp of [
      "connect-src wss://example.convex.cloud wss://api.example.test:443/ws;",
      "connect-src ws://127.0.0.1:45678;",
      "report-uri https://example.test/reports/wss:;",
      "connect-src 'self';",
    ]) {
      expect(hasBroadWebSocketCspSource(csp)).toBe(false);
    }
  });
});
