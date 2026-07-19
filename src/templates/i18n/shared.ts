import { file, type TemplateFile } from "../shared.js";

export function makeMessagesFile(filePath: string, obj: object): TemplateFile {
  return file(filePath, JSON.stringify(obj, null, 2) + "\n");
}
