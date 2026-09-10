import { describe, expect, test } from "bun:test";
import {
  desktopMessagingAttachmentContent,
  expoMessagingAttachmentContent,
} from "../../src/templates/apps/fragments/messaging/native-attachments.js";
import { deferred, flush, generatedFormHarness } from "../helpers/generated-form-harness.js";

const draft = { uri: "file:///receipt.png", name: "receipt.png", mimeType: "image/png" };
const backend = "https://app.example.test";
const attachmentUrl = `${backend}/api/messaging/attachments/receipt`;
type Callable = (...args: unknown[]) => Promise<unknown>;

function expoRuntime(bindings: Record<string, unknown>) {
  return generatedFormHarness(
    expoMessagingAttachmentContent("monorepo", "convex"),
    [
      "uploadNativeAttachment",
      "downloadNativeAttachment",
      "loadNativeAttachmentPreview",
      "pickNativeAttachment",
    ],
    {
      Platform: { OS: "ios" },
      env: { EXPO_PUBLIC_API_URL: backend, EXPO_PUBLIC_CONVEX_URL: "https://storage.convex.cloud" },
      ...bindings,
    },
  ).module as unknown as Record<string, Callable>;
}

describe("native messaging attachment action ownership", () => {
  for (const boundary of ["local", "blob", "cookie", "response", "json"] as const) {
    test(`Expo upload checks owner after ${boundary} before continuing`, async () => {
      let current = true;
      let posts = 0;
      let reached = 0;
      const gate = deferred<void>();
      const pause = async (name: string) => {
        if (name === boundary) {
          reached += 1;
          await gate.promise;
        }
      };
      const runtime = expoRuntime({
        authClient: {
          getCookie: async () => {
            await pause("cookie");
            return "session=fixture";
          },
        },
        fetch: async (url: string) => {
          if (url.startsWith("file:")) {
            await pause("local");
            return {
              ok: true,
              blob: async () => {
                await pause("blob");
                return new Blob(["receipt"]);
              },
            };
          }
          posts += 1;
          await pause("response");
          return {
            ok: true,
            json: async () => {
              await pause("json");
              return { attachmentId: "receipt" };
            },
          };
        },
      });
      const result = runtime.uploadNativeAttachment!("conversation", draft, () => current);
      await flush();
      expect(reached).toBe(1);
      current = false;
      gate.resolve();
      await expect(result).rejects.toThrow("owner changed");
      expect(posts).toBe(["response", "json"].includes(boundary) ? 1 : 0);
    });
  }

  test("Expo current owner uploads the selected file with its conversation and session", async () => {
    const requests: RequestInit[] = [];
    const runtime = expoRuntime({
      authClient: { getCookie: async () => "session=fixture" },
      fetch: async (url: string, options: RequestInit) => {
        if (url.startsWith("file:")) return { ok: true, blob: async () => new Blob(["receipt"]) };
        requests.push(options);
        return { ok: true, json: async () => ({ attachmentId: "receipt" }) };
      },
    });
    await expect(runtime.uploadNativeAttachment!("conversation", draft, () => true)).resolves.toBe(
      "receipt",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers).toEqual({
      "X-Ghostinit-Conversation-Id": "conversation",
      cookie: "session=fixture",
    });
    expect((requests[0]!.body as FormData).get("conversationId")).toBe("conversation");
  });

  for (const boundary of ["cookie", "network", "bytes", "sharing"] as const) {
    test(`Expo download cannot write or share after owner change during ${boundary}`, async () => {
      let current = true;
      let reached = 0;
      const gate = deferred<void>();
      const effects: string[] = [];
      const pause = async (name: string) => {
        if (name === boundary) {
          reached += 1;
          await gate.promise;
        }
      };
      const runtime = expoRuntime({
        authClient: {
          getCookie: async () => {
            await pause("cookie");
            return "session=fixture";
          },
        },
        fetch: async () => {
          await pause("network");
          return {
            ok: true,
            headers: new Headers({ "content-type": "image/png" }),
            arrayBuffer: async () => {
              await pause("bytes");
              return new ArrayBuffer(1);
            },
          };
        },
        File: class {
          uri = "cache/receipt.png";
          constructor() {
            effects.push("file");
          }
          write() {
            effects.push("write");
          }
        },
        Paths: { cache: "cache" },
        Sharing: {
          isAvailableAsync: async () => {
            await pause("sharing");
            return true;
          },
          shareAsync: async () => {
            effects.push("share");
          },
        },
      });
      const result = runtime.downloadNativeAttachment!(attachmentUrl, "receipt.png", () => current);
      await flush();
      expect(reached).toBe(1);
      current = false;
      gate.resolve();
      await expect(result).rejects.toThrow("owner changed");
      expect(effects).toEqual(boundary === "sharing" ? ["file", "write"] : []);
    });
  }

  test("Expo picker and preview suppress obsolete selections and cancelled cookie-wait dispatches", async () => {
    const gate = deferred<void>();
    let current = true;
    let requests = 0;
    const runtime = expoRuntime({
      File: {
        pickFileAsync: async () => {
          await gate.promise;
          return { canceled: false, result: { uri: draft.uri, name: draft.name } };
        },
      },
      authClient: {
        getCookie: async () => {
          await gate.promise;
          return "session=fixture";
        },
      },
      fetch: async () => {
        requests += 1;
        return new Response();
      },
    });
    const picked = runtime.pickNativeAttachment!(() => current);
    const controller = new AbortController();
    const preview = runtime.loadNativeAttachmentPreview!(
      attachmentUrl,
      controller.signal,
      () => true,
    );
    const settled = Promise.all([
      picked.catch((error: unknown) => error),
      preview.catch((error: unknown) => error),
    ]);
    current = false;
    controller.abort();
    gate.resolve();
    const [pickerError, previewError] = await settled;
    expect(pickerError).toBeInstanceOf(Error);
    expect((pickerError as Error).message).toContain("owner changed");
    expect(previewError).toBeInstanceOf(Error);
    expect((previewError as Error).message).toContain("cancelled");
    expect(requests).toBe(0);
  });

  for (const convex of [false, true]) {
    test(`desktop ${convex ? "Convex storage" : "authenticated API"} response cannot start an obsolete download`, async () => {
      let current = true;
      const gate = deferred<void>();
      const effects: string[] = [];
      class OwnedUrl extends URL {
        static override createObjectURL() {
          effects.push("url");
          return "blob:receipt";
        }
      }
      const runtime = generatedFormHarness(
        desktopMessagingAttachmentContent("monorepo", convex),
        ["downloadDesktopAttachment"],
        {
          window: {
            desktopBridge: {
              apiUrl: backend,
              convexUrl: "https://storage.convex.cloud",
              convexStorageFetch: async () => {
                await gate.promise;
                return { body: [1], status: 200 };
              },
            },
          },
          desktopBridgeFetch: async () => {
            await gate.promise;
            return new Response("receipt");
          },
          URL: OwnedUrl,
          document: {
            createElement: () => {
              effects.push("anchor");
              return {};
            },
          },
        },
      ).module as unknown as Record<string, Callable>;
      const url = convex ? "https://storage.convex.cloud/api/storage/receipt" : attachmentUrl;
      const result = runtime.downloadDesktopAttachment!(url, "receipt.png", () => current);
      current = false;
      gate.resolve();
      await expect(result).rejects.toThrow("owner changed");
      expect(effects).toEqual([]);
    });
  }
});
