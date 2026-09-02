import { file, type TemplateFile } from "../../shared.js";

export function channelEve(_projectName: string): TemplateFile {
  return file(
    "apps/eve/agent/channels/eve.ts",
    `import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth } from "eve/channels/auth";

// The mode-aware application composer replaces this placeholder with the
// private web-facade policy when Better Auth is enabled. Standalone/template
// consumers remain fail-closed in production instead of trusting platform
// deployment identity as browser identity.
export default eveChannel({ auth: [localDev(), placeholderAuth()] });
`,
  );
}
