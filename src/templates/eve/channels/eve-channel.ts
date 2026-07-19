import { file, type TemplateFile } from "../../shared.js";

export function channelEve(_projectName: string): TemplateFile {
  return file(
    "apps/eve/agent/channels/eve.ts",
    `import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
export default eveChannel({ auth: [vercelOidc(), localDev()] });
`,
  );
}
