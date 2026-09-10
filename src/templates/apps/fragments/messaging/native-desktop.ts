import { file, type TemplateFile } from "../../../shared.js";
import {
  realtimeDesktopClientContent,
  realtimeUnsupportedDesktopClientContent,
} from "../realtime/index.js";
import { desktopMessagingAttachmentContent } from "./native-attachments.js";
import { nativeMessagingFeatureFiles } from "./native.js";

type MessagingDatabase = "postgres" | "convex";
type MessagingMode = "monorepo" | "single";

export function desktopMessagesRouteContent(
  _database: MessagingDatabase,
  mode: MessagingMode,
  _hasI18n = false,
): string {
  const alias = mode === "monorepo" ? "@" : "@/renderer";
  return `import { createFileRoute } from "@tanstack/react-router";
import { MessagesScreen } from "${alias}/features/messaging/screen";
export const Route = createFileRoute("/messages")({ component: MessagesScreen });
`;
}
export function desktopConvexAdapterContent(mode: MessagingMode): string {
  return desktopMessagingAttachmentContent(mode, true);
}
export function desktopPostgresAdapterContent(mode: MessagingMode): string {
  return desktopMessagingAttachmentContent(mode);
}

export function nativeDesktopMessagingFiles(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/desktop/src/renderer" : "src/renderer";
  const files = [
    file(
      root + "/adapters/messaging/" + database + ".ts",
      desktopMessagingAttachmentContent(mode, database === "convex"),
    ),
    file(root + "/routes/messages.tsx", desktopMessagesRouteContent(database, mode, hasI18n)),
    ...nativeMessagingFeatureFiles("desktop", database, mode, root, hasI18n),
  ];
  if (database === "postgres")
    files.push(
      file(
        root + "/lib/realtime.ts",
        mode === "single"
          ? realtimeUnsupportedDesktopClientContent()
          : realtimeDesktopClientContent(),
      ),
    );
  return files;
}
