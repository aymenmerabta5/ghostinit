import { describe, expect, test } from "bun:test";
import { nativeExpoMessagingFiles } from "../../src/templates/apps/fragments/messaging/native-expo.js";

function generatedPreview(database: "postgres" | "convex") {
  const files = nativeExpoMessagingFiles(database, "monorepo");
  const source = files.find((file) => file.path.endsWith(`/${database}.ts`))!.content;
  const fragment = source
    .slice(
      source.indexOf("function apiUrl"),
      source.indexOf("export async function uploadNativeAttachment"),
    )
    .replaceAll("export async function", "async function");
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(fragment);
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let cookieReads = 0;
  const responses: Response[] = [];
  const load = new Function(
    "env",
    "authClient",
    "Platform",
    "fetch",
    executable + ";return loadNativeAttachmentPreview;",
  )(
    {
      EXPO_PUBLIC_API_URL: "https://backend.fixture.example",
      EXPO_PUBLIC_CONVEX_URL: "https://tenant.convex.cloud",
    },
    {
      getCookie: () => {
        cookieReads += 1;
        return "session=fixture-session";
      },
    },
    { OS: "ios" },
    async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return (
        responses.shift() ??
        new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } })
      );
    },
  ) as (url: string, signal: AbortSignal) => Promise<string>;
  return { load, requests, responses, cookieReads: () => cookieReads, files };
}

describe("native attachment preview boundary", () => {
  for (const database of ["postgres", "convex"] as const) {
    test(`${database} resolves backend attachment URLs and authenticates only the validated route`, async () => {
      const fixture = generatedPreview(database);
      expect(
        await fixture.load("/api/messaging/attachments/owned-image", new AbortController().signal),
      ).toBe("data:image/png;base64,AQID");
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.requests[0]!.url).toBe(
        "https://backend.fixture.example/api/messaging/attachments/owned-image",
      );
      const request = fixture.requests[0]!.init;
      expect(request.credentials).toBe("include");
      expect(request.redirect).toBe("error");
      expect(new Headers(request.headers).get("cookie")).toBe("session=fixture-session");
    });

    test(`${database} rejects arbitrary URLs before reading or forwarding credentials`, async () => {
      const fixture = generatedPreview(database);
      for (const url of [
        "https://other.convex.cloud/api/storage/id",
        "https://attacker.example/api/messaging/attachments/id",
        "https://user:password@backend.fixture.example/api/messaging/attachments/id",
        "https://backend.fixture.example/api/auth/get-session",
        "https://backend.fixture.example/api/messaging/attachments/../../auth/get-session",
        "file:///private-image",
      ]) {
        await expect(fixture.load(url, new AbortController().signal)).rejects.toThrow();
      }
      expect(fixture.requests).toEqual([]);
      expect(fixture.cookieReads()).toBe(0);
    });
  }

  test("Convex storage bearer URLs use no application credentials", async () => {
    const fixture = generatedPreview("convex");
    expect(
      await fixture.load(
        "https://tenant.convex.cloud/api/storage/owned-image",
        new AbortController().signal,
      ),
    ).toBe("data:image/png;base64,AQID");
    expect(fixture.requests[0]!.init.credentials).toBe("omit");
    expect([...new Headers(fixture.requests[0]!.init.headers)]).toEqual([]);
    expect(fixture.cookieReads()).toBe(0);
  });

  test("cancelled requests, non-images, and oversized declarations never produce previews", async () => {
    const fixture = generatedPreview("postgres");
    const controller = new AbortController();
    controller.abort();
    await expect(
      fixture.load("/api/messaging/attachments/image", controller.signal),
    ).rejects.toThrow("cancelled");
    expect(fixture.requests).toEqual([]);
    fixture.responses.push(
      new Response("not an image", { headers: { "Content-Type": "text/html" } }),
    );
    await expect(
      fixture.load("/api/messaging/attachments/image", new AbortController().signal),
    ).rejects.toThrow("supported preview image");
    fixture.responses.push(
      new Response("image", {
        headers: { "Content-Type": "image/png", "Content-Length": String(10 * 1024 * 1024 + 1) },
      }),
    );
    await expect(
      fixture.load("/api/messaging/attachments/image", new AbortController().signal),
    ).rejects.toThrow("too large");
  });

  test("disposing a preview aborts work and ignores a late completion", async () => {
    const fixture = generatedPreview("postgres");
    const route = fixture.files.find((file) => file.path.endsWith("messages.tsx"))!.content;
    const start = route.indexOf(
      "  React.useEffect(() => {",
      route.indexOf("function AttachmentPreview"),
    );
    const fragment = route.slice(start, route.indexOf("  if (failed)", start));
    const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(fragment);
    const updates: unknown[] = [];
    let dispose: (() => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    let resolvePreview: ((value: string) => void) | undefined;
    new Function(
      "React",
      "setSource",
      "setFailed",
      "loadNativeAttachmentPreview",
      "url",
      executable,
    )(
      {
        useEffect: (effect: () => () => void) => {
          dispose = effect();
        },
      },
      (value: unknown) => updates.push(["source", value]),
      (value: unknown) => updates.push(["failed", value]),
      (_url: string, signal: AbortSignal) => {
        observedSignal = signal;
        return new Promise<string>((resolve) => {
          resolvePreview = resolve;
        });
      },
      "/api/messaging/attachments/image",
    );
    dispose!();
    resolvePreview!("data:image/png;base64,AQID");
    await Promise.resolve();
    expect(observedSignal!.aborted).toBe(true);
    expect(updates).toEqual([
      ["source", null],
      ["failed", false],
    ]);
    expect(route).not.toContain("<Image source={{ uri: item.url }}");
  });
});
