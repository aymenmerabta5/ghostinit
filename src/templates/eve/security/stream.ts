import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function eveAdmissionStreamFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  return file(
    `${base}/admission-stream.ts`,
    `import "server-only";
import {
  isValidEveRuntimeEventId,
  isValidEveRuntimeEventType,
} from "${serviceImport}";

const TERMINAL_SESSION_EVENTS = new Set([
  "session.waiting",
  "session.failed",
  "session.completed",
]);
const MAX_INSPECTED_EVENT_CHARS = 64 * 1024;

export interface TerminalEveEvent {
  readonly eventAt: Date;
  readonly eventId: string;
  readonly eventType: string;
}

export function terminalEveEvent(line: string): TerminalEveEvent | null {
  if (line.length === 0 || line.length > MAX_INSPECTED_EVENT_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const type = Reflect.get(parsed, "type");
  if (
    typeof type !== "string" ||
    !TERMINAL_SESSION_EVENTS.has(type) ||
    !isValidEveRuntimeEventType(type)
  ) {
    return null;
  }
  const meta = Reflect.get(parsed, "meta");
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const at = Reflect.get(meta, "at");
  const id = Reflect.get(meta, "id");
  if (typeof at !== "string") return null;
  if (typeof id !== "string" || !isValidEveRuntimeEventId(id)) return null;
  const eventAt = new Date(at);
  if (!Number.isFinite(eventAt.getTime())) return null;
  return {
    eventAt,
    eventId: id,
    eventType: type,
  };
}

export function terminalEveEventAt(line: string): Date | null {
  return terminalEveEvent(line)?.eventAt ?? null;
}
`,
  );
}
