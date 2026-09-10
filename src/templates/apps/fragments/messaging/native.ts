import type { TemplateFile } from "../../../shared.js";
import { nativeConvexMessagingDataFiles } from "./native-convex-data.js";
import { nativePostgresMessagingDataFiles } from "./native-postgres-data.js";
import { nativeMessagingViewFiles } from "./native-view.js";
import { nativeMessagingCommandFiles } from "./native-command-gate.js";
import {
  nativeMessagingMutationExtras,
  nativeMessagingQueryExtras,
  nativeMessagingWorkflowFiles,
} from "./native-workflows.js";

export function nativeMessagingFeatureFiles(
  target: "expo" | "desktop",
  database: "postgres" | "convex",
  mode: "single" | "monorepo",
  sourceRoot: string,
  hasI18n: boolean,
): TemplateFile[] {
  const root = `${sourceRoot}/features/messaging`;
  const alias = target === "desktop" && mode === "single" ? "@/renderer" : "@";
  const dataFiles =
    database === "convex"
      ? nativeConvexMessagingDataFiles(target, mode, root)
      : nativePostgresMessagingDataFiles(target, mode, root);
  return [
    ...dataFiles.map((entry) => ({
      ...entry,
      content:
        entry.content +
        (entry.path.endsWith("/queries.ts")
          ? nativeMessagingQueryExtras(target, alias, database)
          : entry.path.endsWith("/mutations.ts")
            ? nativeMessagingMutationExtras(target, alias, database)
            : ""),
    })),
    ...nativeMessagingWorkflowFiles(target, root),
    ...nativeMessagingCommandFiles(root, alias),
    ...nativeMessagingViewFiles(target, mode, root, database, hasI18n),
  ];
}
