import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

function authenticatedChannelContent(): string {
  return `import { eveChannel } from "eve/channels/eve";
import {
  verifyHttpBasic,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";

const PROXY_USERNAME = "ghostinit-web-proxy";

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  if (!value || value.length < 32 || value.startsWith("REPLACE_WITH")) return null;
  return value;
}

const proxyAuth: AuthFn<Request> = withAuthChallenges(
  (request) => {
    const password = configuredSecret();
    if (!password) return null;
    const result = verifyHttpBasic(request.headers.get("authorization"), {
      username: PROXY_USERNAME,
      password,
    });
    if (!result.ok) return null;
    return { ...result.sessionAuth, principalType: "service" };
  },
  [{ scheme: "Basic", parameters: { realm: "ghostinit-eve", charset: "UTF-8" } }],
);

export default eveChannel({
  auth: [proxyAuth],
  trustedForwarders: (forwarder) =>
    forwarder.authenticator === "http-basic" &&
    forwarder.principalId === PROXY_USERNAME &&
    forwarder.principalType === "service",
});
`;
}

function placeholderChannelContent(): string {
  return `import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth } from "eve/channels/auth";

// Browser auth is intentionally unavailable when the generated app has no
// identity capability. Local Eve development remains available; production
// fails closed until the application adds an explicit authenticator.
export default eveChannel({ auth: [localDev(), placeholderAuth()] });
`;
}

export function securedEveChannelFile(
  mode: ProjectMode,
  hasApplicationAuth: boolean,
): TemplateFile {
  return file(
    mode === "monorepo" ? "apps/eve/agent/channels/eve.ts" : "agent/channels/eve.ts",
    hasApplicationAuth ? authenticatedChannelContent() : placeholderChannelContent(),
  );
}
