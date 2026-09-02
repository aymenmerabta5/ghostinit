/** Shared Better Auth 1.6 network and durable rate-limit policy. */

export const authNetworkSecurityHelpers = `type AuthRateLimitRule = {
  window: number;
  max: number;
};

type AuthNetworkSecurityPolicy = {
  trustedProxyHeaders: boolean;
  ipAddress: {
    ipAddressHeaders: string[];
    disableIpTracking: false;
  };
};

function isLocalAuthHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    (hostname.startsWith("127.") && isValidIpv4Address(hostname)) ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function requireCanonicalAuthOrigin(baseURL: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid absolute HTTP(S) origin");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("BETTER_AUTH_URL must use HTTP(S)");
  }
  if (
    baseURL !== baseURL.trim() ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    baseURL.includes("?") ||
    baseURL.includes("#") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "BETTER_AUTH_URL must be a canonical origin without credentials, path, query, or fragment",
    );
  }
  if (parsed.protocol !== "https:" && !isLocalAuthHostname(parsed.hostname)) {
    throw new Error("BETTER_AUTH_URL must use HTTPS unless it targets a loopback development host");
  }
  return parsed;
}

function isValidIpv4Address(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\\d{1,3}$/.test(part) &&
        (part === "0" || !part.startsWith("0")) &&
        Number(part) >= 0 &&
        Number(part) <= 255,
    )
  );
}

function isValidIpLiteral(value: string): boolean {
  if (!value || value !== value.trim() || value.includes(",")) return false;
  if (isValidIpv4Address(value)) return true;
  if (!value.includes(":") || /[^0-9a-fA-F:.]/.test(value)) return false;
  try {
    return new URL(\`http://[\${value}]/\`).hostname.length > 2;
  } catch {
    return false;
  }
}

function resolveAuthNetworkSecurity(
  baseURL: string,
  trustedProxyValue: string | undefined,
): AuthNetworkSecurityPolicy {
  const trustedProxyHeaders = trustedProxyValue === "true";
  const hostname = requireCanonicalAuthOrigin(baseURL).hostname;
  if (!trustedProxyHeaders && !isLocalAuthHostname(hostname)) {
    throw new Error(
      "TRUSTED_PROXY must be true for a non-local Better Auth URL, and the trusted proxy must overwrite X-Forwarded-For",
    );
  }
  return {
    trustedProxyHeaders,
    ipAddress: {
      ipAddressHeaders: trustedProxyHeaders ? ["x-forwarded-for"] : [],
      disableIpTracking: false,
    },
  };
}

function enforceTrustedAuthClientIp(
  request: Request,
  currentRule: AuthRateLimitRule,
  policy: AuthNetworkSecurityPolicy,
): AuthRateLimitRule {
  if (!policy.trustedProxyHeaders) return currentRule;
  const clientIp = request.headers.get("x-forwarded-for");
  if (!clientIp || !isValidIpLiteral(clientIp)) {
    throw new Error("The trusted proxy did not supply one valid X-Forwarded-For value");
  }
  return currentRule;
}`;

export const durableAuthRateLimitConfig = `  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/two-factor/*": (request) =>
        enforceTrustedAuthClientIp(
          request,
          { window: 60, max: 5 },
          authNetworkSecurity,
        ),
      "*": (request, currentRule) =>
        enforceTrustedAuthClientIp(request, currentRule, authNetworkSecurity),
    },
  },`;
