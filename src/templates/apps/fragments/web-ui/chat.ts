import { file, type TemplateFile } from "../../../shared.js";
import { chatPrimitiveModuleContents } from "../chat-primitives.js";

export function chatFiles(): TemplateFile[] {
  const root = "apps/web/src/components/ui";
  return chatPrimitiveModuleContents("@/lib/utils", "../button", "@/lib/translations").map(
    ({ content, path }) => file(`${root}/${path}`, content),
  );
}
