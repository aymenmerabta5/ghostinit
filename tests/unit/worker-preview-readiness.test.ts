import { describe, expect, test } from "bun:test";
import { WorkerPreviewReadiness } from "../../scripts/worker-preview-readiness.js";

const PORT = 43123;
const WRANGLER_READY = `[wrangler:info] Ready on http://127.0.0.1:${PORT}`;
const VITE_READY = `  ➜  Local:   http://localhost:${PORT}/`;
const TARGET_BIND_FAILURE = `Error: listen EADDRINUSE: address already in use 127.0.0.1:${PORT}`;

describe("Worker preview readiness evidence", () => {
  test("accepts only complete explicit Wrangler and Vite ready events", () => {
    for (const event of [
      WRANGLER_READY,
      VITE_READY,
      `[wrangler:info] Updated and ready on http://127.0.0.1:${PORT}`,
      `[wrangler-ProxyWorker:info] Ready on http://127.0.0.1:${PORT}/`,
      `Ready on http://127.0.0.1:${PORT}/`,
      `[wrangler:info] Ready on https://[::1]:${PORT}/`,
      `  Local:   http://127.0.0.1:${PORT}/`,
    ]) {
      const readiness = new WorkerPreviewReadiness(PORT);
      readiness.consume("stdout", event);
      expect(readiness.isReady(), "an unfinished line is not an event").toBe(false);
      readiness.consume("stdout", "\n");
      expect(readiness.isReady(), event).toBe(true);
    }
  });

  test("decodes fragmented UTF-8 and ANSI events independently on either stream", () => {
    for (const stream of ["stdout", "stderr"] as const) {
      for (const event of [
        `\u001b[2m[wrangler:info]\u001b[0m Ready on \u001b[36mhttp://127.0.0.1:${PORT}\u001b[0m\r\n`,
        `  \u001b[32m➜\u001b[0m  \u001b[1mLocal:\u001b[0m   \u001b[36mhttp://localhost:\u001b[1m${PORT}\u001b[0m/\n`,
      ]) {
        const readiness = new WorkerPreviewReadiness(PORT);
        for (const byte of Buffer.from(event)) readiness.consume(stream, Buffer.from([byte]));
        expect(readiness.isReady(), `${stream}: ${event}`).toBe(true);
      }
    }
  });

  test("never joins stdout and stderr fragments into a fabricated event", () => {
    const readiness = new WorkerPreviewReadiness(PORT);
    readiness.consume("stdout", "[wrangler:info] Ready on http://127.0.0.1:");
    readiness.consume("stderr", `${PORT}\n`);
    expect(readiness.isReady()).toBe(false);
    readiness.consume("stdout", `${PORT}\n`);
    expect(readiness.isReady()).toBe(true);
  });

  test("retains ready evidence after more than 512 KiB of later diagnostics", () => {
    const readiness = new WorkerPreviewReadiness(PORT);
    readiness.consume("stdout", `${WRANGLER_READY}\n`);
    readiness.consume("stdout", "normal request diagnostic\n".repeat(30_000));
    readiness.consume("stderr", "x".repeat(600_000));
    readiness.consume("stderr", "\n");
    expect(readiness.isReady()).toBe(true);
    readiness.consume("stderr", `${TARGET_BIND_FAILURE}\n`);
    expect(readiness.isReady()).toBe(false);
  });

  test("discards an oversized line without recognizing a ready-looking suffix", () => {
    const readiness = new WorkerPreviewReadiness(PORT);
    readiness.consume("stdout", "x".repeat(600_000));
    readiness.consume("stdout", `${WRANGLER_READY}\n`);
    expect(readiness.isReady()).toBe(false);
    readiness.consume("stdout", `${WRANGLER_READY}\n`);
    expect(readiness.isReady()).toBe(true);
  });

  test("retains bind contradictions from oversized lines without retaining those lines", () => {
    for (const parts of [
      [TARGET_BIND_FAILURE, "x".repeat(600_000)],
      ["x".repeat(300_000), ` ${TARGET_BIND_FAILURE} `, "x".repeat(300_000)],
      ["x".repeat(600_000), ` ${TARGET_BIND_FAILURE}`],
      ["x".repeat(600_000), " Error: listen EADDR", "INUSE 127.0.0.1:", String(PORT)],
    ]) {
      const readiness = new WorkerPreviewReadiness(PORT);
      for (const part of parts) readiness.consume("stderr", part);
      readiness.consume("stderr", "\n");
      readiness.consume("stdout", `${WRANGLER_READY}\n`);
      expect(readiness.isReady()).toBe(false);
    }
  });

  test("does not misread fragmented other ports inside oversized inspector diagnostics", () => {
    const readiness = new WorkerPreviewReadiness(4312);
    readiness.consume("stderr", "x".repeat(600_000));
    readiness.consume("stderr", " Inspector: EADDRINUSE 127.0.0.1:4312");
    readiness.consume("stderr", "3\n");
    readiness.consume("stdout", "[wrangler:info] Ready on http://127.0.0.1:4312\n");
    expect(readiness.isReady()).toBe(true);
  });

  test("ignores explicit unrelated inspector bind failures in either order", () => {
    const inspectorErrors = [
      "Starting inspector on 127.0.0.1:9229 failed: address already in use",
      "Auxiliary inspector: Error: listen EADDRINUSE [::1]:9229",
      "Inspector failed to bind port 9229",
      "Error: Port 9229 is already in use",
    ];
    for (const error of inspectorErrors) {
      for (const events of [
        [error, WRANGLER_READY],
        [WRANGLER_READY, error],
      ]) {
        const readiness = new WorkerPreviewReadiness(PORT);
        for (const event of events) readiness.consume("stdout", `${event}\n`);
        expect(readiness.isReady(), events.join("\n")).toBe(true);
      }
    }
  });

  test("retains target-port bind contradictions across streams and failure ordering", () => {
    const failures = [
      TARGET_BIND_FAILURE,
      `Error: listen EADDRINUSE [::]:${PORT}`,
      `Error: listen EADDRINUSE 0.0.0.0:${PORT}`,
      `Error: failed to bind port: ${PORT}`,
      `Error: unable to listen on port ${PORT}`,
      `Error: Port ${PORT} is already in use`,
      `Port ${PORT} is in use, trying another one...`,
      "Error: EADDRINUSE",
    ];
    for (const failure of failures) {
      for (const failureFirst of [true, false]) {
        const readiness = new WorkerPreviewReadiness(PORT);
        if (!failureFirst) readiness.consume("stdout", `${WRANGLER_READY}\n`);
        for (const byte of Buffer.from(`\u001b[31m${failure}\u001b[0m\n`)) {
          readiness.consume("stderr", Buffer.from([byte]));
        }
        readiness.consume("stdout", `${WRANGLER_READY}\n${VITE_READY}\n`);
        readiness.consume("stderr", "normal diagnostic\n".repeat(40_000));
        expect(readiness.isReady(), `${failure}; first=${failureFirst}`).toBe(false);
      }
    }
  });

  test("rejects wrong ports, non-loopback hosts, and URLs in errors or configuration", () => {
    for (const output of [
      "[wrangler:info] Ready on http://127.0.0.1:43124/",
      "  ➜  Local:   http://127.0.0.1:431230/",
      `Ready on http://example.test:${PORT}/`,
      `Error: Failed to fetch http://127.0.0.1:${PORT}/api/health`,
      `Error: Ready on http://127.0.0.1:${PORT}/`,
      `[wrangler:error] Ready on http://127.0.0.1:${PORT}/`,
      `[unrelated:info] Ready on http://127.0.0.1:${PORT}/`,
      `[wrangler:info] - http://127.0.0.1:${PORT}/`,
      `Configured URL: http://127.0.0.1:${PORT}/`,
      `Ready on http://127.0.0.1:${PORT}/api/health`,
      `Ready on http://127.0.0.1:${PORT}/ failed`,
      `Error: fetch failed\n    at http://127.0.0.1:${PORT}/`,
    ]) {
      const readiness = new WorkerPreviewReadiness(PORT);
      readiness.consume("stdout", `${output}\n`);
      expect(readiness.isReady(), output).toBe(false);
    }
  });

  test("finishes a final line only when that output stream ends", () => {
    const readiness = new WorkerPreviewReadiness(PORT);
    readiness.consume("stdout", WRANGLER_READY);
    readiness.finish("stderr");
    expect(readiness.isReady()).toBe(false);
    readiness.finish("stdout");
    expect(readiness.isReady()).toBe(true);
    readiness.consume("stderr", TARGET_BIND_FAILURE);
    readiness.finish("stderr");
    expect(readiness.isReady()).toBe(false);
  });
});
