import { file, type TemplateFile } from "../../../shared.js";
import {
  realtimeExpoClientContent,
  realtimeUnsupportedExpoClientContent,
} from "../realtime/index.js";
import { expoMessagingAttachmentContent } from "./native-attachments.js";
import { nativeMessagingFeatureFiles } from "./native.js";

type MessagingDatabase = "postgres" | "convex";
type MessagingMode = "monorepo" | "single";

export function expoMessagesScreenContent(
  _database: MessagingDatabase,
  _mode: MessagingMode,
  _hasI18n = false,
): string {
  return `import { MessagesScreen } from "@/features/messaging/screen";
export default MessagesScreen;
`;
}
export function expoConvexMessagingAdapterContent(mode: MessagingMode): string {
  return expoMessagingAttachmentContent(mode, "convex");
}
export function expoPostgresMessagingAdapterContent(mode: MessagingMode): string {
  return expoMessagingAttachmentContent(mode, "postgres");
}

export function nativeExpoMessagingFiles(
  database: MessagingDatabase,
  mode: MessagingMode,
  hasI18n = false,
): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/mobile/" : "";
  const files = [
    file(
      root + "src/adapters/messaging/" + database + ".ts",
      expoMessagingAttachmentContent(mode, database),
    ),
    file(root + "app/(app)/messages.tsx", expoMessagesScreenContent(database, mode, hasI18n)),
    ...nativeMessagingFeatureFiles("expo", database, mode, root + "src", hasI18n),
  ];
  if (database === "postgres")
    files.push(
      file(
        root + "src/lib/realtime.ts",
        mode === "single" ? realtimeUnsupportedExpoClientContent() : realtimeExpoClientContent(),
      ),
    );
  return files;
}
