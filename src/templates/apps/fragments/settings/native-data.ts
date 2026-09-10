import { settingsFeatureQueriesContent } from "./feature-data.js";

/** Native clients obtain canonical roles through their typed application boundary. */
export function nativeSettingsQueriesContent(hasApi: boolean): string {
  const base = settingsFeatureQueriesContent(hasApi, false);
  const start = base.indexOf("export function useSettingsIdentityQuery()");
  const end = base.indexOf("\nexport function identitySessionsQueryKey", start);
  const identity = `export function useSettingsIdentityQuery() {
  const session = identityClient.useSession();
${
  hasApi
    ? `  const scope = currentQueryAuthScope(useQueryClient());
  const options = orpc.me.queryOptions();
  const application = useQuery({ ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "settings-identity"], enabled: Boolean(scope) });`
    : ""
}
  return {
    user: ${hasApi ? "application.data?.user" : "session.data?.user"},
    isPending: ${hasApi ? "session.isPending || Boolean(session.data?.user && application.isPending)" : "session.isPending"},
    error: ${hasApi ? "session.error ?? application.error" : "session.error"},
    sessionId: session.data?.session.id,
    twoFactorEnabled: session.data?.user ? Reflect.get(session.data.user, "twoFactorEnabled") === true : false,
    retry: async () => { await Promise.all([session.refetch()${hasApi ? ", application.refetch()" : ""}]); },
  };
}
`;
  return (base.slice(0, start) + identity + (end < 0 ? "" : base.slice(end)))
    .replace('import { useQueryAuthSession } from "@/components/query-auth-boundary";\n', "")
    .replace(' && typeof window !== "undefined"', "");
}
