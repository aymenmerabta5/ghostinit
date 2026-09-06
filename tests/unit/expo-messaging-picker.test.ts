import { describe, expect, test } from "bun:test";
import { nativeExpoMessagingFiles } from "../../src/templates/apps/fragments/messaging/native-expo.js";

interface AttachmentDraft {
  uri: string;
  name: string;
  mimeType: string;
}

// expo-file-system 57.0.5 File.types.ts exposes this discriminated result shape.
// The native File payload is provided by the device; no native bridge is loaded in host tests.
type PickerResult =
  | { canceled: false; result: { uri: string; name: string; type: string } }
  | { canceled: true; result: null };

function loadGeneratedHelpers(
  database: "postgres" | "convex",
  platform: "ios" | "android",
  picked: PickerResult,
) {
  const source = nativeExpoMessagingFiles(database, "monorepo").find((file) =>
    file.path.endsWith(`/${database}.ts`),
  )!.content;
  const helpers = source
    .slice(
      source.indexOf("function apiUrl"),
      source.indexOf("export async function downloadNativeAttachment"),
    )
    .replaceAll("export async function", "async function");
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(helpers);
  const pickerArguments: unknown[] = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fileSystem = {
    async pickFileAsync(options: unknown) {
      pickerArguments.push(options);
      return picked;
    },
  };
  const fetcher = async (input: string, init?: RequestInit) => {
    requests.push({ url: input, init });
    if (input.startsWith("file:")) {
      return new Response("selected file bytes", { headers: { "Content-Type": "text/plain" } });
    }
    return Response.json({ attachmentId: "owned-attachment" });
  };
  const adapter = new Function(
    "File",
    "Platform",
    "authClient",
    "env",
    "fetch",
    executable + "; return { pickNativeAttachment, uploadNativeAttachment };",
  )(
    fileSystem,
    { OS: platform },
    { getCookie: () => "session=fixture-session" },
    { EXPO_PUBLIC_API_URL: "https://native.fixture.example" },
    fetcher,
  ) as {
    pickNativeAttachment(): Promise<AttachmentDraft | null>;
    uploadNativeAttachment(conversationId: string, draft: AttachmentDraft): Promise<string>;
  };
  return { adapter, pickerArguments, requests };
}

describe("generated Expo messaging file-picker contract", () => {
  for (const database of ["postgres", "convex"] as const) {
    for (const platform of ["ios", "android"] as const) {
      test(`${database}/${platform} unwraps the SDK result and uploads the selected file with session ownership`, async () => {
        const { adapter, pickerArguments, requests } = loadGeneratedHelpers(database, platform, {
          canceled: false,
          result: { uri: "file:///device/note.txt", name: "../note.txt", type: "text/plain" },
        });
        const selected = await adapter.pickNativeAttachment();
        expect(selected).toEqual({
          uri: "file:///device/note.txt",
          name: "note.txt",
          mimeType: "text/plain",
        });
        expect(pickerArguments).toEqual([{ multipleFiles: false }]);
        expect(await adapter.uploadNativeAttachment("owned-conversation", selected!)).toBe(
          "owned-attachment",
        );
        expect(requests.map((request) => request.url)).toEqual([
          "file:///device/note.txt",
          "https://native.fixture.example/api/messaging/attachments",
        ]);
        const upload = requests[1]!.init!;
        expect(upload.method).toBe("POST");
        expect(upload.credentials).toBe("include");
        expect(new Headers(upload.headers).get("cookie")).toBe("session=fixture-session");
        expect(new Headers(upload.headers).get("X-Ghostinit-Conversation-Id")).toBe(
          "owned-conversation",
        );
        const form = upload.body as FormData;
        expect(form.get("conversationId")).toBe("owned-conversation");
        const uploaded = form.get("file") as File;
        expect(uploaded.name).toBe("note.txt");
        expect(await uploaded.text()).toBe("selected file bytes");
      });

      test(`${database}/${platform} treats SDK cancellation as no attachment without making a request`, async () => {
        const { adapter, requests } = loadGeneratedHelpers(database, platform, {
          canceled: true,
          result: null,
        });
        expect(await adapter.pickNativeAttachment()).toBeNull();
        expect(requests).toEqual([]);
      });
    }
  }
});
