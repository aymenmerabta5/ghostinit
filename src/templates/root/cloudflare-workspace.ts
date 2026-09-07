import type { DeployTarget } from "../../lib/addons.js";
import { file, type TemplateFile } from "../shared.js";
import type { DeploymentProfile } from "./deploy.js";

function workspaceScriptContent(profile: DeploymentProfile): string {
  const mobile = profile.apps.includes("mobile");
  const desktop = profile.apps.includes("desktop");
  const requiredKeys = [
    ...(mobile && profile.database === "convex" ? ["EXPO_PUBLIC_CONVEX_URL"] : []),
    ...(mobile && profile.api ? ["EXPO_PUBLIC_API_URL"] : []),
    ...(mobile ? ["EXPO_PUBLIC_APP_URL"] : []),
    ...(mobile && profile.messaging ? ["EXPO_PUBLIC_WS_URL"] : []),
    ...(desktop ? ["DESKTOP_API_URL", "VITE_APP_URL"] : []),
    ...(desktop && profile.api ? ["VITE_API_URL"] : []),
    ...(desktop && profile.database === "convex" ? ["VITE_CONVEX_URL"] : []),
    ...(desktop && profile.messaging ? ["VITE_WS_URL"] : []),
  ];
  return `import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";

const action = process.argv[2];
if (action !== "build" && action !== "dev") throw new Error("Expected Cloudflare workspace action: build or dev");

const SYSTEM_KEYS = new Set([
  "APPDATA", "BUN_INSTALL", "CI", "COLORTERM", "COMSPEC", "FORCE_COLOR", "HOME",
  "HOMEDRIVE", "HOMEPATH", "HTTP_PROXY", "HTTPS_PROXY", "LOCALAPPDATA", "NO_COLOR",
  "NO_PROXY", "NODE_EXTRA_CA_CERTS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA", "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP",
  "TERM", "TMP", "TMPDIR", "USERPROFILE", "WINDIR",
]);
const REQUIRED_KEYS = ${JSON.stringify(requiredKeys)};
const HAS_MOBILE = ${JSON.stringify(mobile)};
const HAS_DESKTOP = ${JSON.stringify(desktop)};
const isNativePublicKey = (key) =>
  (HAS_MOBILE && key.startsWith("EXPO_PUBLIC_")) ||
  (HAS_DESKTOP && (key.startsWith("VITE_") || key === "DESKTOP_API_URL"));
const environment = {};
for (const [key, value] of Object.entries(process.env)) {
  if (SYSTEM_KEYS.has(key.toUpperCase()) || isNativePublicKey(key.toUpperCase())) environment[key] = value;
}
environment.NODE_ENV = action === "build" ? "production" : "development";

const localPaths = [
  resolve(process.cwd(), ".dev.vars"),
  resolve(process.cwd(), "apps/web/.dev.vars"),
];
const localInputs = localPaths.map((path) => {
  if (!existsSync(path)) return null;
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 * 1024) {
    throw new Error("Refusing unsafe Cloudflare workspace .dev.vars input");
  }
  return Object.entries(parseDotenv(readFileSync(path))).sort(([left], [right]) => left.localeCompare(right));
});
if ((localInputs[0] === null) !== (localInputs[1] === null)) {
  throw new Error("Root and web .dev.vars must either both exist or both be absent");
}
if (localInputs[0] && localInputs[1] && JSON.stringify(localInputs[0]) !== JSON.stringify(localInputs[1])) {
  throw new Error("Root and web .dev.vars files diverged; reconcile them before running workspace commands");
}
if (localInputs[0]) {
  for (const [key, value] of localInputs[0]) {
    // An explicit CI/shell value is authoritative for production. Local
    // defaults must never replace it with the loopback value in .dev.vars.
    if (isNativePublicKey(key.toUpperCase()) && environment[key] === undefined) {
      environment[key] = value;
    }
  }
}

const WEBSOCKET_KEYS = new Set(["EXPO_PUBLIC_WS_URL", "VITE_WS_URL"]);
function validatedEndpoint(key, required) {
  const value = environment[key];
  if (!value || value.includes("REPLACE_WITH_")) {
    if (required) throw new Error("Missing native build variable: " + key);
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid native build variable: " + key);
  }
  const websocket = WEBSOCKET_KEYS.has(key);
  if (url.username || url.password || url.search || url.hash || (!websocket && url.pathname !== "" && url.pathname !== "/")) {
    throw new Error("Native build variable must be an origin without credentials: " + key);
  }
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" || hostname === "[::]" || hostname === "[::1]" ||
    /^127(?:\\.|$)/.test(hostname) || /^\\[::ffff:(?:127\\.|7f[0-9a-f]{2}:)/.test(hostname);
  const productionProtocol = websocket ? "wss:" : "https:";
  const developmentProtocol = websocket ? "ws:" : "http:";
  if (action === "build" && (url.protocol !== productionProtocol || loopback)) {
    throw new Error("Production native build variable must use " + productionProtocol + " at a non-loopback endpoint: " + key);
  }
  if (action === "dev" && url.protocol !== productionProtocol && !(url.protocol === developmentProtocol && loopback)) {
    throw new Error("Development native variable must use " + productionProtocol + " or loopback " + developmentProtocol + ": " + key);
  }
}
for (const key of REQUIRED_KEYS) validatedEndpoint(key, action === "build");

function isRuntimeDotenvFileName(name) {
  const normalized = name.toLowerCase();
  if (!/^\\.env(?:$|\\.)/.test(normalized)) return false;
  if (normalized === ".env.example" || normalized === ".env.template") return false;
  if (/^\\.env\\.(?:[^.]+\\.)+(?:example|template)$/.test(normalized)) return false;
  return true;
}

const environmentRoots = [
  { path: process.cwd(), label: "." },
  ...(HAS_MOBILE ? [{ path: resolve(process.cwd(), "apps/mobile"), label: "apps/mobile" }] : []),
  ...(HAS_DESKTOP ? [{ path: resolve(process.cwd(), "apps/desktop"), label: "apps/desktop" }] : []),
  ...(action === "dev" ? [{ path: resolve(process.cwd(), "apps/web"), label: "apps/web" }] : []),
];
const unsafeEnvironmentEntries = [];
for (const root of environmentRoots) {
  const metadata = lstatSync(root.path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Unsafe Cloudflare workspace application root: " + root.label);
  }
  for (const entry of readdirSync(root.path, { withFileTypes: true })) {
    if (isRuntimeDotenvFileName(entry.name)) {
      unsafeEnvironmentEntries.push((root.label === "." ? "" : root.label + "/") + entry.name);
    }
  }
}
if (unsafeEnvironmentEntries.length > 0) {
  throw new Error("Refusing Cloudflare workspace build because runtime .env files can be bundled. Move local values to .dev.vars. Files: " + unsafeEnvironmentEntries.sort().join(", "));
}

const turboArgs = ["x", "--no-install", "turbo", "run", action];
if (action === "build") turboArgs.push("--filter=!web");
const result = spawnSync(process.execPath, turboArgs, {
  cwd: process.cwd(),
  env: environment,
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`;
}

export function cloudflareWorkspaceFiles(
  deploy: DeployTarget,
  profile?: Partial<DeploymentProfile>,
): TemplateFile[] {
  if (
    deploy !== "cloudflare" ||
    profile?.mode !== "monorepo" ||
    !profile.apps?.some((app) => app === "mobile" || app === "desktop")
  ) {
    return [];
  }
  return [
    file("scripts/cloudflare-workspace.mjs", workspaceScriptContent(profile as DeploymentProfile)),
  ];
}
