import { describe, expect, test } from "bun:test";
import { nativeExpoMessagingFiles } from "../../src/templates/apps/fragments/messaging/native-expo.js";
import { deferred, flush, generatedFormHarness } from "../helpers/generated-form-harness.js";

function generatedPreview(database: "postgres" | "convex") {
  const files = nativeExpoMessagingFiles(database, "monorepo");
  const source = files.find((file) => file.path.endsWith(`/${database}.ts`))!.content;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let cookieReads = 0;
  const responses: Response[] = [];
  const runtime = generatedFormHarness(source, ["loadNativeAttachmentPreview"], {
    env: {
      EXPO_PUBLIC_API_URL: "https://backend.fixture.example",
      EXPO_PUBLIC_CONVEX_URL: "https://tenant.convex.cloud",
    },
    authClient: {
      getCookie: () => {
        cookieReads += 1;
        return "session=fixture-session";
      },
    },
    Platform: { OS: "ios" },
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return (
        responses.shift() ??
        new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } })
      );
    },
  });
  const load = runtime.module.loadNativeAttachmentPreview as (
    url: string,
    signal: AbortSignal,
  ) => Promise<string>;
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
    const queries = fixture.files.find((file) =>
      file.path.endsWith("/features/messaging/queries.ts"),
    )!.content;
    let query:
      | { queryFn(input: { signal: AbortSignal }): Promise<string>; enabled: boolean }
      | undefined;
    const adapter = generatedFormHarness(queries, ["useAttachmentPreviewQuery"], {
      useAttachmentQuery: (options: typeof query) => {
        query = options;
        return {};
      },
      loadNativeAttachmentPreview: fixture.load,
    });
    (adapter.module.useAttachmentPreviewQuery as (url: string, enabled: boolean) => unknown)(
      "/api/messaging/attachments/image",
      true,
    );
    expect(query!.enabled).toBe(true);
    const bytes = deferred<ArrayBuffer>();
    class PendingImage extends Response {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return bytes.promise;
      }
    }
    fixture.responses.push(new PendingImage(null, { headers: { "Content-Type": "image/png" } }));
    const controller = new AbortController();
    const preview = query!.queryFn({ signal: controller.signal });
    await flush();
    controller.abort();
    bytes.resolve(new Uint8Array([1, 2, 3]).buffer);
    await expect(preview).rejects.toThrow("cancelled");
    expect(fixture.requests[0]!.init.signal).toBe(controller.signal);
    const presentation = fixture.files.find((file) =>
      file.path.endsWith("/components/messaging-attachment-view.tsx"),
    )!.content;
    expect(presentation).not.toContain("<Image source={{ uri: item.url }}");
  });
});
